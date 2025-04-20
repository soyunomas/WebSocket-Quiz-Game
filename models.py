# models.py
"""
Define los modelos de datos Pydantic utilizados en la aplicación de Quiz.

Incluye:
- Estructuras de datos internas (como Game, Player, QuizData).
- Enumeraciones (como GameStateEnum).
- Payloads para la comunicación WebSocket entre cliente y servidor.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from enum import Enum
import uuid # Para generar IDs por defecto

from fastapi import WebSocket # Para tipar conexiones WebSocket

# --- Modelos de Datos Internos ---

class GameStateEnum(str, Enum):
    """Enumeración para los posibles estados de una partida."""
    LOBBY = "LOBBY"                     # Esperando jugadores, antes de empezar
    QUESTION_DISPLAY = "QUESTION_DISPLAY" # Mostrando una pregunta, esperando respuestas
    LEADERBOARD = "LEADERBOARD"           # Mostrando el marcador después de una pregunta
    FINISHED = "FINISHED"                 # La partida ha terminado

# --- Modelos para Cargar Datos del Quiz (desde archivo/host) ---

class OptionData(BaseModel):
    """Representa una opción dentro de los datos brutos de un Quiz."""
    id: Optional[str] = Field(default_factory=lambda: f"opt_{uuid.uuid4().hex[:6]}", description="ID único opcional; se generará si falta")
    text: str = Field(..., description="Texto de la opción")
    is_correct: bool = Field(..., description="Indica si esta es la opción correcta")

class QuestionData(BaseModel):
    """Representa una pregunta dentro de los datos brutos de un Quiz."""
    id: Optional[str] = Field(default_factory=lambda: f"q_{uuid.uuid4().hex[:8]}", description="ID único opcional; se generará si falta")
    text: str = Field(..., description="Texto de la pregunta")
    options: List[OptionData] = Field(..., min_length=2, max_length=4, description="Lista de opciones (entre 2 y 4)")
    time_limit: int = Field(default=20, ge=5, le=120, description="Tiempo límite en segundos para responder (entre 5 y 120)")

class QuizData(BaseModel):
    """Representa la estructura completa de un cuestionario cargado."""
    id: Optional[str] = Field(default_factory=lambda: f"quiz_{uuid.uuid4().hex[:10]}", description="ID único opcional del quiz; se generará si falta")
    title: str = Field(..., description="Título del Quiz")
    questions: List[QuestionData] = Field(..., description="Lista de preguntas que componen el quiz")

# --- Modelos Procesados/Utilizados Durante el Juego ---

class Option(BaseModel):
    """Representa una opción tal como se envía a los jugadores (con ID garantizado)."""
    id: str = Field(..., description="Identificador único de la opción, usado para las respuestas")
    text: str = Field(..., description="Texto de la opción visible para el jugador")

class Question(BaseModel):
    """Representa una pregunta procesada, lista para ser usada/enviada en el juego."""
    id: str = Field(..., description="Identificador único de la pregunta")
    text: str = Field(..., description="Texto de la pregunta")
    options: List[Option] = Field(..., description="Lista de opciones (con IDs) para mostrar al jugador")
    correct_answer_id: str = Field(..., description="ID de la opción correcta (usado internamente para validar)")
    time_limit: int = Field(default=15, description="Tiempo límite en segundos")

class Player(BaseModel):
    """Representa a un jugador conectado a una partida."""
    nickname: str = Field(..., description="Nombre elegido por el jugador")
    connection: WebSocket = Field(..., exclude=True, description="Referencia a la conexión WebSocket del jugador")
    score: int = Field(default=0, description="Puntuación acumulada del jugador")
    last_answer_time: Optional[float] = Field(default=None, description="Timestamp de la última respuesta enviada (para desempates o análisis)")
    has_answered_current_question: bool = Field(default=False, description="Flag para indicar si ya respondió la pregunta actual")

    class Config:
        arbitrary_types_allowed = True # Permite el tipo WebSocket

class AnswerRecord(BaseModel):
    """Almacena información sobre la respuesta de un jugador a una pregunta específica."""
    player_nickname: str = Field(..., description="Nickname del jugador que respondió")
    answer_id: str = Field(..., description="ID de la opción seleccionada por el jugador")
    received_at: float = Field(..., description="Timestamp (time.time()) de cuándo se recibió la respuesta")
    score_awarded: int = Field(default=0, description="Puntos obtenidos por esta respuesta")
    is_correct: bool = Field(default=False, description="Indica si la respuesta fue correcta")

class Game(BaseModel):
    """Representa el estado completo de una partida en curso."""
    game_code: str = Field(..., description="Código único de 4 caracteres alfanuméricos (mayúsculas) que identifica la partida")
    host_connection: Optional[WebSocket] = Field(default=None, exclude=True, description="Conexión WebSocket del anfitrión (host)")
    quiz_data: Optional[QuizData] = Field(default=None, description="Datos del cuestionario cargado para esta partida")
    players: Dict[WebSocket, Player] = Field(default_factory=dict, description="Diccionario que mapea conexiones WebSocket a objetos Player")
    state: GameStateEnum = Field(default=GameStateEnum.LOBBY, description="Estado actual de la partida (Lobby, Pregunta, Marcador, Finalizada)")
    current_question_index: int = Field(default=-1, description="Índice de la pregunta actual dentro de quiz_data.questions")
    question_start_time: Optional[float] = Field(default=None, description="Timestamp (time.time()) de cuándo se envió la pregunta actual")
    answers_received_this_round: Dict[str, AnswerRecord] = Field(default_factory=dict, description="Registro de las respuestas recibidas para la pregunta actual (nickname -> AnswerRecord)")
    active_connections: List[WebSocket] = Field(default_factory=list, exclude=True, description="Lista de todas las conexiones WebSocket activas en la partida (incluye host y jugadores)")
    current_correct_answer_id: Optional[str] = Field(default=None, exclude=True, description="ID de la respuesta correcta para la pregunta actual (cacheada para rápido acceso)")

    class Config:
        arbitrary_types_allowed = True # Permite el tipo WebSocket

# --- Modelos para Mensajes WebSocket (Protocolo Cliente <-> Servidor) ---

# --- Payloads Cliente -> Servidor ---

class JoinGamePayload(BaseModel):
    """Payload para el mensaje 'join_game' enviado por un jugador."""
    nickname: str = Field(..., description="Nickname que el jugador desea usar")

class SubmitAnswerPayload(BaseModel):
    """Payload para el mensaje 'submit_answer' enviado por un jugador."""
    answer_id: str = Field(..., description="ID de la opción que el jugador seleccionó")

# Los siguientes payloads son solo marcadores de tipo, no llevan datos
class StartGamePayload(BaseModel):
    """Payload (vacío) para el mensaje 'start_game' enviado por el host."""
    pass
class NextQuestionPayloadInput(BaseModel):
    """Payload (vacío) para el mensaje 'next_question' enviado por el host."""
    pass
class EndGamePayloadInput(BaseModel):
    """Payload (vacío) para el mensaje 'end_game' enviado por el host."""
    pass

# --- Payloads Servidor -> Cliente ---

class JoinAckPayload(BaseModel):
    """Payload para el mensaje 'join_ack' enviado al jugador que se une."""
    nickname: str = Field(..., description="Nickname confirmado del jugador")
    message: str = Field(..., description="Mensaje de bienvenida o estado")
    # --- AÑADIDO ---
    player_count: int = Field(..., description="Número total de jugadores reales (sin host) al momento de unirse")

class PlayerJoinedPayload(BaseModel):
    """Payload para el mensaje 'player_joined' broadcast a todos."""
    nickname: str = Field(..., description="Nickname del jugador que se unió")
    player_count: int = Field(..., description="Número total de jugadores (sin host) actual")

class PlayerLeftPayload(BaseModel):
    """Payload para el mensaje 'player_left' broadcast a todos."""
    nickname: str = Field(..., description="Nickname del jugador que se desconectó")
    player_count: int = Field(..., description="Número total de jugadores (sin host) restante")

class GameStartedPayload(BaseModel):
    """Payload (vacío) para el mensaje 'game_started' broadcast a todos."""
    pass

class NewQuestionPayload(BaseModel):
    """Payload para el mensaje 'new_question' broadcast a todos."""
    question_id: str = Field(..., description="ID único de la pregunta actual")
    question_text: str = Field(..., description="Texto de la pregunta")
    options: List[Option] = Field(..., description="Lista de opciones (con IDs) para mostrar")
    time_limit: int = Field(..., description="Tiempo límite en segundos para responder")
    question_number: int = Field(..., description="Número de la pregunta actual (empezando en 1)")
    total_questions: int = Field(..., description="Número total de preguntas en el quiz")

class AnswerResultPayload(BaseModel):
    """Payload para el mensaje 'answer_result' enviado al jugador que respondió."""
    is_correct: bool = Field(..., description="Indica si la respuesta fue correcta")
    correct_answer_id: str = Field(..., description="ID de la opción que era correcta")
    points_awarded: int = Field(..., description="Puntos ganados por esta respuesta")
    current_score: int = Field(..., description="Puntuación total actual del jugador")
    current_rank: int = Field(..., description="Posición actual del jugador en el marcador")

class ScoreboardEntry(BaseModel):
    """Representa una entrada individual en el marcador."""
    rank: int = Field(..., description="Posición del jugador (1 es el primero)")
    nickname: str = Field(..., description="Nickname del jugador")
    score: int = Field(..., description="Puntuación del jugador")

class UpdateScoreboardPayload(BaseModel):
    """Payload para el mensaje 'update_scoreboard' broadcast a todos."""
    scoreboard: List[ScoreboardEntry] = Field(..., description="Lista ordenada de jugadores y sus puntuaciones")

class GameOverPayload(BaseModel):
    """Payload para el mensaje 'game_over' enviado a cada jugador."""
    podium: List[ScoreboardEntry] = Field(..., description="Los 3 mejores jugadores (o menos si hay menos jugadores, excluyendo al host)")
    my_final_rank: Optional[int] = Field(default=None, description="El rango final específico de este jugador entre todos los jugadores (excluyendo host)")
    my_final_score: Optional[int] = Field(default=None, description="La puntuación final específica de este jugador")

class ErrorPayload(BaseModel):
    """Payload para mensajes de 'error' enviados a un cliente específico o broadcast."""
    message: str = Field(..., description="Descripción del error")
    code: Optional[str] = Field(default=None, description="Código opcional para identificar el tipo de error (ej: 'INVALID_GAME_CODE')")

class WebSocketMessage(BaseModel):
    """Estructura estándar para todos los mensajes WebSocket."""
    type: str = Field(..., description="Tipo de mensaje (ej: 'join_game', 'new_question')")
    payload: Optional[Any] = Field(default=None, description="Datos asociados al mensaje, varía según el tipo")
