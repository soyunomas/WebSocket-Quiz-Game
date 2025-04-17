// --- Lógica del Juego (Host) ---

// Referencias a elementos
let hostLobbyView, hostGameView, hostEndView, gameCodeDisplay, quizLoadStatus,
    playerCount, playerListLobby, startGameBtn, cancelLobbyBtn,
    questionNumberDisplay, questionTextDisplay, hostOptionsPreview,
    timerDisplay, timerBar, resultsDisplay, answerSummaryChart,
    leaderboardList, nextQuestionBtn, endGameBtn, finalPodiumListHost,
    backToDashboardBtn,
    confirmEndGameModal = null, // Variable para el objeto Modal de Bootstrap
    confirmEndGameButton = null; // Variable para el botón de confirmar en el modal


// Variables de estado del juego (declaradas globalmente en main.js, usadas aquí)
// let hostWebSocket = null;
// let currentQuizForGame = null;
// let currentGameCode = null;
// let questionTimerInterval = null;
// let currentQuestionIndex = 0;
// let totalQuestionsInGame = 0;
// let currentQuestionData = null;
// let currentPlayers = {};
// let isQuizDataLoaded = false;


async function initiateGame(quizId) {
    console.log("Initiating game creation process for quizId:", quizId);
    // 1. Find the quiz data first
    const selectedQuiz = window.quizzes.find(q => q.id === quizId);
    if (!selectedQuiz) {
        alert("Error: No se encontró el cuestionario seleccionado."); return;
    }
    if (!selectedQuiz.questions || selectedQuiz.questions.length === 0) {
        alert("Error: Este cuestionario no tiene preguntas."); return;
    }
    console.log("Selected quiz:", selectedQuiz.title);

    // 2. Reset the general game state *before* using the selected quiz data
    resetHostState(); // utils.js function

    // 3. Assign the found quiz to the global variable
    window.currentQuizForGame = JSON.parse(JSON.stringify(selectedQuiz)); // Deep copy

    // 4. Update UI and proceed with API call/WebSocket connection
    gameCodeDisplay = gameCodeDisplay || document.getElementById('game-code-display');
    quizLoadStatus = quizLoadStatus || document.getElementById('quiz-load-status');
    startGameBtn = startGameBtn || document.getElementById('start-game-btn');
    cancelLobbyBtn = cancelLobbyBtn || document.getElementById('cancel-lobby-btn');

    showView('host-lobby-view'); // utils.js function
    if(gameCodeDisplay) gameCodeDisplay.textContent = 'CREANDO...';
    if(quizLoadStatus) quizLoadStatus.textContent = `Cargando quiz: ${window.currentQuizForGame.title}...`;
    if(startGameBtn) startGameBtn.disabled = true;
    if(cancelLobbyBtn) cancelLobbyBtn.disabled = true;

    // 5. Call backend API
    try {
        // --- INICIO LLAMADA REAL A LA API ---
        const response = await fetch('/create_game/', { method: 'POST' });

        if (!response.ok) {
             let errorDetail = `Error ${response.status}`;
             try {
                 const errorData = await response.json();
                 errorDetail = errorData.detail || errorDetail;
             } catch (e) {
                console.warn("Could not parse error response JSON from /create_game/");
             }
             throw new Error(errorDetail);
        }
        const data = await response.json();
        // --- FIN LLAMADA REAL A LA API ---

        if (!data || !data.game_code) {
            throw new Error("La respuesta del servidor no incluyó un código de partida.");
        }

        window.currentGameCode = data.game_code;
        console.log("Game shell created successfully by SERVER! Code:", window.currentGameCode);

        // 6. Connect WebSocket con el código real
        connectHostWebSocket(window.currentGameCode);

        cancelLobbyBtn = cancelLobbyBtn || document.getElementById('cancel-lobby-btn');
        if(cancelLobbyBtn) cancelLobbyBtn.disabled = false;

    } catch (error) {
        console.error("Failed to create game shell:", error);
        alert(`Error al crear la partida: ${error.message}`);
        resetHostState();
        showView('dashboard-view');
    }
} // Fin de la función initiateGame


