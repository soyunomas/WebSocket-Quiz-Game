# game_logic.py
import asyncio
import json
import logging
import secrets
import time
from typing import Dict, List, Optional, Set
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

# Importar modelos actualizados
from models import (AnswerRecord, ErrorPayload, Game, GameStateEnum,
                    JoinAckPayload, JoinGamePayload, NewQuestionPayload,
                    Player, PlayerJoinedPayload, Question, QuizData, Option,
                    ScoreboardEntry, SubmitAnswerPayload,
                    UpdateScoreboardPayload, WebSocketMessage, AnswerResultPayload,
                    GameOverPayload, GameStartedPayload, PlayerLeftPayload)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# active_games NO SE DEFINE AQUÍ AHORA
loaded_quizzes: Dict[str, QuizData] = {} # Caché opcional

# --- Constantes ---
AUTO_ADVANCE_DELAY = 5 # Segundos a esperar en el marcador antes de avanzar

# --- Funciones Auxiliares ---

# ... (load_quiz, get_current_question, calculate_points, get_scoreboard sin cambios) ...
def load_quiz(quiz_id: str) -> Optional[QuizData]:
    """Carga datos de un quiz (simulado desde archivo o caché)."""
    if quiz_id in loaded_quizzes:
        logger.debug(f"Quiz '{quiz_id}' found in cache.")
        return loaded_quizzes[quiz_id]
    try:
        # Asume que el archivo se llama como el ID o hay un mapeo
        file_path = f"quiz_{quiz_id}.json" # O alguna otra lógica para encontrar el archivo
        logger.info(f"Attempting to load quiz '{quiz_id}' from file: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data.get("id") != quiz_id:
                 logger.warning(f"Quiz ID mismatch in {file_path}. Expected '{quiz_id}', found '{data.get('id')}'")
            quiz = QuizData.model_validate(data) # Pydantic v2
            loaded_quizzes[quiz.id] = quiz
            logger.info(f"Quiz '{quiz.id}' loaded and cached.")
            return quiz
    except FileNotFoundError: logger.error(f"Quiz file not found for ID '{quiz_id}' at path: {file_path}"); return None
    except json.JSONDecodeError: logger.error(f"Error decoding JSON for quiz '{quiz_id}' from path: {file_path}"); return None
    except ValidationError as e: logger.error(f"Validation error loading quiz '{quiz_id}' from {file_path}: {e}"); return None
    except Exception as e: logger.exception(f"Unexpected error loading quiz '{quiz_id}': {e}"); return None

def get_current_question(game: Game) -> Optional[Question]:
    """Obtiene la pregunta actual procesada (con IDs) basada en el índice."""
    if not game.quiz_data: logger.error(f"Attempted to get question for game {game.game_code} but quiz_data is None."); return None
    if not (0 <= game.current_question_index < len(game.quiz_data.questions)): logger.debug(f"Invalid question index {game.current_question_index} for game {game.game_code}."); return None

    q_data = game.quiz_data.questions[game.current_question_index]
    processed_options: List[Option] = []; correct_id: Optional[str] = None; processed_ids = set()

    for opt_data in q_data.options:
        option_id = opt_data.id
        if not option_id or option_id in processed_ids:
            option_id = f"opt_{secrets.token_hex(3)}"
            while option_id in processed_ids: option_id = f"opt_{secrets.token_hex(3)}"
        processed_ids.add(option_id)
        processed_options.append(Option(id=option_id, text=opt_data.text))
        if opt_data.is_correct:
            if correct_id is not None: logger.error(f"Multiple correct options found for question '{q_data.text}' in game {game.game_code}. Using first.")
            else: correct_id = option_id

    if correct_id is None: logger.error(f"No correct option found for question '{q_data.text}' in game {game.game_code}."); return None

    game.current_correct_answer_id = correct_id
    question_id = q_data.id or f"q_{secrets.token_hex(4)}"

    return Question(id=question_id, text=q_data.text, options=processed_options, correct_answer_id=correct_id, time_limit=q_data.time_limit)

def calculate_points(start_time: float, answer_time: float, time_limit: int, base_points: int = 1000) -> int:
    time_taken = answer_time - start_time
    if time_taken < 0: time_taken = 0
    if time_taken >= time_limit: return 0
    factor = max(0.1, 1 - (time_taken / time_limit))
    return int(base_points * factor)

def get_scoreboard(game: Game) -> List[ScoreboardEntry]:
    valid_players = [p for p in game.players.values() if p]
    sorted_players = sorted(valid_players, key=lambda p: p.score, reverse=True)
    scoreboard = [ScoreboardEntry(rank=i + 1, nickname=p.nickname, score=p.score) for i, p in enumerate(sorted_players)]
    return scoreboard


async def broadcast(games_dict: Dict[str, Game], game_code: str, message: WebSocketMessage, exclude_connection: Optional[WebSocket] = None):
    # ... (código sin cambios) ...
    if game_code in games_dict:
        game = games_dict[game_code]
        message_json = message.model_dump_json()
        connections_to_send = list(game.active_connections)
        for connection in connections_to_send:
            if connection != exclude_connection:
                try:
                    await connection.send_text(message_json)
                except WebSocketDisconnect:
                    logger.warning(f"Broadcast failed: disconnected client found in game {game_code} while sending.")
                except Exception as e:
                    logger.error(f"Error broadcasting to a client in game {game_code}: {e}", exc_info=False)


async def send_personal_message(websocket: WebSocket, message: WebSocketMessage):
    # ... (código sin cambios) ...
    try:
        await websocket.send_text(message.model_dump_json())
    except WebSocketDisconnect:
        logger.warning(f"Attempted to send personal message but client was disconnected.")
    except Exception as e:
        logger.error(f"Error sending personal message: {e}", exc_info=False)


# --- Lógica de Flujo del Juego ---

async def handle_join_game(games_dict: Dict[str, Game], game: Game, websocket: WebSocket, payload_data: dict):
    # ... (código sin cambios) ...
    try:
        payload = JoinGamePayload(**payload_data); nickname = payload.nickname.strip();
        if not nickname: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="El nickname no puede estar vacío."))); await websocket.close(code=1008); return
        if game.state != GameStateEnum.LOBBY: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="La partida ya ha comenzado."))); await websocket.close(code=1008); return
        if any(p.nickname.lower() == nickname.lower() for p in game.players.values()): await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="El nickname ya está en uso."))); await websocket.close(code=1008); return
        if websocket in game.players: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Ya estás unido a esta partida con esta conexión."))); return

        player = Player(nickname=nickname, connection=websocket); game.players[websocket] = player;
        if websocket not in game.active_connections: game.active_connections.append(websocket)

        is_first_connection = (game.host_connection is None)
        if is_first_connection:
            game.host_connection = websocket; logger.info(f"Player '{nickname}' assigned as HOST for game '{game.game_code}'."); welcome_message = f"¡Eres el Anfitrión de la partida {game.game_code}! Esperando jugadores..."
        else: welcome_message = f"¡Bienvenido a la partida {game.game_code}, {nickname}! Esperando al anfitrión."

        await send_personal_message(websocket, WebSocketMessage(type="join_ack", payload=JoinAckPayload(nickname=nickname, message=welcome_message)))
        await broadcast(games_dict, game.game_code, WebSocketMessage(type="player_joined", payload=PlayerJoinedPayload(nickname=nickname, player_count=len(game.players))), exclude_connection=websocket)
        current_players_nicknames = [p.nickname for p in game.players.values()]
        logger.info(f"Player '{nickname}' joined game '{game.game_code}'. Total players: {len(game.players)}. Current players: {current_players_nicknames}")

    except ValidationError as e: logger.warning(f"Invalid join_game payload: {e}"); await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Datos de unión inválidos.")))
    except WebSocketDisconnect: logger.warning(f"Client disconnected during join process for game {game.game_code}.")
    except Exception as e:
        logger.error(f"Error handling join_game for game {game.game_code}: {e}", exc_info=True)
        try: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno al unirse.")))
        except Exception: pass


