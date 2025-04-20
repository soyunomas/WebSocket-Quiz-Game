# game_logic.py
"""
Contiene la lógica principal del juego de Quiz.

Maneja el estado de las partidas, las acciones de los jugadores (unirse, responder),
el flujo del juego (inicio, preguntas, marcador, fin), y la comunicación
a través de WebSockets (broadcast, mensajes personales). No gestiona directamente
la creación de partidas ni las conexiones WebSocket iniciales (eso está en main.py),
pero opera sobre el diccionario `active_games` compartido.
"""
import asyncio
import json
import logging
import secrets
import time
from typing import Dict, List, Optional, Set
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

# Importar modelos actualizados desde models.py
from models import (
    AnswerRecord, ErrorPayload, Game, GameStateEnum, JoinAckPayload,
    JoinGamePayload, NewQuestionPayload, Player, PlayerJoinedPayload, Question,
    QuizData, Option, ScoreboardEntry, SubmitAnswerPayload,
    UpdateScoreboardPayload, WebSocketMessage, AnswerResultPayload,
    GameOverPayload, GameStartedPayload, PlayerLeftPayload, OptionData,
    QuestionData # Importar también los Data para get_current_question
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache opcional para datos de quizzes cargados desde archivo.
# El diccionario `active_games` se define y gestiona en main.py.
loaded_quizzes: Dict[str, QuizData] = {}

# --- Constantes ---
AUTO_ADVANCE_DELAY = 5 # Segundos a esperar en el marcador antes de avanzar automáticamente

# --- Funciones Auxiliares ---

def load_quiz(quiz_id: str) -> Optional[QuizData]:
    """
    Carga los datos de un Quiz desde un archivo JSON simulado o desde caché.

    Busca primero en la caché `loaded_quizzes`. Si no lo encuentra, intenta
    abrir un archivo llamado `quiz_{quiz_id}.json`. Valida los datos
    usando el modelo Pydantic `QuizData`.

    Args:
        quiz_id: El identificador del quiz a cargar.

    Returns:
        Un objeto QuizData si la carga y validación son exitosas, None en caso contrario.
    """
    if quiz_id in loaded_quizzes:
        logger.debug(f"Quiz '{quiz_id}' found in cache.")
        return loaded_quizzes[quiz_id]
    try:
        # Asume una convención de nombres simple para los archivos de quiz
        file_path = f"quiz_{quiz_id}.json"
        logger.info(f"Attempting to load quiz '{quiz_id}' from file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Validación opcional del ID dentro del archivo
            if data.get("id") and data.get("id") != quiz_id:
                 logger.warning(f"Quiz ID mismatch in {file_path}. Expected '{quiz_id}', found '{data.get('id')}'")
            # Validar y parsear con Pydantic
            quiz = QuizData.model_validate(data) # Pydantic v2+
            loaded_quizzes[quiz.id] = quiz # Añadir a caché
            logger.info(f"Quiz '{quiz.id}' loaded and cached successfully.")
            return quiz
    except FileNotFoundError:
        logger.error(f"Quiz file not found for ID '{quiz_id}' at path: {file_path}")
        return None
    except json.JSONDecodeError:
        logger.error(f"Error decoding JSON for quiz '{quiz_id}' from path: {file_path}")
        return None
    except ValidationError as e:
        logger.error(f"Validation error loading quiz '{quiz_id}' from {file_path}: {e}")
        return None
    except Exception as e:
        # Captura cualquier otro error inesperado durante la carga
        logger.exception(f"Unexpected error loading quiz '{quiz_id}': {e}")
        return None

def get_current_question(game: Game) -> Optional[Question]:
    """
    Obtiene y procesa la pregunta actual del juego según su índice.

    Extrae la `QuestionData` del `quiz_data` del juego, asigna IDs únicos
    a las opciones si no los tienen, identifica el ID de la respuesta correcta
    y lo almacena en `game.current_correct_answer_id`.

    Args:
        game: El objeto Game cuyo estado se está consultando.

    Returns:
        Un objeto `Question` procesado y listo para enviar, o None si el índice
        es inválido, falta `quiz_data` o hay un error al procesar la pregunta.
    """
    if not game.quiz_data:
        logger.error(f"Attempted to get question for game {game.game_code} but quiz_data is None.")
        return None
    if not (0 <= game.current_question_index < len(game.quiz_data.questions)):
        logger.debug(f"Invalid question index {game.current_question_index} for game {game.game_code}. (Likely end of game or error).")
        return None # Puede ser fin del juego o un índice erróneo

    q_data: QuestionData = game.quiz_data.questions[game.current_question_index]
    processed_options: List[Option] = []
    correct_id: Optional[str] = None
    processed_ids: Set[str] = set() # Para asegurar IDs únicos dentro de la pregunta

    for opt_data in q_data.options:
        option_id = opt_data.id
        # Generar ID si falta o si ya existe (colisión improbable pero posible)
        if not option_id or option_id in processed_ids:
            option_id = f"opt_{secrets.token_hex(3)}"
            while option_id in processed_ids:
                option_id = f"opt_{secrets.token_hex(3)}" # Regenerar en caso de colisión
        processed_ids.add(option_id)

        processed_options.append(Option(id=option_id, text=opt_data.text))

        if opt_data.is_correct:
            if correct_id is not None:
                # Loggear error si hay múltiples correctas, pero continuar con la primera
                logger.error(f"Multiple correct options found for question '{q_data.text}' in game {game.game_code}. Using first found: {correct_id}.")
            else:
                correct_id = option_id

    if correct_id is None:
        logger.error(f"No correct option found for question '{q_data.text}' in game {game.game_code}. Cannot proceed with this question.")
        return None # No se puede proceder sin una respuesta correcta definida

    # Almacenar el ID correcto en el estado del juego para usarlo en handle_submit_answer
    game.current_correct_answer_id = correct_id
    # Asegurar un ID para la pregunta si no lo tiene
    question_id = q_data.id or f"q_{secrets.token_hex(4)}"

    return Question(
        id=question_id,
        text=q_data.text,
        options=processed_options,
        correct_answer_id=correct_id, # Se necesita internamente, pero no se envía en NewQuestionPayload
        time_limit=q_data.time_limit
    )

def calculate_points(start_time: float, answer_time: float, time_limit: int, base_points: int = 1000) -> int:
    """
    Calcula los puntos para una respuesta correcta basada en el tiempo.

    Cuanto más rápido se responda (dentro del límite), más puntos se obtienen.
    Utiliza una fórmula de decaimiento lineal.

    Args:
        start_time: Timestamp (time.time()) de cuándo se mostró la pregunta.
        answer_time: Timestamp (time.time()) de cuándo se recibió la respuesta.
        time_limit: Tiempo máximo en segundos permitido para responder.
        base_points: Puntuación máxima posible por responder instantáneamente.

    Returns:
        Los puntos calculados (int). 0 si se superó el tiempo límite o si
        el tiempo de respuesta es anterior al de inicio (error).
    """
    time_taken = answer_time - start_time
    if time_taken < 0:
        logger.warning(f"Negative time_taken ({time_taken:.2f}s) detected. Awarding 0 points.")
        time_taken = time_limit # Tratar como si hubiera excedido el tiempo
    if time_taken >= time_limit:
        return 0 # No hay puntos si se acabó el tiempo

    # Factor de puntuación: 1.0 para tiempo 0, disminuyendo linealmente hasta ~0.1 cerca del límite
    # Se asegura un mínimo de 0.1 para que respuestas muy tardías pero correctas den algo
    factor = max(0.1, 1.0 - (time_taken / time_limit))
    return int(base_points * factor)

# <<< FUNCIÓN RESTAURADA >>>
def get_scoreboard(game: Game) -> List[ScoreboardEntry]:
    """
    Genera la lista de puntuaciones (marcador) ordenada de la partida (INCLUYE HOST).
    Args:
        game: El objeto Game del cual extraer los jugadores y sus puntuaciones.
    Returns:
        Una lista de objetos ScoreboardEntry, ordenada por puntuación descendente.
    """
    valid_players: List[Player] = [p for p in game.players.values() if p]
    sorted_players = sorted(valid_players, key=lambda p: p.score, reverse=True)
    scoreboard = [
        ScoreboardEntry(rank=i + 1, nickname=p.nickname, score=p.score)
        for i, p in enumerate(sorted_players)
    ]
    return scoreboard

def get_real_player_count(game: Game) -> int:
    """Calcula el número de jugadores reales (excluyendo al host)."""
    host_conn = game.host_connection
    return sum(1 for ws, player in game.players.items() if ws != host_conn and player is not None)

def get_player_only_scoreboard(game: Game) -> List[ScoreboardEntry]:
    """
    Genera la lista de puntuaciones ordenada excluyendo al host.
    """
    host_conn = game.host_connection
    # Filtrar solo jugadores reales (no el host)
    real_players: List[Player] = [p for ws, p in game.players.items() if p and ws != host_conn]

    # Ordenar jugadores reales por puntuación (mayor a menor)
    sorted_players = sorted(real_players, key=lambda p: p.score, reverse=True)

    # Crear las entradas del marcador con el rango basado solo en jugadores reales
    scoreboard = [
        ScoreboardEntry(rank=i + 1, nickname=p.nickname, score=p.score)
        for i, p in enumerate(sorted_players)
    ]
    return scoreboard

# --- Funciones de Comunicación WebSocket ---

async def broadcast(games_dict: Dict[str, Game], game_code: str, message: WebSocketMessage, exclude_connection: Optional[WebSocket] = None):
    """
    Envía un mensaje WebSocket a todos los participantes activos de una partida.

    Busca la partida en `games_dict` y envía el mensaje JSON serializado a
    cada conexión en `game.active_connections`, excepto a la especificada en
    `exclude_connection` (si se proporciona).

    Args:
        games_dict: El diccionario global de partidas activas.
        game_code: El código de la partida a la que enviar el broadcast.
        message: El objeto WebSocketMessage a enviar.
        exclude_connection: Conexión WebSocket opcional a excluir del broadcast.
    """
    if game_code in games_dict:
        game = games_dict[game_code]
        message_json = message.model_dump_json() # Pydantic v2+
        # Copiar la lista para evitar problemas si se modifica durante la iteración
        connections_to_send = list(game.active_connections)
        for connection in connections_to_send:
            if connection != exclude_connection:
                try:
                    await connection.send_text(message_json)
                except WebSocketDisconnect:
                    # Loggear pero no interrumpir el broadcast para otros
                    logger.warning(f"Broadcast failed for one client: disconnected during send in game {game_code}.")
                    # La limpieza de esta conexión ocurrirá en handle_disconnect
                except Exception as e:
                    # Otros errores de envío (ej: conexión cerrada inesperadamente)
                    logger.error(f"Error broadcasting to a client in game {game_code}: {e}", exc_info=False) # exc_info=False para no llenar logs
    else:
        logger.warning(f"Attempted to broadcast to non-existent game: {game_code}")


async def send_personal_message(websocket: WebSocket, message: WebSocketMessage):
    """
    Envía un mensaje WebSocket a una única conexión específica.

    Args:
        websocket: La conexión WebSocket a la que enviar el mensaje.
        message: El objeto WebSocketMessage a enviar.
    """
    try:
        await websocket.send_text(message.model_dump_json()) # Pydantic v2+
    except WebSocketDisconnect:
        # El cliente ya se desconectó, no se puede enviar.
        logger.warning(f"Attempted to send personal message but client was already disconnected.")
    except Exception as e:
        # Otro error durante el envío
        logger.error(f"Error sending personal message: {e}", exc_info=False)


# --- Lógica de Flujo del Juego (Manejadores de Eventos) ---

async def handle_join_game(games_dict: Dict[str, Game], game: Game, websocket: WebSocket, payload_data: dict):
    """
    Procesa la solicitud de un cliente para unirse a una partida existente.

    Valida el nickname, el estado de la partida (debe estar en LOBBY),
    y si el nickname ya está en uso. Si es válido, crea un objeto Player,
    lo añade al juego, asigna el rol de host si es el primero en unirse,
    envía un mensaje de confirmación ('join_ack') al jugador con la cuenta
    de jugadores actual, y notifica al resto ('player_joined') con el
    contador de jugadores reales.

    Args:
        games_dict: El diccionario global de partidas activas (para broadcast).
        game: El objeto Game al que intenta unirse el jugador.
        websocket: La conexión WebSocket del jugador que intenta unirse.
        payload_data: El diccionario con los datos del payload 'join_game'.
    """
    try:
        payload = JoinGamePayload(**payload_data)
        nickname = payload.nickname.strip() # Eliminar espacios extra

        # Validaciones
        if not nickname:
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="El nickname no puede estar vacío.")))
            await websocket.close(code=1008) # Policy Violation
            return
        if game.state != GameStateEnum.LOBBY:
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="La partida ya ha comenzado.")))
            await websocket.close(code=1008)
            return
        # Comprobar si el nickname (insensible a mayúsculas) ya existe
        if any(p.nickname.lower() == nickname.lower() for p in game.players.values()):
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="El nickname ya está en uso.")))
            await websocket.close(code=1008)
            return
        # Comprobar si esta conexión ya está registrada (no debería pasar si se maneja bien en main.py)
        if websocket in game.players:
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Ya estás unido a esta partida con esta conexión.")))
            return # No cerrar, solo informar

        # Crear y añadir jugador
        player = Player(nickname=nickname, connection=websocket)
        game.players[websocket] = player
        # Asegurarse de que la conexión esté en la lista activa
        if websocket not in game.active_connections:
            game.active_connections.append(websocket)

        # --- MODIFICADO: Calcular el número de jugadores REALES ANTES de enviar el ACK ---
        # Se calcula después de añadir al jugador actual a game.players
        real_player_count = get_real_player_count(game)
        # ---------------------------------------------------------------------------

        # Asignar Host si es el primero
        is_first_connection = (game.host_connection is None)
        if is_first_connection:
            game.host_connection = websocket
            logger.info(f"Player '{nickname}' assigned as HOST for game '{game.game_code}'.")
            welcome_message = f"¡Eres el Anfitrión de la partida {game.game_code}! Esperando jugadores..."
        else:
            welcome_message = f"¡Bienvenido a la partida {game.game_code}, {nickname}! Esperando al anfitrión."

        # --- MODIFICADO: Enviar confirmación personal (Join ACK) con el contador de jugadores ---
        await send_personal_message(websocket, WebSocketMessage(
            type="join_ack",
            payload=JoinAckPayload(
                nickname=nickname,
                message=welcome_message,
                player_count=real_player_count # Incluir el contador
            )
        ))
        # ----------------------------------------------------------------------------------

        # Notificar a todos los demás jugadores (Broadcast Player Joined)
        # El contador aquí ya es el actualizado.
        await broadcast(games_dict, game.game_code, WebSocketMessage(
            type="player_joined",
            payload=PlayerJoinedPayload(nickname=nickname, player_count=real_player_count)
        ), exclude_connection=websocket) # Excluir al que acaba de unirse

        # Log con el contador total y el de jugadores reales
        total_connections = len(game.players) # Incluye host si está en players
        current_players_nicknames = [p.nickname for p in game.players.values()]
        logger.info(f"Player '{nickname}' joined game '{game.game_code}'. Total connections in players dict: {total_connections}. Real player count: {real_player_count}. Current players: {current_players_nicknames}")

    except ValidationError as e:
        logger.warning(f"Invalid join_game payload: {e}")
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Datos de unión inválidos.")))
    except WebSocketDisconnect:
        # El cliente se desconectó justo durante el proceso de unirse
        logger.warning(f"Client disconnected during join process for game {game.game_code}.")
        # La limpieza la hará handle_disconnect si la conexión llegó a añadirse
    except Exception as e:
        logger.error(f"Error handling join_game for game {game.game_code}: {e}", exc_info=True)
        # Intentar notificar al cliente del error si aún está conectado
        try:
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno al unirse a la partida.")))
        except Exception:
            pass