// Función para crear el HTML del indicador de espera
function createWaitingIndicatorHTML() {
    return `<li class="list-group-item text-muted waiting-indicator">Esperando jugadores<span class="dots">...</span></li>`;
}

function connectHostWebSocket(gameCode) {
     // Use actual hostname if deployed, or localhost/port during development
     const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
     // Make sure this points to your backend WebSocket endpoint
     const wsUrl = `${wsProtocol}//${window.location.host}/ws/${gameCode}`; // Adjust if backend runs elsewhere

     console.log(`Host connecting to WebSocket: ${wsUrl}`);
     gameCodeDisplay = gameCodeDisplay || document.getElementById('game-code-display');
     playerListLobby = playerListLobby || document.getElementById('player-list-lobby'); // Asegurarse que se obtiene
     playerCount = playerCount || document.getElementById('player-count');
     startGameBtn = startGameBtn || document.getElementById('start-game-btn');
     quizLoadStatus = quizLoadStatus || document.getElementById('quiz-load-status');

     if(gameCodeDisplay) gameCodeDisplay.textContent = gameCode;
     window.currentPlayers = {}; // Reset players for the new game

     // -------- MODIFICADO --------
     // Establecer el indicador de espera inicial
     if(playerListLobby) playerListLobby.innerHTML = createWaitingIndicatorHTML();
     // --------------------------

     if(playerCount) playerCount.textContent = '0';
     if(startGameBtn) startGameBtn.disabled = true;
     window.isQuizDataLoaded = false;

     // Limpiar conexión anterior si existiera
     if (window.hostWebSocket && window.hostWebSocket.readyState !== WebSocket.CLOSED && window.hostWebSocket.readyState !== WebSocket.CLOSING) {
         console.warn("Closing previous WebSocket connection...");
         window.hostWebSocket.close();
     }

     try {
        window.hostWebSocket = new WebSocket(wsUrl);
     } catch (error) {
        console.error("Failed to create WebSocket:", error);
        alert("Error al intentar conectar con el servidor de juego. Asegúrate de que el servidor esté corriendo.");
        if(quizLoadStatus) quizLoadStatus.textContent = "Error de conexión.";
        resetHostState();
        showView('dashboard-view');
        return;
     }


     window.hostWebSocket.onopen = () => {
         console.log("Host WebSocket connected!");
         // a) Unirse como host
         const hostNickname = window.hostEmail || `Host_${gameCode}`;
         sendHostCommand("join_game", { nickname: hostNickname });

         // b) Enviar los datos del quiz
         if (window.currentQuizForGame) {
             console.log("Sending quiz data to backend...");
             if(quizLoadStatus) quizLoadStatus.textContent = `Enviando datos de '${window.currentQuizForGame.title}'...`;
             sendHostCommand("load_quiz_data", window.currentQuizForGame);
         } else {
             console.error("Critical Error: currentQuizForGame is null when WebSocket opened!");
             if(quizLoadStatus) quizLoadStatus.textContent = "Error: No hay datos de quiz para enviar.";
             alert("Error crítico: No se pudieron cargar los datos del cuestionario para enviar.");
             cancelGame(false); // Cancelar sin preguntar
         }
     };

     window.hostWebSocket.onmessage = (event) => {
         console.debug("Host received message:", event.data);
         try {
             const message = JSON.parse(event.data);
             handleHostWebSocketMessage(message);
         } catch (error) {
             console.error("Host failed to parse message:", error, event.data);
         }
     };

     window.hostWebSocket.onerror = (error) => {
         console.error("Host WebSocket error:", error);
         alert("Error de conexión WebSocket como anfitrión. La partida no puede continuar.");
         // onclose will handle cleanup
         showView('dashboard-view');
     };

     window.hostWebSocket.onclose = (event) => {
         console.log("Host WebSocket closed:", event.code, event.reason, `WasClean: ${event.wasClean}`);
         hostEndView = hostEndView || document.getElementById('host-end-view'); // Ensure element is checked
         const gameEndedNormally = hostEndView && hostEndView.style.display !== 'none';

         if (!gameEndedNormally) {
              if (!event.wasClean && event.code !== 1000 && event.code !== 1008) { // Ignore expected closures
                  alert(`Conexión perdida inesperadamente (Host): ${event.reason || event.code}. Volviendo al dashboard.`);
              }
              resetHostState();
              const authView = document.getElementById('auth-view'); // Check if logged out
              if (authView && authView.style.display === 'none') {
                 showView('dashboard-view');
              }
         } else {
             console.log("WebSocket closed after game finished.");
             window.hostWebSocket = null; // Clear WS variable but keep state for podium view
         }
     };
}