async def handle_start_game(games_dict: Dict[str, Game], game: Game, websocket: WebSocket):
    # ... (código sin cambios) ...
    if game.host_connection != websocket: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede iniciar."))); return
    if game.state != GameStateEnum.LOBBY: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="La partida no está en estado LOBBY."))); return
    if len(game.players) <= 0 : await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="No hay suficientes jugadores para iniciar."))); return
    if not game.quiz_data or not game.quiz_data.questions: logger.error(f"Host tried to start game {game.game_code} but quiz data is missing or empty."); await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error: No se han cargado los datos del cuestionario."))); return

    logger.info(f"Host starting game '{game.game_code}' with quiz '{game.quiz_data.title}'")
    game.state = GameStateEnum.QUESTION_DISPLAY; game.current_question_index = 0

    await broadcast(games_dict, game.game_code, WebSocketMessage(type="game_started", payload=GameStartedPayload()))
    await asyncio.sleep(0.1); await send_current_question(games_dict, game)


async def send_current_question(games_dict: Dict[str, Game], game: Game):
    # ... (código sin cambios) ...
    question: Optional[Question] = get_current_question(game)
    if not question:
        if game.quiz_data and game.current_question_index >= len(game.quiz_data.questions): logger.info(f"Game {game.game_code}: No more questions. Ending game.")
        else: logger.error(f"Game {game.game_code}: Failed to get or process question at index {game.current_question_index}. Ending game prematurely.")
        await handle_game_over(games_dict, game); return

    game.state = GameStateEnum.QUESTION_DISPLAY; game.question_start_time = time.time(); game.answers_received_this_round = {}
    for p in game.players.values(): p.has_answered_current_question = False

    total_questions = len(game.quiz_data.questions) if game.quiz_data else 0
    payload = NewQuestionPayload(question_id=question.id, question_text=question.text, options=question.options, time_limit=question.time_limit, question_number=game.current_question_index + 1, total_questions=total_questions)
    logger.info(f"Game {game.game_code}: Sending question {payload.question_number}/{payload.total_questions}: {question.text}")
    await broadcast(games_dict, game.game_code, WebSocketMessage(type="new_question", payload=payload))