async def handle_start_game(games_dict: Dict[str, Game], game: Game, websocket: WebSocket):
    """
    Procesa la solicitud del host para iniciar la partida.

    Valida que quien envía el mensaje es el host, que la partida está en LOBBY,
    que hay al menos un jugador real (o solo el host si se permite) y que
    los datos del quiz están cargados. Si todo es correcto, cambia el estado
    del juego a QUESTION_DISPLAY, envía el mensaje 'game_started' a todos y
    procede a enviar la primera pregunta.

    Args:
        games_dict: El diccionario global de partidas activas (para broadcast y llamadas).
        game: El objeto Game que se intenta iniciar.
        websocket: La conexión WebSocket del cliente que envió el mensaje 'start_game'.
    """
    # Validaciones
    if game.host_connection != websocket:
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede iniciar la partida.")))
        return
    if game.state != GameStateEnum.LOBBY:
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="La partida no está esperando para iniciar (ya empezó o finalizó).")))
        return
    # Verificar si hay jugadores reales (o si el host es el único conectado y se permite jugar solo)
    real_player_count = get_real_player_count(game)
    # Permitir iniciar solo si hay al menos 1 jugador real (además del host)
    # O si se quiere permitir que el host juegue solo, cambiar la condición
    if real_player_count <= 0:
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="No hay suficientes jugadores (aparte del host) para iniciar.")))
        return
    if not game.quiz_data or not game.quiz_data.questions:
        logger.error(f"Host tried to start game {game.game_code} but quiz data is missing or empty.")
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error: No se han cargado los datos del cuestionario.")))
        return

    logger.info(f"Host starting game '{game.game_code}' with quiz '{game.quiz_data.title}'")
    game.state = GameStateEnum.QUESTION_DISPLAY
    game.current_question_index = 0 # Empezar con la primera pregunta (índice 0)

    # Notificar a todos que el juego ha comenzado
    await broadcast(games_dict, game.game_code, WebSocketMessage(type="game_started", payload=GameStartedPayload()))

    # Pequeña pausa antes de enviar la pregunta para que el cliente procese 'game_started'
    await asyncio.sleep(0.1)
    # Enviar la primera pregunta
    await send_current_question(games_dict, game)