function handleHostWebSocketMessage(message) {
     const type = message.type;
     const payload = message.payload;
     console.log("Host processing message:", type, payload);

     // Ensure UI elements are available
     startGameBtn = startGameBtn || document.getElementById('start-game-btn');
     quizLoadStatus = quizLoadStatus || document.getElementById('quiz-load-status');
     resultsDisplay = resultsDisplay || document.getElementById('results-display');
     nextQuestionBtn = nextQuestionBtn || document.getElementById('next-question-btn');
     timerBar = timerBar || document.getElementById('timer-bar');

     switch (type) {
         case 'join_ack':
             console.log(`Join Ack received for ${payload.nickname}. Msg: ${payload.message}`);
             if (!window.currentPlayers[payload.nickname]) {
                 addPlayerToLobby(payload.nickname);
                 updatePlayerCount(Object.keys(window.currentPlayers).length);
             }
             break;

        case 'quiz_loaded_ack':
            console.log("Backend acknowledged quiz data load:", payload);
            window.isQuizDataLoaded = true;
            if (quizLoadStatus) {
                quizLoadStatus.textContent = `Quiz '${payload.title}' (${payload.question_count} preg.) cargado. ¡Listo para empezar!`;
                quizLoadStatus.className = 'mb-3 text-success';
            }
            if(startGameBtn) startGameBtn.disabled = Object.keys(window.currentPlayers).length === 0;
            break;

         case 'player_joined':
             console.log("Player joined lobby:", payload.nickname);
              addPlayerToLobby(payload.nickname);
             updatePlayerCount(payload.player_count);
             // Habilitar botón Start si quiz cargado y hay jugadores
             // (La actualización de player_count ya maneja esto implícitamente)
             // if (window.isQuizDataLoaded && startGameBtn) {
             //     startGameBtn.disabled = payload.player_count === 0; // player_count del backend incluye host? Usar currentPlayers
             // }
             break;

         case 'player_left':
             console.log("Player left lobby:", payload.nickname);
              removePlayerFromLobby(payload.nickname);
             updatePlayerCount(payload.player_count);
             // Deshabilitar si no quedan jugadores
             // (La actualización de player_count ya maneja esto implícitamente)
             // if(startGameBtn) startGameBtn.disabled = Object.keys(window.currentPlayers).length === 0;
             break;

          case 'game_started':
             console.log("Game started acknowledge by server.");
             showView('host-game-view');
             break;

          case 'new_question':
              console.log("Host received new question data.");
              window.currentQuestionData = payload;
              displayHostQuestion(payload);
              updateLeaderboard([]); // Clear leaderboard for new question
              if(resultsDisplay) resultsDisplay.style.display = 'none';
              if(nextQuestionBtn) nextQuestionBtn.disabled = false; // Habilitar "Siguiente" para mostrar marcador
              break;

          case 'update_scoreboard':
              console.log("Host received scoreboard update.");
              if(window.questionTimerInterval) clearInterval(window.questionTimerInterval);
              if (timerBar) {
                   timerBar.style.width = '0%';
                   timerBar.textContent = 'Resultados';
                   timerBar.classList.remove('progress-bar-animated', 'bg-danger', 'bg-info');
               }
              updateLeaderboard(payload.scoreboard);
              if(resultsDisplay) resultsDisplay.style.display = 'block';
              // El avance será automático o por clic del host (dejamos el botón habilitado)
              if(nextQuestionBtn) nextQuestionBtn.disabled = false;
              break;

           case 'game_over':
               console.log("!!!!!! Host received game_over message from server", payload); // DEBUG
               console.log("Host received game over.");
               if(window.questionTimerInterval) clearInterval(window.questionTimerInterval);
               displayHostFinalPodium(payload);
               console.log("!!!!!! Before showing host-end-view"); // DEBUG
               showView('host-end-view');
               console.log("!!!!!! After showing host-end-view"); // DEBUG
               if (window.hostWebSocket && window.hostWebSocket.readyState === WebSocket.OPEN) {
                    window.hostWebSocket.close(1000, "Game finished normally");
               }
               break;

           case 'error':
                console.error("Host received error from server:", payload.message, payload.code);
                alert(`Error del Servidor (Host): ${payload.message}`);
                 if (payload.code === 'QUIZ_LOAD_ERROR' || payload.message?.includes("Formato de cuestionario inválido")) {
                     if(quizLoadStatus) {
                        quizLoadStatus.textContent = `Error cargando quiz: ${payload.message}`;
                        quizLoadStatus.className = 'mb-3 text-danger';
                     }
                     cancelGame(false);
                 } else if (payload.code === 'HOST_DISCONNECTED') {
                     alert("El servidor detectó una desconexión del host.");
                      cancelGame(false);
                 }
                break;

           // Mensaje informativo opcional si el host pulsa 'Siguiente' durante el marcador
           case 'info':
               console.log("Server info:", payload.message);
               // Podríamos mostrar un toast o nada
               break;

         default:
             console.warn("Host received unhandled message type:", type, payload);
     }
}

