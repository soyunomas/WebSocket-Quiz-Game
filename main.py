# main.py
"""
Servidor principal de la aplicación QuizMaster Live usando FastAPI.

Define los endpoints HTTP (para crear partidas y servir HTML/JS) y el
endpoint WebSocket principal para manejar la comunicación en tiempo real
durante las partidas. Gestiona el diccionario global `active_games` que
almacena el estado de todas las partidas en curso. Delega la lógica
específica del juego al módulo `game_logic`.
"""
import json
import logging
import secrets
import string # <<< Añadido para el conjunto de caracteres
from typing import Dict, Optional

# Importaciones FastAPI y Pydantic
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

# Importar lógica del juego y modelos
# Las funciones de game_logic operarán sobre el diccionario active_games definido aquí.
from game_logic import (
     broadcast, handle_disconnect, handle_join_game, handle_next_question,
     handle_start_game, handle_submit_answer, send_personal_message,
     handle_game_over, load_quiz # load_quiz puede ser usado indirectamente por game_logic
)
from models import (
    Game, GameStateEnum, WebSocketMessage, ErrorPayload, QuizData,
    # Importar solo los modelos necesarios directamente en main si se usan aquí
    # o confiar en que game_logic los usa internamente.
)

# Configuración básica de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Estado Global del Servidor ---
# Diccionario que almacena todas las partidas activas, mapeando game_code -> Game object.
# Este diccionario es compartido y modificado por las funciones de game_logic.
active_games: Dict[str, Game] = {}
# ------------------------------------

# --- Constantes de Generación de Código ---
# <<< Añadido >>>
GAME_CODE_LENGTH = 4
GAME_CODE_CHARACTER_SET = string.ascii_uppercase + string.digits # A-Z, 0-9
MAX_CODE_GENERATION_ATTEMPTS = 10 # Límite de intentos para evitar bucles infinitos

# Crear instancia de la aplicación FastAPI
app = FastAPI(title="QuizMaster Live Server")

# --- Montar directorios estáticos para servir archivos CSS, JS, etc. ---
# Asume que tienes carpetas 'static' y 'js' en el mismo directorio que main.py
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/js", StaticFiles(directory="js"), name="js")

# --- Eventos de Ciclo de Vida del Servidor ---
@app.on_event("startup")
async def startup_event():
    """Acciones a realizar al iniciar el servidor."""
    logger.info("QuizMaster Live Server starting up.")
    logger.info("Static files mounted from './static' and './js'.")
    logger.info("WebSocket endpoint ready at /ws/{game_code}")
    logger.info("REST endpoint for game creation ready at POST /create_game/")


@app.on_event("shutdown")
async def shutdown_event():
    """Acciones a realizar al apagar el servidor."""
    logger.info("QuizMaster Live Server shutting down.")
    # Opcional: Podrías intentar notificar a los juegos activos, pero puede ser complejo.

# --- RUTA para /favicon.ico ---
@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    """Sirve el archivo favicon.ico desde la ubicación de iconos estáticos."""
    favicon_path = "static/icons/favicon.ico"
    try:
        return FileResponse(path=favicon_path, media_type="image/vnd.microsoft.icon")
    except FileNotFoundError:
         logger.warning(f"favicon.ico not found at expected path: {favicon_path}")
         raise HTTPException(status_code=404, detail="Favicon not found")
    except Exception as e:
        logger.error(f"Error serving favicon.ico: {e}")
        raise HTTPException(status_code=500, detail="Internal server error serving favicon")