async def send_current_question(games_dict: Dict[str, Game], game: Game):
    """
    Prepara y envía la pregunta actual a todos los jugadores.

    Llama a `get_current_question` para obtener la pregunta procesada.
    Si se obtiene una pregunta válida, actualiza el estado del juego
    (QUESTION_DISPLAY, hora de inicio, resetea respuestas), construye el
    payload `NewQuestionPayload` y lo envía a todos los jugadores.
    Si no hay más preguntas o falla la obtención, finaliza la partida.

    Args:
        games_dict: El diccionario global de partidas activas (para broadcast y llamadas).
        game: El objeto Game para el cual enviar la pregunta.
    """
    # Obtener y procesar la pregunta actual
    question: Optional[Question] = get_current_question(game)

    if not question:
        # Si no hay pregunta, puede ser el fin del quiz o un error
        if game.quiz_data and game.current_question_index >= len(game.quiz_data.questions):
            logger.info(f"Game {game.game_code}: No more questions available. Ending game.")
        else:
            # Si el índice era válido pero get_current_question falló
            logger.error(f"Game {game.game_code}: Failed to get or process question at index {game.current_question_index}. Ending game prematurely.")
        await handle_game_over(games_dict, game)
        return

    # Actualizar estado del juego para la nueva pregunta
    game.state = GameStateEnum.QUESTION_DISPLAY
    game.question_start_time = time.time() # Registrar cuándo empieza la pregunta
    game.answers_received_this_round = {} # Limpiar respuestas de la ronda anterior
    # Resetear el flag de respuesta para todos los jugadores
    for p in game.players.values():
        p.has_answered_current_question = False

    total_questions = len(game.quiz_data.questions) if game.quiz_data else 0
    # Preparar payload para enviar al cliente (sin la respuesta correcta)
    payload = NewQuestionPayload(
        question_id=question.id,
        question_text=question.text,
        options=question.options, # Opciones con IDs
        time_limit=question.time_limit,
        question_number=game.current_question_index + 1, # Número legible (1-based)
        total_questions=total_questions
    )

    logger.info(f"Game {game.game_code}: Sending question {payload.question_number}/{payload.total_questions}: {question.text}")
    # Enviar la pregunta a todos los jugadores activos
    await broadcast(games_dict, game.game_code, WebSocketMessage(type="new_question", payload=payload))