function addPlayerToLobby(nickname) {
     playerListLobby = playerListLobby || document.getElementById('player-list-lobby');
     if (!playerListLobby) return;

     const hostNicknamePattern = /^(Host_|admin)/i;
     if (hostNicknamePattern.test(nickname)) {
         console.log("Host join confirmed, not adding to visible list.");
         return; // No mostrar host en la lista visible
     }

     if (window.currentPlayers[nickname]) return; // Evitar duplicados
     window.currentPlayers[nickname] = true; // Marcar como presente

     // -------- MODIFICADO --------
     // Si es el primer jugador REAL, limpiar el indicador de espera
     const waitingIndicator = playerListLobby.querySelector('.waiting-indicator');
     if (waitingIndicator) {
         waitingIndicator.remove();
     }
     // --------------------------

     // Añadir el jugador a la lista
     const li = document.createElement('li');
     li.className = 'list-group-item';
     li.textContent = nickname;
     li.id = `player-lobby-${nickname.replace(/\W/g, '_')}`; // ID más seguro
     playerListLobby.appendChild(li);
 }

 function removePlayerFromLobby(nickname) {
    playerListLobby = playerListLobby || document.getElementById('player-list-lobby');

     const hostNicknamePattern = /^(Host_|admin)/i;
      if (hostNicknamePattern.test(nickname)) {
         console.log("Host left confirmation received.");
         return; // Ignorar si es el host (ya se maneja en disconnect)
     }

     delete window.currentPlayers[nickname]; // Quitar del registro interno
     const li = document.getElementById(`player-lobby-${nickname.replace(/\W/g, '_')}`);
     if (li) {
         li.remove();
     }

     // -------- MODIFICADO --------
     // Si no quedan jugadores REALES y el elemento de la lista existe,
     // volver a mostrar el indicador de espera
     if (playerListLobby && Object.keys(window.currentPlayers).length === 0) {
          playerListLobby.innerHTML = createWaitingIndicatorHTML();
     }
     // --------------------------
 }

 function updatePlayerCount(backendPlayerCount) {
     playerCount = playerCount || document.getElementById('player-count');
     startGameBtn = startGameBtn || document.getElementById('start-game-btn');

     // Contar solo los jugadores reales que tenemos registrados en el frontend
     const displayCount = Object.keys(window.currentPlayers).length;
     if(playerCount) playerCount.textContent = displayCount;
     // Habilitar botón Start solo si el quiz está cargado Y hay al menos 1 jugador (real)
     if(startGameBtn) startGameBtn.disabled = !(window.isQuizDataLoaded && displayCount > 0);
 }