# --- Endpoint REST para Crear una Nueva Partida ---
@app.post("/create_game/", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_game():
    """
    Crea una nueva 'sala' de juego (aún sin quiz ni jugadores).

    Genera un código de juego único de 4 caracteres alfanuméricos en mayúsculas.
    Crea un objeto `Game` inicial con estado LOBBY y lo almacena en el
    diccionario global `active_games`.

    Returns:
        Un diccionario JSON con la clave "game_code" y el código generado.
    Raises:
        HTTPException 500 si ocurre un error inesperado o no se puede generar código único.
    """
    logger.info("Received request to create a new game shell.")
    try:
        # --- MODIFICADO: Generación de código de 4 caracteres alfanuméricos ---
        attempts = 0
        while attempts < MAX_CODE_GENERATION_ATTEMPTS:
             game_code = ''.join(secrets.choice(GAME_CODE_CHARACTER_SET) for _ in range(GAME_CODE_LENGTH))
             if game_code not in active_games:
                 break # Código único encontrado
             attempts += 1
        else:
            # Si se superan los intentos, es un problema (quizás demasiados juegos activos para 4 chars?)
            logger.critical(f"Failed to generate a unique {GAME_CODE_LENGTH}-character game code after {MAX_CODE_GENERATION_ATTEMPTS} attempts!")
            raise HTTPException(status_code=500, detail=f"Internal server error: Could not generate unique game code. Too many active games?")

        logger.info(f"Generated unique {GAME_CODE_LENGTH}-character game code: {game_code}")
        # --------------------------------------------------------------------

        # Crear el objeto Game inicial (placeholder)
        new_game = Game(game_code=game_code, quiz_data=None) # Sin quiz cargado aún

        # Almacenar el nuevo juego en el diccionario global
        active_games[game_code] = new_game
        logger.info(f"Game shell for '{game_code}' created and stored. Current active games count: {len(active_games)}")

        # Devolver el código del juego creado
        return {"game_code": game_code}

    except Exception as e:
        # Captura tanto el HTTPException de generación de código como otros errores
        if isinstance(e, HTTPException): # Re-lanzar HTTPException para que FastAPI lo maneje
             raise e
        logger.exception(f"Unexpected error creating game shell: {e}") # Loggear el traceback completo
        raise HTTPException(status_code=500, detail="Internal server error during game creation.")


# --- Endpoint WebSocket Principal para la Jugabilidad ---
@app.websocket("/ws/{game_code_from_url}")
async def websocket_endpoint(websocket: WebSocket, game_code_from_url: str):
    """
    Maneja las conexiones WebSocket para una partida específica.

    Valida el `game_code` (ahora de 4 caracteres), acepta la conexión si el
    juego existe, y entra en un bucle para recibir y procesar mensajes JSON
    del cliente. Delega el manejo de cada tipo de mensaje a las funciones
    correspondientes en `game_logic`. Maneja la desconexión del cliente
    llamando a `handle_disconnect`.

    Args:
        websocket: La conexión WebSocket entrante.
        game_code_from_url: El código de la partida (4 caracteres) extraído de la URL.
    """
    client_host = websocket.client.host
    client_port = websocket.client.port
    logger.info(f"WebSocket connection attempt from {client_host}:{client_port} for game code '{game_code_from_url}'")

    # --- MODIFICADO: Normalización sigue siendo importante (a mayúsculas) ---
    # Asegura que 'aBc1' se trate igual que 'ABC1'
    game_code = game_code_from_url.strip().upper()
    # Opcional: Añadir validación explícita de longitud y caracteres si se desea ser más estricto
    # if len(game_code) != GAME_CODE_LENGTH or not all(c in GAME_CODE_CHARACTER_SET for c in game_code):
    #    logger.warning(f"Invalid game code format received: '{game_code_from_url}'. Rejecting.")
    #    # ... código de rechazo ...
    #    return
    # --------------------------------------------------------------------

    # Buscar la partida en el diccionario global
    game = active_games.get(game_code)

    if not game:
        # Si el juego no existe, rechazar la conexión WebSocket
        logger.warning(f"Game code '{game_code}' not found. Rejecting WebSocket connection from {client_host}:{client_port}.")
        await websocket.accept() # Aceptar para poder enviar mensaje de error
        try:
            await websocket.send_text(WebSocketMessage(
                type="error",
                payload=ErrorPayload(message="Código de partida no encontrado.", code="INVALID_GAME_CODE")
            ).model_dump_json())
        except Exception:
            pass # Ignorar errores si el cliente ya cerró al recibir el accept
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION) # Código de cierre por política
        return
    else:
        # Juego encontrado, aceptar la conexión
        logger.info(f"Game '{game_code}' found. Accepting WebSocket connection from {client_host}:{client_port}")
        await websocket.accept()
        # Añadir la conexión a la lista general de conexiones activas del juego
        # game.active_connections.append(websocket) # Se hace en handle_join_game ahora


    has_joined = False # Flag para asegurar que el primer mensaje sea 'join_game'
    player_nickname = "Unknown" # Para logging antes del join

    try:
        # Bucle principal para recibir mensajes del cliente conectado
        while True:
            raw_data = await websocket.receive_text()
            # Intentar parsear el mensaje JSON
            try:
                data = json.loads(raw_data)
                message = WebSocketMessage.model_validate(data) # Validar estructura básica
                message_type = message.type
                payload = message.payload or {} # Usar diccionario vacío si no hay payload

                # Loggear mensaje recibido (cuidado con payloads muy grandes en producción)
                # logger.debug(f"Game {game_code} | Rx from {player_nickname} ({client_host}): Type='{message_type}', Payload={payload}")

                # --- Enrutamiento de Mensajes ---

                # 1. Mensaje 'join_game': Debe ser el primero
                if message_type == "join_game":
                    if not has_joined:
                        # Pasar el diccionario global `active_games` a la función de lógica
                        await handle_join_game(active_games, game, websocket, payload)
                        # Verificar si el join fue exitoso (si el websocket está ahora en players)
                        if websocket in game.players:
                            has_joined = True
                            player_nickname = game.players[websocket].nickname # Actualizar para logs
                            logger.info(f"Player '{player_nickname}' successfully joined game {game_code}.")
                        else:
                            # Join falló la validación interna en handle_join_game
                            logger.warning(f"Join attempt failed validation for {client_host} in game {game_code}. Connection might be closed by handler.")
                            # El handler ya debería haber cerrado si falló la validación crítica
                    else:
                        # Ignorar intentos de join duplicados
                        logger.warning(f"Duplicate join attempt from {player_nickname} ({client_host}) in game {game_code}. Ignoring.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Ya te has unido a la partida.")))
                    continue # Procesado el mensaje 'join_game', esperar el siguiente

                # 2. Comprobar si el cliente ya se ha unido para otros mensajes
                if not has_joined:
                    logger.warning(f"Received message '{message_type}' before joining game {game_code} from {client_host}. Closing connection.")
                    await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Debes unirte ('join_game') primero.")))
                    await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA) # Código por datos no aceptables
                    break # Salir del bucle receive

                # 3. Determinar si el remitente es el host (solo después de unirse)
                is_host = (game.host_connection == websocket)

                # --- Enrutamiento para Clientes ya Unidos ---

                if message_type == "load_quiz_data":
                    if not is_host:
                        logger.warning(f"Non-host '{player_nickname}' tried to load quiz data in game {game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede cargar datos del cuestionario.")))
                    elif game.state != GameStateEnum.LOBBY:
                        logger.warning(f"Host '{player_nickname}' tried to load quiz data in wrong state ({game.state}) for game {game.game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="No se pueden cargar datos del cuestionario una vez iniciada la partida.")))
                    else:
                        logger.info(f"Host '{player_nickname}' attempting to load quiz data via WebSocket for game {game_code}.")
                        try:
                            # Asumir que el payload es el QuizData completo en formato dict/json
                            loaded_quiz = QuizData.model_validate(payload)
                            game.quiz_data = loaded_quiz # Asignar al estado del juego
                            logger.info(f"Successfully validated and loaded quiz data for game {game_code} via WebSocket. Title: '{loaded_quiz.title}', Questions: {len(loaded_quiz.questions)}")
                            # Confirmar al host que se cargó
                            await send_personal_message(websocket, WebSocketMessage(type="quiz_loaded_ack", payload={"title": loaded_quiz.title, "question_count": len(loaded_quiz.questions)}))
                        except ValidationError as e:
                            logger.error(f"Invalid quiz data received via WebSocket from host '{player_nickname}' in game {game_code}: {e}")
                            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Formato de cuestionario inválido.")))
                        except Exception as e:
                            logger.exception(f"Error processing load_quiz_data for game {game_code}: {e}")
                            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno al cargar el cuestionario.")))

                elif message_type == "start_game":
                    if is_host:
                        logger.info(f"Host '{player_nickname}' requested to start game {game_code}.")
                        await handle_start_game(active_games, game, websocket)
                    else:
                        logger.warning(f"Non-host '{player_nickname}' tried to start game {game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede iniciar la partida.")))

                elif message_type == "submit_answer":
                     if not is_host: # El host no debería enviar respuestas
                         await handle_submit_answer(game, websocket, payload)
                     else:
                         logger.warning(f"Host '{player_nickname}' attempted to submit an answer in {game_code}. Ignored.")
                         # Opcional: enviar error al host
                         # await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="El anfitrión no participa respondiendo.")))

                elif message_type == "next_question": # El host pide avanzar
                    if is_host:
                        logger.info(f"Host '{player_nickname}' requested next stage for game {game_code}.")
                        await handle_next_question(active_games, game, websocket)
                    else:
                        logger.warning(f"Non-host '{player_nickname}' tried to advance question in game {game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede avanzar la partida.")))

                elif message_type == "end_game": # El host pide terminar prematuramente
                    if is_host:
                        logger.info(f"Host '{player_nickname}' requested to manually end game {game_code}.")
                        await handle_game_over(active_games, game)
                    else:
                        logger.warning(f"Non-host '{player_nickname}' tried to end game {game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede finalizar la partida.")))

                else:
                    # Mensaje no reconocido
                    logger.warning(f"Unknown message type '{message_type}' received in game {game_code} from {player_nickname} ({client_host}).")
                    await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message=f"Tipo de mensaje desconocido: '{message_type}'")))

            # Manejo de Errores en la Recepción/Procesamiento del Mensaje
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received in game {game_code} from {player_nickname} ({client_host}). Closing connection.")
                # Intentar enviar error antes de cerrar
                try:
                    await websocket.send_text(WebSocketMessage(type="error", payload=ErrorPayload(message="Mensaje JSON inválido.")).model_dump_json())
                except Exception: pass
                await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                break # Salir del bucle receive
            except ValidationError as ve:
                 # Error si la estructura básica del WebSocketMessage (type/payload) falla
                 logger.error(f"Invalid WebSocket message structure in game {game_code} from {player_nickname} ({client_host}): {ve}. Closing connection.")
                 try:
                     await websocket.send_text(WebSocketMessage(type="error", payload=ErrorPayload(message=f"Estructura de mensaje inválida: {ve}")).model_dump_json())
                 except Exception: pass
                 await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                 break # Salir del bucle receive
            except Exception as e:
                # Capturar cualquier otro error inesperado durante el procesamiento del mensaje
                logger.exception(f"Unhandled error processing message in game {game_code} from {player_nickname} ({client_host}): {e}")
                # Intentar notificar al cliente si es posible
                try:
                    await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno del servidor al procesar el mensaje.")))
                except Exception: pass
                # No necesariamente cerramos la conexión por errores internos,
                # pero podríamos considerarlo si son graves.

    # Manejo de Desconexión del Cliente (esperada o por error)
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {player_nickname} ({client_host}:{client_port}) from game: {game_code}.")
        # Llamar a la lógica de limpieza, pasando el diccionario global
        await handle_disconnect(active_games, game_code, websocket)
    except Exception as e:
        # Error inesperado en el bucle principal de WebSocket (no en el procesamiento de un mensaje)
        logger.exception(f"Unhandled error in WebSocket connection loop for game {game_code}, client {player_nickname} ({client_host}:{client_port}): {e}")
        # Asegurarse de llamar a la limpieza también en este caso
        await handle_disconnect(active_games, game_code, websocket)
        # Intentar cerrar la conexión si aún está abierta
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:
            pass


# --- Endpoints HTML para Servir las Interfaces de Usuario ---

@app.get("/", response_class=HTMLResponse)
async def get_player_client():
    """Sirve el archivo HTML principal para el cliente/jugador."""
    try:
        with open("index.html", "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
         logger.error("Client interface file 'index.html' not found.")
         return HTMLResponse(content="<h1>Error: Archivo de interfaz de jugador no encontrado.</h1>", status_code=404)

@app.get("/host.html", response_class=HTMLResponse)
async def get_host_client():
    """Sirve el archivo HTML para la interfaz del anfitrión (host)."""
    try:
        with open("host.html", "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
         logger.error("Host interface file 'host.html' not found.")
         return HTMLResponse(content="<h1>Error: Archivo de interfaz de anfitrión no encontrado.</h1>", status_code=404)


# --- Punto de Entrada para Ejecutar el Servidor (si se corre directamente) ---
if __name__ == "__main__":
    import uvicorn
    print("Starting QuizMaster Live server using Uvicorn...")
    # Ejecutar el servidor con Uvicorn
    # reload=False es importante para producción o cuando no se necesita recarga automática
    # host="0.0.0.0" permite conexiones desde otras máquinas en la red
    # port=8000 es el puerto estándar para desarrollo web
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