async def handle_submit_answer(game: Game, websocket: WebSocket, payload_data: dict):
    """
    Procesa la respuesta enviada por un jugador a la pregunta actual.

    Valida el estado, jugador y respuesta. Calcula puntos si es correcta.
    Actualiza la puntuación. Registra la respuesta. Envía el resultado
    personal ('answer_result') con el ranking basado solo en jugadores reales.

    Args:
        game: El objeto Game al que pertenece la respuesta.
        websocket: La conexión WebSocket del jugador que envió la respuesta.
        payload_data: El diccionario con los datos del payload 'submit_answer'.
    """
    # Validaciones de estado y jugador
    if game.state != GameStateEnum.QUESTION_DISPLAY:
        logger.warning(f"Answer received in wrong state ({game.state}) for game {game.game_code}. Ignoring.")
        return
    player = game.players.get(websocket)
    if not player:
        logger.error(f"Received answer from unknown websocket in game {game.game_code}. Ignoring.")
        return
    if player.has_answered_current_question:
        logger.warning(f"Player {player.nickname} tried to answer twice for question {game.current_question_index} in game {game.game_code}. Ignoring.")
        return

    try:
        payload = SubmitAnswerPayload(**payload_data)
        answer_id = payload.answer_id
        received_time = time.time()

        correct_answer_id = game.current_correct_answer_id
        question_time_limit = 30 # Default value if fetching fails
        if game.quiz_data and 0 <= game.current_question_index < len(game.quiz_data.questions):
             current_question_data = game.quiz_data.questions[game.current_question_index]
             question_time_limit = current_question_data.time_limit
        else:
             logger.warning(f"Could not get specific time limit for Q{game.current_question_index} in {game.game_code}. Using default: {question_time_limit}s")


        if not correct_answer_id:
            logger.error(f"Cannot process answer: Missing correct answer ID in game state for {game.game_code}. Player: {player.nickname}")
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno del servidor (ID correcto no encontrado).")))
            return
        if game.question_start_time is None:
            logger.error(f"Cannot process answer: Missing question start time in game state for {game.game_code}. Player: {player.nickname}")
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno del servidor (tiempo inválido).")))
            return

        player.has_answered_current_question = True
        player.last_answer_time = received_time

        is_correct = (answer_id == correct_answer_id)
        points = 0
        if is_correct:
            if received_time >= game.question_start_time:
                points = calculate_points(game.question_start_time, received_time, question_time_limit)
            else:
                logger.warning(f"Received answer time {received_time:.2f} is before question start time {game.question_start_time:.2f} for player {player.nickname}. Awarding 0 points.")

        player.score += points
        answer_record = AnswerRecord(
            player_nickname=player.nickname,
            answer_id=answer_id,
            received_at=received_time,
            score_awarded=points,
            is_correct=is_correct
        )
        game.answers_received_this_round[player.nickname] = answer_record

        # Calcular el ranking actual excluyendo al host
        current_player_scoreboard = get_player_only_scoreboard(game)
        current_rank = next((entry.rank for entry in current_player_scoreboard if entry.nickname == player.nickname), 0)

        result_payload = AnswerResultPayload(
            is_correct=is_correct,
            correct_answer_id=correct_answer_id,
            points_awarded=points,
            current_score=player.score,
            current_rank=current_rank # Enviar el rango basado solo en jugadores
        )
        await send_personal_message(websocket, WebSocketMessage(type="answer_result", payload=result_payload))

        logger.info(f"Game {game.game_code}: Player {player.nickname} answered Q{game.current_question_index+1} ({answer_id}) -> Correct: {is_correct}, Points: {points}, Total Score: {player.score}, Player Rank: {current_rank}")

    except ValidationError as e:
        nick = player.nickname if player else "unknown connection"
        logger.warning(f"Invalid submit_answer payload in game {game.game_code} from {nick}: {e}")
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Datos de respuesta inválidos.")))
    except Exception as e:
        nick = player.nickname if player else "unknown connection"
        logger.error(f"Error handling submit_answer for {nick} in {game.game_code}: {e}", exc_info=True)
        try:
            await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno al procesar tu respuesta.")))
        except Exception:
            pass