function sendHostCommand(commandType, data = {}) {
     console.log("Attempting to send command:", commandType); // DEBUG
     console.log("WebSocket state:", window.hostWebSocket?.readyState); // DEBUG (1 means OPEN)
     if (!window.hostWebSocket || window.hostWebSocket.readyState !== WebSocket.OPEN) {
         console.error("Host WebSocket is not connected to send command:", commandType);
         if (commandType === 'start_game' || commandType === 'next_question' || commandType === 'end_game') {
             alert("Error: No se pudo enviar el comando. Conexión perdida.");
              resetHostState();
              showView('dashboard-view');
         }
         return false;
     }
     try {
        const message = JSON.stringify({ type: commandType, payload: data });
        console.log("Host sending command:", commandType, data);
        window.hostWebSocket.send(message);
        return true;
     } catch (error) {
         console.error("Error sending command:", commandType, error);
         return false;
     }
 }

function displayHostQuestion(questionPayload) {
    questionNumberDisplay = questionNumberDisplay || document.getElementById('question-number');
    questionTextDisplay = questionTextDisplay || document.getElementById('question-text');
    hostOptionsPreview = hostOptionsPreview || document.getElementById('host-options-preview');
    if (!questionNumberDisplay || !questionTextDisplay || !hostOptionsPreview) return;

    window.currentQuestionIndex = questionPayload.question_number - 1;
    window.totalQuestionsInGame = questionPayload.total_questions;

    questionNumberDisplay.textContent = `Pregunta ${questionPayload.question_number} / ${window.totalQuestionsInGame}`;
    questionTextDisplay.textContent = questionPayload.question_text;

    hostOptionsPreview.innerHTML = '';
    const symbols = ['▲', '◆', '●', '■'];
    const colors = ['text-danger', 'text-primary', 'text-warning', 'text-success'];

    if (window.currentQuizForGame && window.currentQuizForGame.questions[window.currentQuestionIndex]) {
        const originalQuestion = window.currentQuizForGame.questions[window.currentQuestionIndex];
        const correctOptionId = originalQuestion.options.find(opt => opt.is_correct)?.id;

        questionPayload.options.forEach((opt, index) => {
            const div = document.createElement('div');
            div.className = `col-md-6 small`;
            let content = `<strong class="fs-5 ${colors[index % 4]}">${symbols[index % 4]}</strong> ${opt.text}`;
            if (opt.id === correctOptionId) {
                content += ' <i class="bi bi-check-circle-fill text-success ms-1" title="Respuesta Correcta"></i>';
                div.classList.add('fw-bold');
            } else {
                div.classList.add('text-muted');
            }
            div.innerHTML = content;
            hostOptionsPreview.appendChild(div);
        });
    } else {
         console.warn("Could not find original quiz data to mark correct answer for host preview.");
         questionPayload.options.forEach((opt, index) => {
            const div = document.createElement('div');
            div.className = `col-md-6 small ${colors[index % 4]}`;
            div.innerHTML = `<strong class="fs-5">${symbols[index % 4]}</strong> ${opt.text}`;
            hostOptionsPreview.appendChild(div);
         });
    }
    startHostTimer(questionPayload.time_limit);
 }

 function startHostTimer(duration) {
     timerBar = timerBar || document.getElementById('timer-bar');
     if (!timerBar) return;

     if (window.questionTimerInterval) clearInterval(window.questionTimerInterval);
     let timeLeft = duration;
     let maxTime = duration;
     timerBar.style.width = '100%';
     timerBar.className = 'progress-bar progress-bar-striped progress-bar-animated bg-info';
     timerBar.textContent = `${timeLeft}s`;
     timerBar.setAttribute('aria-valuenow', timeLeft);
     timerBar.setAttribute('aria-valuemax', maxTime);

     window.questionTimerInterval = setInterval(() => {
         timeLeft--;
         const percentage = Math.max(0, (timeLeft / maxTime) * 100);
         timerBar = timerBar || document.getElementById('timer-bar');
         if (!timerBar) {
            clearInterval(window.questionTimerInterval);
            return;
         }

         timerBar.style.width = `${percentage}%`;
         timerBar.textContent = `${timeLeft}s`;
         timerBar.setAttribute('aria-valuenow', timeLeft);

         if (timeLeft <= 5 && !timerBar.classList.contains('bg-danger')) {
             timerBar.classList.remove('bg-info');
             timerBar.classList.add('bg-danger');
         }

         if (timeLeft <= 0) {
             clearInterval(window.questionTimerInterval);
             window.questionTimerInterval = null;
             timerBar.textContent = "¡Tiempo!";
             timerBar.classList.remove('progress-bar-animated');
             // Ya no habilitamos 'Next' aquí, el servidor controla el flujo
             // nextQuestionBtn = nextQuestionBtn || document.getElementById('next-question-btn');
             // if(nextQuestionBtn) nextQuestionBtn.disabled = false;
             console.log("Host timer finished.");
             // El servidor debería enviar 'update_scoreboard' ahora o pronto
         }
     }, 1000);
 }