async def handle_submit_answer(game: Game, websocket: WebSocket, payload_data: dict):
    # ... (código sin cambios) ...
    if game.state != GameStateEnum.QUESTION_DISPLAY: logger.warning(f"Answer received in wrong state ({game.state}) for game {game.game_code}. Ignoring."); return
    player = game.players.get(websocket);
    if not player: logger.error(f"Received answer from unknown websocket in game {game.game_code}."); return
    if player.has_answered_current_question: logger.warning(f"Player {player.nickname} tried to answer twice for question {game.current_question_index} in game {game.game_code}. Ignoring."); return

    try:
        payload = SubmitAnswerPayload(**payload_data); answer_id = payload.answer_id; received_time = time.time()
        correct_answer_id = game.current_correct_answer_id; question_time_limit = 30
        if game.quiz_data and 0 <= game.current_question_index < len(game.quiz_data.questions): question_time_limit = game.quiz_data.questions[game.current_question_index].time_limit

        if not correct_answer_id: logger.error(f"Cannot process answer: Missing correct answer ID in game {game.game_code}. Player: {player.nickname}"); await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno (ID correcto no encontrado)."))); return
        if game.question_start_time is None: logger.error(f"Cannot process answer: Missing question start time in game {game.game_code}. Player: {player.nickname}"); await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno (tiempo inválido)."))); return

        player.has_answered_current_question = True; player.last_answer_time = received_time
        is_correct = (answer_id == correct_answer_id); points = 0
        if is_correct:
            if received_time >= game.question_start_time: points = calculate_points(game.question_start_time, received_time, question_time_limit)
            else: logger.warning(f"Received answer time {received_time} is before question start time {game.question_start_time} for player {player.nickname}. Awarding 0 points.")
        player.score += points
        answer_record = AnswerRecord(player_nickname=player.nickname, answer_id=answer_id, received_at=received_time, score_awarded=points, is_correct=is_correct)
        game.answers_received_this_round[player.nickname] = answer_record
        current_scoreboard = get_scoreboard(game); current_rank = next((entry.rank for entry in current_scoreboard if entry.nickname == player.nickname), 0)
        result_payload = AnswerResultPayload(is_correct=is_correct, correct_answer_id=correct_answer_id, points_awarded=points, current_score=player.score, current_rank=current_rank)
        await send_personal_message(websocket, WebSocketMessage(type="answer_result", payload=result_payload))
        logger.info(f"Game {game.game_code}: Player {player.nickname} answered Q{game.current_question_index+1} ({answer_id}) -> Correct: {is_correct}, Points: {points}, Total Score: {player.score}, Rank: {current_rank}")

    except ValidationError as e:
        logger.warning(f"Invalid submit_answer payload in game {game.game_code} from {player.nickname if player else 'unknown'}: {e}")
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Datos de respuesta inválidos.")))
    except Exception as e:
        nick = player.nickname if player else "unknown"
        logger.error(f"Error handling submit_answer for {nick} in {game.game_code}: {e}", exc_info=True)
        try: await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Error interno al procesar respuesta.")))
        except Exception: pass