async def handle_next_question(games_dict: Dict[str, Game], game: Game, websocket: WebSocket):
    """
    Maneja la solicitud del anfitrión para avanzar a la siguiente etapa.

    Si el juego está mostrando una pregunta (`QUESTION_DISPLAY`), esta acción
    provoca la transición inmediata al marcador (`LEADERBOARD`) llamando a
    `advance_to_next_stage`. Si ya está en el marcador, la acción se ignora
    ya que un temporizador automático (`trigger_next_stage_after_delay`)
    manejará el avance a la siguiente pregunta o al fin del juego.

    Args:
        games_dict: El diccionario global de partidas activas (para llamadas).
        game: El objeto Game cuyo estado se intenta avanzar.
        websocket: La conexión WebSocket del cliente que envió la solicitud (debe ser el host).
    """
    # Validación de Host
    if game.host_connection != websocket:
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede controlar el avance del juego.")))
        return

    # Lógica de avance basada en el estado actual
    if game.state == GameStateEnum.QUESTION_DISPLAY:
        # El host quiere terminar la ronda de preguntas y mostrar el marcador
        logger.info(f"Host manually triggered advance to leaderboard for game '{game.game_code}'")
        # Llamar a advance_to_next_stage iniciará el marcador y el temporizador automático
        await advance_to_next_stage(games_dict, game)
    elif game.state == GameStateEnum.LEADERBOARD:
         # El host hizo clic en "Siguiente" mientras se mostraba el marcador
         # El temporizador automático ya está corriendo, así que podemos ignorarlo o informar.
         logger.info(f"Host clicked 'Next' during leaderboard display for game '{game.game_code}'. Auto-advance timer is active.")
         # Opcional: enviar un mensaje informativo al host
         # await send_personal_message(websocket, WebSocketMessage(type="info", payload={"message": "El juego avanzará automáticamente en breve."}))
         # O quizás sí forzar el avance si se desea que el host tenga control total
         # logger.info(f"Host manually triggered advance FROM leaderboard for game '{game.game_code}'.")
         # await advance_to_next_stage(games_dict, game) # Descomentar para permitir avance manual desde LEADERBOARD
    else:
        # No se permite avance manual desde otros estados (LOBBY, FINISHED)
        logger.warning(f"Host tried 'next_question' in invalid state ({game.state}) for game {game.game_code}")
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message=f"No se puede avanzar manualmente desde el estado actual ({game.state.value}).")))


