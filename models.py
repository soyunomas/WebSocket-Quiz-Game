# models.py
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from enum import Enum
import time
import uuid # Importar uuid para generar IDs si es necesario

from fastapi import WebSocket # Importa WebSocket para usarlo como tipo

# --- Modelos de Datos Internos ---

class GameStateEnum(str, Enum):
    LOBBY = "LOBBY"
    QUESTION_DISPLAY = "QUESTION_DISPLAY"
    LEADERBOARD = "LEADERBOARD"
    FINISHED = "FINISHED"

# Modelo para las opciones DENTRO de un QuizData
class OptionData(BaseModel):
    id: Optional[str] = Field(default_factory=lambda: f"opt_{uuid.uuid4().hex[:6]}", description="ID único opcional")
    text: str = Field(..., description="Texto de la opción")
    is_correct: bool = Field(..., description="Indica si es la opción correcta")

# Modelo para las preguntas DENTRO de un QuizData
class QuestionData(BaseModel):
    id: Optional[str] = Field(default_factory=lambda: f"q_{uuid.uuid4().hex[:8]}", description="ID único opcional")
    text: str = Field(..., description="Texto de la pregunta")
    options: List[OptionData] = Field(..., min_length=2, max_length=4, description="Lista de opciones (2-4)")
    time_limit: int = Field(default=20, ge=5, le=120, description="Tiempo límite en segundos (5-120)")


# Modelo para los datos del Quiz COMPLETO
class QuizData(BaseModel):
    id: Optional[str] = Field(default_factory=lambda: f"quiz_{uuid.uuid4().hex[:10]}", description="ID único opcional")
    title: str = Field(..., description="Título del Quiz")
    questions: List[QuestionData] = Field(..., description="Lista de preguntas")


# --- Modelos Reusados de antes, pero verificados ---

# Modelo para las opciones ENVIADAS a los jugadores (necesitan ID)
class Option(BaseModel):
    id: str = Field(..., description="Identificador único de la opción")
    text: str = Field(..., description="Texto de la opción")

# Modelo para la pregunta ENVIADA a los jugadores (necesita ID)
class Question(BaseModel):
    id: str = Field(..., description="Identificador único de la pregunta")
    text: str = Field(..., description="Texto de la pregunta")
    options: List[Option] = Field(..., description="Lista de opciones")
    correct_answer_id: str = Field(..., description="ID de la opción correcta") # Internamente SI necesitamos este
    time_limit: int = Field(default=15, description="Tiempo límite en segundos")


class Player(BaseModel):
    nickname: str
    connection: WebSocket = Field(..., exclude=True)
    score: int = 0
    last_answer_time: Optional[float] = None
    has_answered_current_question: bool = False

    class Config:
        arbitrary_types_allowed = True

class AnswerRecord(BaseModel):
    player_nickname: str
    answer_id: str
    received_at: float
    score_awarded: int = 0
    is_correct: bool = False

class Game(BaseModel):
    game_code: str
    host_connection: Optional[WebSocket] = Field(default=None, exclude=True)
    quiz_data: Optional[QuizData] = None # Ahora es opcional
    players: Dict[WebSocket, Player] = Field(default_factory=dict)
    state: GameStateEnum = GameStateEnum.LOBBY
    current_question_index: int = -1
    question_start_time: Optional[float] = None
    answers_received_this_round: Dict[str, AnswerRecord] = Field(default_factory=dict)
    active_connections: List[WebSocket] = Field(default_factory=list, exclude=True)

    # ****** CAMBIO REALIZADO AQUÍ ******
    # Renombrar el campo eliminando el guion bajo inicial
    current_correct_answer_id: Optional[str] = Field(default=None, exclude=True)
    # ****** FIN DEL CAMBIO ******

    class Config:
        arbitrary_types_allowed = True


# --- Modelos para Mensajes WebSocket (Protocolo) ---

# -> Servidor (Payloads de entrada)
class JoinGamePayload(BaseModel): nickname: str
class SubmitAnswerPayload(BaseModel): answer_id: str

# --- Payloads Client -> Server ---
class StartGamePayload(BaseModel): pass
class NextQuestionPayloadInput(BaseModel): pass
class EndGamePayloadInput(BaseModel): pass

# --- Payloads Server -> Client ---
class JoinAckPayload(BaseModel): nickname: str; message: str
class PlayerJoinedPayload(BaseModel): nickname: str; player_count: int
class PlayerLeftPayload(BaseModel): nickname: str; player_count: int
class GameStartedPayload(BaseModel): pass
class NewQuestionPayload(BaseModel): # Usa el modelo Option que tiene ID
    question_id: str
    question_text: str
    options: List[Option] # Envía opciones con ID
    time_limit: int
    question_number: int
    total_questions: int
class AnswerResultPayload(BaseModel):
    is_correct: bool
    correct_answer_id: str # Envía el ID correcto
    points_awarded: int
    current_score: int
    current_rank: int
class ScoreboardEntry(BaseModel): rank: int; nickname: str; score: int
class UpdateScoreboardPayload(BaseModel): scoreboard: List[ScoreboardEntry]
class GameOverPayload(BaseModel): podium: List[ScoreboardEntry]
class ErrorPayload(BaseModel): message: str; code: Optional[str] = None

# Contenedor genérico
class WebSocketMessage(BaseModel): type: str; payload: Optional[Any] = None