async def handle_next_question(games_dict: Dict[str, Game], game: Game, websocket: WebSocket):
    """Maneja la solicitud del anfitrión para pasar a la siguiente etapa (marcador o pregunta)."""
    if game.host_connection != websocket:
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message="Solo el anfitrión puede controlar.")))
        return
    # El host ahora solo puede forzar el avance desde QUESTION_DISPLAY (para saltar a marcador)
    # El avance desde LEADERBOARD es automático.
    if game.state == GameStateEnum.QUESTION_DISPLAY:
        logger.info(f"Host requested next stage (show leaderboard) for game '{game.game_code}'")
        # Llamar directamente a advance_to_next_stage para mostrar el marcador
        # Esto también iniciará el temporizador de auto-avance
        await advance_to_next_stage(games_dict, game)
    elif game.state == GameStateEnum.LEADERBOARD:
         # Si el host pulsa Siguiente mientras está el marcador (y el timer corriendo)
         # podemos decidir acelerar el avance o simplemente ignorarlo.
         # Por simplicidad, lo ignoraremos, el timer automático lo hará.
         logger.info(f"Host clicked Next during leaderboard display for game '{game.game_code}'. Auto-advance timer is running.")
         await send_personal_message(websocket, WebSocketMessage(type="info", payload={"message": "El juego avanzará automáticamente en breve."})) # Opcional
    else:
        logger.warning(f"Host tried 'next_question' in invalid state ({game.state}) for game {game.game_code}")
        await send_personal_message(websocket, WebSocketMessage(type="error", payload=ErrorPayload(message=f"No se puede avanzar manualmente desde el estado actual ({game.state}).")))


# -------- NUEVA FUNCIÓN --------
async def trigger_next_stage_after_delay(games_dict: Dict[str, Game], game: Game, delay: int = AUTO_ADVANCE_DELAY):
    """Espera un tiempo y luego llama a advance_to_next_stage para pasar a la siguiente pregunta o finalizar."""
    logger.info(f"Game {game.game_code}: Auto-advance timer started ({delay}s delay) after showing leaderboard.")
    await asyncio.sleep(delay)

    # Doble verificación: ¿El juego todavía existe y sigue en estado LEADERBOARD?
    # Esto evita errores si el juego fue terminado o eliminado durante la espera.
    if game.game_code in games_dict and game.state == GameStateEnum.LEADERBOARD:
        logger.info(f"Game {game.game_code}: Auto-advance delay finished. Triggering next stage.")
        await advance_to_next_stage(games_dict, game) # Llamar a la lógica principal de avance
    else:
        logger.info(f"Game {game.game_code}: Auto-advance cancelled. Game no longer exists or state changed during delay (Current state: {game.state if game else 'N/A'}).")
# -------- FIN NUEVA FUNCIÓN --------


async def advance_to_next_stage(games_dict: Dict[str, Game], game: Game):
    """Avanza el estado del juego: marcador -> siguiente pregunta o fin."""
    current_state = game.state

    if current_state == GameStateEnum.QUESTION_DISPLAY:
        # Si estábamos mostrando pregunta, ahora mostramos marcador
        game.state = GameStateEnum.LEADERBOARD
        scoreboard = get_scoreboard(game)
        logger.info(f"Game {game.game_code}: Transitioning to LEADERBOARD.")
        await broadcast(games_dict, game.game_code, WebSocketMessage(type="update_scoreboard", payload=UpdateScoreboardPayload(scoreboard=scoreboard)))

        # -------- INICIAR TEMPORIZADOR DE AUTO-AVANCE --------
        # Crear una tarea en segundo plano que esperará y luego avanzará
        logger.info(f"Game {game.game_code}: Scheduling auto-advance task after leaderboard display.")
        asyncio.create_task(trigger_next_stage_after_delay(games_dict, game))
        # ----------------------------------------------------
        return # La función trigger_next_stage_after_delay se encargará del siguiente paso

    elif current_state == GameStateEnum.LEADERBOARD:
        # Si estábamos mostrando marcador (y esta función fue llamada por el timer o manualmente)
        if not game.quiz_data: # Comprobación por si acaso
             logger.error(f"Cannot advance from LEADERBOARD in game {game.game_code}: quiz_data is missing!")
             await handle_game_over(games_dict, game)
             return

        game.current_question_index += 1 # Avanzar índice
        if game.current_question_index < len(game.quiz_data.questions):
            # Si hay más preguntas, enviar la siguiente
            logger.info(f"Game {game.game_code}: Advancing automatically to question {game.current_question_index + 1}.")
            await send_current_question(games_dict, game)
        else:
            # Si no hay más preguntas, fin del juego
            logger.info(f"Game {game.game_code}: All questions answered. Auto-advancing to game over.")
            await handle_game_over(games_dict, game)

    else:
        # No debería llamarse desde otros estados
        logger.error(f"advance_to_next_stage called from unexpected state {current_state} in game {game.game_code}")