async def trigger_next_stage_after_delay(games_dict: Dict[str, Game], game: Game, delay: int = AUTO_ADVANCE_DELAY):
    """
    Función auxiliar (tarea) que espera un tiempo y luego avanza el juego.

    Se programa para ejecutarse después de mostrar el marcador. Espera `delay`
    segundos y luego llama a `advance_to_next_stage` para pasar a la
    siguiente pregunta o finalizar el juego. Incluye una verificación para
    asegurarse de que el juego todavía existe y está en el estado esperado
    (`LEADERBOARD`) antes de proceder.

    Args:
        games_dict: El diccionario global de partidas activas (para verificación y llamadas).
        game: El objeto Game que debe avanzar.
        delay: El número de segundos a esperar antes de avanzar.
    """
    logger.info(f"Game {game.game_code}: Auto-advance timer started ({delay}s delay) after showing leaderboard.")
    await asyncio.sleep(delay)

    # Verificar si el juego aún existe y está en el estado correcto antes de avanzar
    # Esto evita errores si el juego fue eliminado o el host lo terminó manually durante la espera.
    # Usar get() para evitar KeyError si el juego ya no existe
    current_game_state_obj = games_dict.get(game.game_code)
    if current_game_state_obj and current_game_state_obj.state == GameStateEnum.LEADERBOARD:
        logger.info(f"Game {game.game_code}: Auto-advance delay finished. Triggering next stage from LEADERBOARD.")
        await advance_to_next_stage(games_dict, current_game_state_obj) # Llamar a la lógica principal de avance
    else:
        # Si el juego ya no existe o cambió de estado (ej: finalizado por host), cancelar el avance automático
        current_state_val = current_game_state_obj.state.value if current_game_state_obj else 'N/A (Game Removed)'
        logger.info(f"Game {game.game_code}: Auto-advance cancelled. Game no longer exists or state changed during delay (Current state: {current_state_val}).")