function updateLeaderboard(leaderboardData) {
     leaderboardList = leaderboardList || document.getElementById('leaderboard');
     if (!leaderboardList) return;

     leaderboardList.innerHTML = '';
     if (leaderboardData && leaderboardData.length > 0) {
         leaderboardData.slice(0, 5).forEach(player => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
             li.innerHTML = `<span>${player.rank}. ${player.nickname}</span><span class="badge bg-primary rounded-pill">${player.score}</span>`;
             leaderboardList.appendChild(li);
         });
     } else {
         leaderboardList.innerHTML = '<li class="list-group-item text-muted">Esperando resultados...</li>';
     }
 }

function displayHostFinalPodium(podiumData) {
     finalPodiumListHost = finalPodiumListHost || document.getElementById('final-podium-list-host');
     if (!finalPodiumListHost) return;
     console.log("!!!!!! Entered displayHostFinalPodium", podiumData); // DEBUG
     finalPodiumListHost.innerHTML = '';
      if (podiumData && podiumData.podium && podiumData.podium.length > 0) {
         podiumData.podium.forEach((player) => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center fs-5';
            let medal = '';
             if (player.rank === 1) medal = '🥇 ';
            else if (player.rank === 2) medal = '🥈 ';
            else if (player.rank === 3) medal = '🥉 ';
             else medal = `${player.rank}. `;
             li.innerHTML = `<span>${medal}${player.nickname}</span><span class="badge bg-warning text-dark rounded-pill p-2">${player.score} pts</span>`;
             finalPodiumListHost.appendChild(li);
        });
     } else {
          finalPodiumListHost.innerHTML = '<li class="list-group-item text-muted">No se pudo cargar el podio.</li>';
     }
 }

function cancelGame(confirmNeeded = true) {
     // Usar confirm nativo aquí está bien para cancelar desde el lobby
     let cancelConfirmed = !confirmNeeded;
     if (confirmNeeded) {
        cancelConfirmed = confirm('¿Seguro que quieres cancelar esta partida? Se desconectarán todos los jugadores.');
     }

     if (cancelConfirmed) {
         console.log("Host cancelling the game.");
         if (window.hostWebSocket && window.hostWebSocket.readyState === WebSocket.OPEN) {
              window.hostWebSocket.close(1000, "Host cancelled game");
         }
         resetHostState();
         showView('dashboard-view');
    }
}

