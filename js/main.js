// --- Punto de Entrada Principal y Estado Global ---

// Variables Globales (declaradas en el scope global 'window' para acceso simple)
let hostWebSocket = null;
let hostAuthToken = localStorage.getItem('hostAuthToken') || null;
let hostEmail = localStorage.getItem('hostEmail') || null;
let quizzes = []; // Lista de quizzes (cargada desde dashboard.js)
let currentQuizForBuilder = null; // Quiz actual en el editor (manejado en builder.js)
let currentQuizForGame = null; // Quiz seleccionado para jugar (manejado en game.js)
let currentGameCode = null; // Código de la partida actual (manejado en game.js)
let questionTimerInterval = null; // (manejado en game.js)
let currentQuestionIndex = 0; // Índice base 0 (manejado en game.js)
let totalQuestionsInGame = 0; // (manejado en game.js)
let currentQuestionData = null; // Datos de la pregunta actual (manejado en game.js)
let currentPlayers = {}; // { nickname: true } (manejado en game.js)
let isQuizDataLoaded = false; // Flag carga quiz en backend (manejado en game.js)

// --- Inicialización General ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Initializing modules...");

    // Inicializar cada módulo para que obtenga sus elementos y configure listeners
    initAuth();       // Set up login/register/logout listeners
    initDashboard();  // Set up dashboard listeners (create quiz)
    initBuilder();    // Set up quiz builder listeners (add/delete question/option, save, import, D&D)
    initGameControls(); // Set up game control listeners (start, cancel, next, end, back to dash)

    // Carga Inicial basada en autenticación
    if (hostAuthToken && hostEmail) {
         console.log("Host token found, loading dashboard...");
         loadQuizzesFromStorage(); // Carga inicial de quizzes desde dashboard.js
         showView('dashboard-view'); // Muestra vista inicial desde utils.js
    } else {
         console.log("Host token not found, showing auth.");
         showView('auth-view'); // Muestra vista inicial desde utils.js
    }
});

// Nota: Este enfoque usa variables globales (asignadas a `window`).
// Para una aplicación más grande, considera usar Módulos ES6 (`import`/`export`)
// o un objeto de estado global para gestionar las dependencias de forma más explícita.