async def advance_to_next_stage(games_dict: Dict[str, Game], game: Game):
    """
    Gestiona la transición entre etapas: Pregunta -> Marcador, o Marcador -> Siguiente/Fin.

    - Si estado es `QUESTION_DISPLAY`:
        - Cambia estado a `LEADERBOARD`.
        - Calcula y envía marcador de jugadores reales (`update_scoreboard`).
        - Programa `trigger_next_stage_after_delay`.
    - Si estado es `LEADERBOARD`:
        - Incrementa índice de pregunta.
        - Si hay más, llama a `send_current_question`.
        - Si no, llama a `handle_game_over`.

    Args:
        games_dict: Diccionario global de partidas.
        game: El objeto Game a avanzar.
    """
    current_state = game.state

    if current_state == GameStateEnum.QUESTION_DISPLAY:
        # Transición: Pregunta -> Marcador
        logger.info(f"Game {game.game_code}: Transitioning from QUESTION_DISPLAY to LEADERBOARD.")
        game.state = GameStateEnum.LEADERBOARD
        # --- Calcular y enviar marcador SOLO de jugadores ---
        player_scoreboard = get_player_only_scoreboard(game)
        await broadcast(games_dict, game.game_code, WebSocketMessage(
            type="update_scoreboard",
            payload=UpdateScoreboardPayload(scoreboard=player_scoreboard) # Enviar marcador filtrado
        ))

        logger.info(f"Game {game.game_code}: Scheduling auto-advance task from LEADERBOARD in {AUTO_ADVANCE_DELAY}s.")
        asyncio.create_task(trigger_next_stage_after_delay(games_dict, game))

    elif current_state == GameStateEnum.LEADERBOARD:
        # Transición: Marcador -> Siguiente Pregunta O Fin del Juego
        logger.info(f"Game {game.game_code}: Advancing from LEADERBOARD state.")
        if not game.quiz_data:
             logger.error(f"Cannot advance from LEADERBOARD in game {game.game_code}: quiz_data is missing!")
             await handle_game_over(games_dict, game)
             return

        game.current_question_index += 1

        if game.current_question_index < len(game.quiz_data.questions):
            logger.info(f"Game {game.game_code}: Advancing to question {game.current_question_index + 1}.")
            await send_current_question(games_dict, game)
        else:
            logger.info(f"Game {game.game_code}: All questions answered. Advancing to game over.")
            await handle_game_over(games_dict, game)

    else:
        logger.error(f"advance_to_next_stage called from unexpected state {current_state.value} in game {game.game_code}. No action taken.")


async def handle_game_over(games_dict: Dict[str, Game], game: Game):
    """
    Finaliza la partida, cambia estado a FINISHED, calcula rangos finales
    (excluyendo host) y envía mensajes personalizados a cada jugador.
    """
    if game.state == GameStateEnum.FINISHED:
        logger.warning(f"Game {game.game_code} is already in FINISHED state. Ignoring duplicate handle_game_over call.")
        return

    logger.info(f"Game '{game.game_code}' is ending. Transitioning to FINISHED state.")
    game.state = GameStateEnum.FINISHED

    # Obtener marcador solo de jugadores y ordenarlo
    players_only_scoreboard_sorted = get_player_only_scoreboard(game)

    # Preparar diccionarios para acceso rápido a rangos y scores
    final_player_ranks: Dict[str, int] = {}
    final_player_scores: Dict[str, int] = {}
    for entry in players_only_scoreboard_sorted:
        final_player_ranks[entry.nickname] = entry.rank
        final_player_scores[entry.nickname] = entry.score

    # Obtener el podio (top 3) del marcador de solo jugadores
    podium = players_only_scoreboard_sorted[:3]
    logger.info(f"Calculated final player ranks for {game.game_code}. Podium: {[p.nickname for p in podium]}")

    # Enviar mensajes personalizados a cada conexión activa
    connections_to_notify = list(game.active_connections)
    for websocket in connections_to_notify:
        player = game.players.get(websocket)
        is_host = (game.host_connection == websocket)

        payload: Optional[GameOverPayload] = None

        if player and not is_host: # Es un jugador real
            player_nickname = player.nickname
            my_rank = final_player_ranks.get(player_nickname)
            my_score = final_player_scores.get(player_nickname)
            payload = GameOverPayload(
                podium=podium,
                my_final_rank=my_rank,
                my_final_score=my_score
            )
            logger.debug(f"Sending personalized game_over to player {player_nickname} in {game.game_code}. Rank: {my_rank}, Score: {my_score}")

        elif is_host: # Es el host
             payload = GameOverPayload(podium=podium) # Enviar solo el podio al host
             logger.debug(f"Sending podium-only game_over to host in {game.game_code}.")

        else: # Conexión desconocida o ya desconectada?
             logger.warning(f"Skipping game_over message for a non-player/non-host connection in {game.game_code}")

        if payload:
             await send_personal_message(websocket, WebSocketMessage(type="game_over", payload=payload))