function initGameControls() {
    // Get elements for game controls
    hostLobbyView = document.getElementById('host-lobby-view');
    hostGameView = document.getElementById('host-game-view');
    hostEndView = document.getElementById('host-end-view');
    gameCodeDisplay = document.getElementById('game-code-display');
    startGameBtn = document.getElementById('start-game-btn');
    cancelLobbyBtn = document.getElementById('cancel-lobby-btn');
    nextQuestionBtn = document.getElementById('next-question-btn');
    endGameBtn = document.getElementById('end-game-btn');
    backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    resultsDisplay = document.getElementById('results-display');

    // Obtener referencias al modal y su botón de confirmación (PARA FINALIZAR JUEGO)
    const confirmModalElement = document.getElementById('confirmEndGameModal');
    confirmEndGameButton = document.getElementById('confirmEndGameBtn');

    // Inicializar el objeto Modal de Bootstrap si el elemento existe
    if (confirmModalElement) {
        if (!confirmEndGameModal) {
             try {
                confirmEndGameModal = new bootstrap.Modal(confirmModalElement);
             } catch (e) {
                 console.error("Error initializing Bootstrap Modal:", e);
                 confirmEndGameModal = null;
             }
        }
    } else {
        // Solo advertir si no se encuentra el modal, no es un error crítico si no existe
        console.warn("End game confirmation modal element (#confirmEndGameModal) not found!");
    }

    // Add listeners

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (!startGameBtn.disabled) {
                startGameBtn.disabled = true;
                startGameBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Iniciando...';
                sendHostCommand('start_game');
            }
        });
    }

    if (cancelLobbyBtn) cancelLobbyBtn.addEventListener('click', () => cancelGame(true)); // Usa confirm nativo
    if (gameCodeDisplay) gameCodeDisplay.addEventListener('click', copyGameCode);

    if (nextQuestionBtn) {
         // El botón "Siguiente" ahora solo fuerza mostrar el marcador si estamos en QUESTION_DISPLAY
         // o acelera el avance si estamos en LEADERBOARD (aunque lo ignoremos aquí)
        nextQuestionBtn.addEventListener('click', () => {
            if (!nextQuestionBtn.disabled) {
               // No lo deshabilitamos inmediatamente, el servidor controla el flujo
               // nextQuestionBtn.disabled = true;
               // resultsDisplay = resultsDisplay || document.getElementById('results-display');
               // if(resultsDisplay) resultsDisplay.style.display = 'none'; // No ocultar aquí
               sendHostCommand('next_question');
            }
        });
    }

    // ---- LISTENER PARA #end-game-btn (USA EL MODAL) ----
    if (endGameBtn) {
        endGameBtn.addEventListener('click', () => {
            console.log("!!!!!! End Game button listener triggered - checking modal");
            if (confirmEndGameModal) {
                 console.log("!!!!!! Showing Bootstrap Modal for end game confirmation.");
                 confirmEndGameModal.show();
            } else {
                 console.warn("End game modal not available. Using basic confirm().");
                 if (confirm('¿Estás seguro de que quieres finalizar la partida ahora? (Fallback)')) {
                      console.log("!!!!!! Fallback Confirmation OK, calling sendHostCommand...");
                      const sent = sendHostCommand('end_game');
                      if(sent) { // Deshabilitar botones si se envió el comando
                          if(nextQuestionBtn) nextQuestionBtn.disabled = true;
                          if(endGameBtn) endGameBtn.disabled = true;
                      }
                 } else {
                      console.log("!!!!!! Fallback Confirmation cancelled.");
                 }
            }
        });
    }
    // -----------------------------------------------

    // ---- LISTENER PARA EL BOTÓN DENTRO DEL MODAL ----
    if (confirmEndGameButton) {
        // Podríamos necesitar remover el listener anterior si initGameControls se llama múltiples veces
        // pero asumimos que solo se llama una vez en main.js
        confirmEndGameButton.addEventListener('click', () => {
            console.log("!!!!!! Modal Confirmation OK, calling sendHostCommand...");
            const sent = sendHostCommand('end_game');
            if(sent) {
                // Deshabilitar botones para feedback inmediato
                if(nextQuestionBtn) nextQuestionBtn.disabled = true;
                if(endGameBtn) endGameBtn.disabled = true;
            }
            if (confirmEndGameModal) { // Ocultar modal si existe
                confirmEndGameModal.hide();
            }
        });
    } else {
        // Solo advertir si el botón del modal no se encuentra
        console.warn("Confirmation button inside modal (#confirmEndGameBtn) not found!");
    }
    // ------------------------------------------------------

    if (backToDashboardBtn) {
        backToDashboardBtn.addEventListener('click', () => {
             resetHostState();
             loadQuizzesFromStorage(); // Reload quizzes
             showView('dashboard-view');
        });
    }
} // Fin de initGameControls
