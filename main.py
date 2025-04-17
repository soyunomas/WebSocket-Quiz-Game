# main.py
import json
import logging
import secrets
from typing import Dict, Optional

# Importaciones FastAPI y Pydantic
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

# Importar lógica y modelos (SIN active_games)
from game_logic import (
     broadcast, handle_disconnect,
    handle_join_game, handle_next_question,
    handle_start_game, handle_submit_answer, load_quiz,
    send_personal_message,
    handle_game_over,
    loaded_quizzes
)
from models import (
    Game, GameStateEnum, WebSocketMessage, ErrorPayload, QuizData,
    JoinAckPayload, JoinGamePayload, NewQuestionPayload,
    Player, PlayerJoinedPayload, Question,
    ScoreboardEntry, SubmitAnswerPayload,
    UpdateScoreboardPayload, AnswerResultPayload,
    GameOverPayload, GameStartedPayload, PlayerLeftPayload
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- DEFINICIÓN GLOBAL EN MAIN.PY ---
active_games: Dict[str, Game] = {}
# ------------------------------------

app = FastAPI(title="QuizMaster Live Server")

# --- Montar directorios estáticos ---
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/js", StaticFiles(directory="js"), name="js")


# --- Server Initialization ---
@app.on_event("startup")
async def startup_event():
    logger.info("Server startup.")


# --- REST Endpoint for Creating Game (CON LOGS DE DEBUG ADICIONALES) ---
@app.post("/create_game/", status_code=status.HTTP_201_CREATED, response_model=dict)
async def create_game():
    logger.info("Received request to create a new game shell.")
    try:
        # Generar código único AQUI usando el active_games local
        while True:
             game_code = secrets.token_hex(3).upper()
             if game_code not in active_games:
                 break

        logger.info(f"[CREATE] Generated and uppercased game code: {game_code}")
        logger.debug(f"Creating placeholder Game object for code {game_code}")
        new_game = Game(game_code=game_code, quiz_data=None)

        # ----- LOGGING INTENSO -----
        logger.info(f"!!!!!! [CREATE] BEFORE adding {game_code}. Keys: {list(active_games.keys())}")
        active_games[game_code] = new_game # Guarda en el active_games de main.py
        logger.info(f"!!!!!! [CREATE] AFTER adding {game_code}. Keys: {list(active_games.keys())}")
        # --------------------------

        logger.info(f"[CREATE] Stored game '{game_code}'. Current active_games keys: {list(active_games.keys())}") # Log anterior

        # ----- LOGGING ANTES DE RETORNAR -----
        logger.info(f"!!!!!! [CREATE] BEFORE RETURN for {game_code}. Keys: {list(active_games.keys())}")
        # -----------------------------------
        return {"game_code": game_code}
    except Exception as e:
        logger.exception(f"Unexpected error creating game shell: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during game shell creation.")


# --- Main WebSocket Endpoint (CON LOGS DE DEBUG ADICIONALES) ---
# Usar un nombre diferente para el parámetro de ruta temporalmente para evitar confusiones
@app.websocket("/ws/{game_code_from_url}")
async def websocket_endpoint(websocket: WebSocket, game_code_from_url: str):
    # ----- LOGGING AL ENTRAR -----
    logger.info(f"!!!!!! [WS] ENDPOINT START. Param: {game_code_from_url}. Initial active_games keys: {list(active_games.keys())}")
    # ----------------------------

    received_code = game_code_from_url
    logger.info(f"[WS] Connection attempt for raw code: '{received_code}'") # Log anterior
    game_code = received_code.upper()
    logger.info(f"[WS] Attempting lookup with uppercased code: '{game_code}'") # Log anterior
    logger.info(f"[WS] Current active_games keys before lookup: {list(active_games.keys())}") # Log anterior

    # Busca en el active_games definido en main.py
    game = active_games.get(game_code)

    if not game:
        logger.error(f"[WS] Game lookup FAILED for code '{game_code}'. active_games keys: {list(active_games.keys())}") # Log anterior
        logger.warning(f"Connection attempt to non-existent game: {game_code}")
        await websocket.accept()
        try: await websocket.send_text(WebSocketMessage(type="error", payload=ErrorPayload(message="Código de partida no encontrado.", code="INVALID_GAME_CODE")).model_dump_json())
        except Exception: pass
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    else:
         logger.info(f"[WS] Game lookup SUCCEEDED for code '{game_code}'.")

    await websocket.accept()
    logger.info(f"WebSocket connection accepted for game: {game_code} from {websocket.client.host}:{websocket.client.port}")

    has_joined = False
    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
                message_type = data.get("type")
                payload = data.get("payload", {})
                if not message_type: raise ValueError("Message type is missing")

                logger.debug(f"Game {game_code} | Received from {websocket.client.host}: Type='{message_type}', Payload={payload}")

                # --- Message Routing (pasando active_games donde sea necesario) ---
                if message_type == "join_game": # ... (sin cambios aquí, ya pasa active_games) ...
                    if not has_joined:
                         await handle_join_game(active_games, game, websocket, payload)
                         if websocket in game.players or websocket == game.host_connection: has_joined = True
                         else: logger.warning(f"Join attempt failed validation for {websocket.client.host} in game {game_code}.")
                    else:
                         logger.warning(f"Duplicate join attempt in game {game_code}. Ignoring.")
                         await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Ya te has unido a la partida.")))
                    continue

                if not has_joined: # ... (sin cambios aquí) ...
                    logger.warning(f"Received message '{message_type}' before joining game {game_code}. Closing.")
                    await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Debes unirte ('join_game') primero.")))
                    await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                    break

                is_host = (websocket == game.host_connection)

                if message_type == "load_quiz_data": # ... (sin cambios aquí) ...
                    if not is_host:
                        logger.warning(f"Non-host tried to load quiz data in game {game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede cargar datos del cuestionario.")))
                        continue
                    if game.state != GameStateEnum.LOBBY:
                        logger.warning(f"Host tried to load quiz data in wrong state ({game.state}) for game {game.game_code}.")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="No se pueden cargar datos del cuestionario una vez iniciada la partida.")))
                        continue
                    logger.info(f"Host attempting to load quiz data via WebSocket for game {game_code}.")
                    try:
                        loaded_quiz = QuizData.model_validate(payload)
                        game.quiz_data = loaded_quiz
                        logger.info(f"Successfully loaded quiz data for game {game_code} via WebSocket. Title: '{loaded_quiz.title}', Questions: {len(loaded_quiz.questions)}")
                        await send_personal_message(websocket, WebSocketMessage(type="quiz_loaded_ack", payload={"title": loaded_quiz.title, "question_count": len(loaded_quiz.questions)}))
                    except ValidationError as e:
                        logger.error(f"Invalid quiz data received via WebSocket from host in game {game_code}: {e}")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Formato de cuestionario inválido.")))
                    except Exception as e:
                        logger.exception(f"Error processing load_quiz_data for game {game_code}: {e}")
                        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno al cargar el cuestionario.")))

                elif message_type == "start_game": # ... (sin cambios aquí, ya pasa active_games) ...
                    if is_host:
                        await handle_start_game(active_games, game, websocket)
                    else: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede iniciar.")))

                elif message_type == "submit_answer": # ... (sin cambios aquí) ...
                     if not is_host:
                         await handle_submit_answer(game, websocket, payload)
                     else: logger.warning(f"Host tried to submit answer in {game_code}")

                elif message_type == "next_question": # ... (sin cambios aquí, ya pasa active_games) ...
                    if is_host:
                        await handle_next_question(active_games, game, websocket)
                    else: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede avanzar.")))

                elif message_type == "end_game": # ... (sin cambios aquí, ya pasa active_games) ...
                    if is_host:
                        logger.info(f"Host manually ending game {game_code}")
                        await handle_game_over(active_games, game)
                    else: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede finalizar.")))

                else: # ... (sin cambios aquí) ...
                    logger.warning(f"Unknown message type '{message_type}' received in game {game_code}.")
                    await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message=f"Tipo de mensaje '{message_type}' no reconocido.")))

            except json.JSONDecodeError: # ... (sin cambios aquí) ...
                logger.error(f"Invalid JSON received in game {game_code}. Closing connection {websocket.client.host}.")
                try: await websocket.send_text(WebSocketMessage(type="error", payload=ErrorPayload(message="Mensaje JSON inválido.")).model_dump_json())
                except: pass
                await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                break
            except ValueError as ve: # ... (sin cambios aquí) ...
                 logger.error(f"Invalid message structure in game {game_code}: {ve}. Closing connection {websocket.client.host}.")
                 try: await websocket.send_text(WebSocketMessage(type="error", payload=ErrorPayload(message=f"Mensaje inválido: {ve}")).model_dump_json())
                 except: pass
                 await websocket.close(code=status.WS_1003_UNSUPPORTED_DATA)
                 break
            except Exception as e: # ... (sin cambios aquí) ...
                logger.exception(f"Unhandled error processing message in game {game_code} from {websocket.client.host}: {e}")
                try: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno del servidor.")))
                except: pass

    except WebSocketDisconnect: # ... (sin cambios aquí, ya pasa active_games) ...
        logger.info(f"WebSocket disconnected: {websocket.client.host} from game: {game_code}.")
        await handle_disconnect(active_games, game_code, websocket)
    except Exception as e: # ... (sin cambios aquí, ya pasa active_games) ...
        logger.exception(f"Unhandled error in WebSocket connection loop for game {game_code}, client {websocket.client.host}: {e}")
        await handle_disconnect(active_games, game_code, websocket)
        try: await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except: pass


# --- HTML Endpoints ---
@app.get("/", response_class=HTMLResponse) # ... (sin cambios aquí) ...
async def get_player_client():
    try:
        with open("index.html", "r", encoding="utf-8") as f: html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
         logger.error("index.html not found.")
         return HTMLResponse(content="<h1>Error: index.html not found.</h1>", status_code=404)

@app.get("/host.html", response_class=HTMLResponse) # ... (sin cambios aquí) ...
async def get_host_client():
    try:
        with open("host.html", "r", encoding="utf-8") as f: html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
         logger.error("host.html not found.")
         return HTMLResponse(content="<h1>Error: host.html not found.</h1>", status_code=404)


# --- Run Server ---
if __name__ == "__main__":
    import uvicorn
    # ASEGÚRATE DE QUE reload ES False
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