async def handle_disconnect(games_dict: Dict[str, Game], game_code: str, websocket: WebSocket):
    """
    Maneja la desconexión de un cliente WebSocket.

    Elimina al jugador/conexión. Si era el host, termina el juego. Si se va un
    jugador real, notifica a los demás con el nuevo contador de jugadores reales.
    Si no quedan conexiones, elimina el juego.

    Args:
        games_dict: Diccionario global de partidas.
        game_code: Código de la partida.
        websocket: Conexión desconectada.
    """
    game = games_dict.get(game_code)
    if not game:
        logger.debug(f"Disconnect event for an already removed or non-existent game {game_code}. No action needed.")
        return

    logger.info(f"Handling disconnect for websocket in game {game_code}.")

    # Remover de la lista de conexiones activas primero
    if websocket in game.active_connections:
        game.active_connections.remove(websocket)
        logger.debug(f"Removed websocket from active_connections for game {game_code}. Remaining: {len(game.active_connections)}")
    else:
        logger.debug(f"Websocket was not in active_connections list for game {game_code} upon disconnect.")

    disconnected_player: Optional[Player] = None
    was_host = (game.host_connection == websocket)
    was_real_player = False # Flag para saber si era jugador (no host)
    disconnected_nickname = "Unknown"

    if websocket in game.players:
        disconnected_player = game.players.pop(websocket, None)
        if disconnected_player:
            disconnected_nickname = disconnected_player.nickname
            logger.info(f"Player '{disconnected_nickname}' (was host: {was_host}) disconnected from game '{game.game_code}'. Players dict size: {len(game.players)}")
            if not was_host: # Si no era el host, era un jugador real
                 was_real_player = True
        else:
             logger.warning(f"Websocket was in game.players dict but pop returned None for game {game_code}")
    else:
         logger.debug(f"Websocket was not associated with any player in game {game_code} upon disconnect.")

    # Calcular nuevo contador de jugadores reales *después* de quitar al jugador (si se quitó)
    real_player_count = get_real_player_count(game)

    # Notificar a los demás si se fue un jugador real y el juego no ha terminado
    if was_real_player and game.state != GameStateEnum.FINISHED:
        await broadcast(games_dict, game.game_code,
                        WebSocketMessage(type="player_left",
                                         payload=PlayerLeftPayload(nickname=disconnected_nickname, player_count=real_player_count)), # Enviar contador real
                        exclude_connection=None) # Notificar a TODOS los restantes

    # Lógica si el host se desconecta
    if was_host:
        host_nickname = disconnected_nickname if disconnected_player else "Host"
        logger.warning(f"Host '{host_nickname}' disconnected from game '{game.game_code}'.")
        game.host_connection = None

        if game.state != GameStateEnum.FINISHED:
            logger.info(f"Ending game {game.game_code} because host disconnected.")
            try:
                await broadcast(games_dict, game.game_code, WebSocketMessage(
                    type="error",
                    payload=ErrorPayload(message="El anfitrión se ha desconectado. La partida terminará.", code="HOST_DISCONNECTED")
                ))
            except Exception as send_error:
                logger.error(f"Error broadcasting host disconnect message for {game_code}: {send_error}")
            # Usar asyncio.create_task para no bloquear el handle_disconnect
            asyncio.create_task(handle_game_over(games_dict, game))
        else:
             logger.info(f"Host disconnected from game {game.game_code} but game was already FINISHED.")

    # Limpieza final del juego si ya no quedan conexiones activas
    if not game.active_connections and game_code in games_dict:
        logger.info(f"Game '{game.game_code}' has no active connections remaining. Removing game object from memory.")
        del games_dict[game_code]
        logger.info(f"Remaining active games: {list(games_dict.keys())}")
    # Opcional: Podríamos remover el juego FINISHED antes si todos se desconectan
    # elif game.state == GameStateEnum.FINISHED and not game.active_connections and game_code in games_dict:
    #    logger.info(f"Finished game '{game.game_code}' has no active connections. Removing game object from memory.")
    #    del games_dict[game_code]
    #    logger.info(f"Remaining active games: {list(games_dict.keys())}")