async def handle_game_over(games_dict: Dict[str, Game], game: Game):
    """Finaliza la partida, muestra el podio y prepara para la limpieza."""
    logger.info(f"!!!!!! Entered handle_game_over for game {game.game_code}") # DEBUG
    if game.state == GameStateEnum.FINISHED:
        logger.warning(f"Game {game.game_code} is already finished. Ignoring handle_game_over call.")
        return

    logger.info(f"Game '{game.game_code}' is ending.")
    game.state = GameStateEnum.FINISHED
    final_scoreboard = get_scoreboard(game)
    podium = final_scoreboard[:3]

    payload = GameOverPayload(podium=podium)
    logger.info(f"!!!!!! Broadcasting game_over. Podium: {podium}") # DEBUG
    await broadcast(games_dict, game.game_code, WebSocketMessage(type="game_over", payload=payload))

    # Considerar si limpiar aquí o dejar que handle_disconnect lo haga
    # Por ahora, dejaremos que handle_disconnect limpie cuando todos se vayan


async def handle_disconnect(games_dict: Dict[str, Game], game_code: str, websocket: WebSocket):
    # ... (código sin cambios) ...
    game = games_dict.get(game_code)
    if not game: logger.debug(f"Disconnect event for an already removed or non-existent game {game_code}"); return

    disconnected_player: Optional[Player] = None
    was_host = (game.host_connection == websocket)

    if websocket in game.active_connections: game.active_connections.remove(websocket); logger.debug(f"Removed websocket from active_connections for game {game_code}. Remaining: {len(game.active_connections)}")
    if websocket in game.players:
        disconnected_player = game.players.pop(websocket, None)
        if disconnected_player:
            logger.info(f"Player '{disconnected_player.nickname}' disconnected from game '{game.game_code}'. Players remaining: {len(game.players)}")
            if game.state != GameStateEnum.FINISHED:
                await broadcast(games_dict, game.game_code,
                                WebSocketMessage(type="player_left",
                                                 payload=PlayerLeftPayload(nickname=disconnected_player.nickname, player_count=len(game.players))),
                                exclude_connection=websocket)
        else: logger.warning(f"Websocket was in game.players dict but could not be popped for game {game_code}")

    if was_host:
        host_nickname = disconnected_player.nickname if disconnected_player else "Host"
        logger.warning(f"Host '{host_nickname}' disconnected from game '{game.game_code}'.")
        game.host_connection = None
        if game.state != GameStateEnum.FINISHED:
            logger.info(f"Ending game {game.game_code} because host disconnected.")
            try: await broadcast(games_dict, game.game_code, WebSocketMessage(type="error", payload=ErrorPayload(message="El anfitrión se ha desconectado. La partida terminará.", code="HOST_DISCONNECTED")))
            except Exception as send_error: logger.error(f"Error broadcasting host disconnect message for {game_code}: {send_error}")
            await asyncio.sleep(0.1) # Pequeña pausa antes de terminar
            await handle_game_over(games_dict, game)

    if not game.active_connections and game_code in games_dict:
        logger.info(f"Game '{game.game_code}' has no active connections remaining. Removing from memory.")
        del games_dict[game_code]
    elif game.state == GameStateEnum.FINISHED and not game.active_connections and game_code in games_dict:
        logger.info(f"Finished game '{game.game_code}' has no active connections. Removing from memory.")
        del games_dict[game_code]
