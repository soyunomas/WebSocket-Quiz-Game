// --- UI Helpers ---
function showView(viewId) {
    const views = document.querySelectorAll('main > section');
    views.forEach(view => {
        view.style.display = view.id === viewId ? 'block' : 'none';
    });
    // Control visibilidad botón logout y email
    const isLoggedIn = viewId !== 'auth-view';
    const logoutBtn = document.getElementById('logout-button');
    const emailDisplay = document.getElementById('host-email-display');

    if (logoutBtn) logoutBtn.style.display = isLoggedIn ? 'inline-block' : 'none';

     if (emailDisplay) {
         if (isLoggedIn && typeof hostEmail !== 'undefined' && hostEmail) { // Check if hostEmail is defined
             emailDisplay.textContent = hostEmail;
             emailDisplay.style.display = 'inline-block';
        } else {
             emailDisplay.style.display = 'none';
        }
    }
     console.log("Host showing view:", viewId);
}

function displayError(elementId, message, isSuccess = false) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message || '';
        errorElement.className = isSuccess ? 'text-success mt-2' : 'text-danger mt-2';
         console.log(`Host status/error display [${elementId}]: ${message}`);
    } else {
        console.warn(`displayError: Element with ID ${elementId} not found.`);
    }
}

function resetHostState() {
     // No reseteamos el estado de auth aquí, se hace en logout
     window.currentQuizForBuilder = null; // Use window scope for globals in this approach
     window.currentQuizForGame = null;
     window.currentGameCode = null;

     if (window.hostWebSocket && window.hostWebSocket.readyState !== WebSocket.CLOSED && window.hostWebSocket.readyState !== WebSocket.CLOSING) {
         window.hostWebSocket.close(1000, "Host state reset");
     }
     window.hostWebSocket = null;
     if (window.questionTimerInterval) clearInterval(window.questionTimerInterval);
     window.questionTimerInterval = null;
     window.currentQuestionIndex = 0;
     window.totalQuestionsInGame = 0;
     window.currentQuestionData = null;
     window.currentPlayers = {}; // Limpiar jugadores del lobby
     window.isQuizDataLoaded = false; // Resetear flag

     // Limpiar UI específica del juego (asegurarse que los elementos existan)
     const playerListLobby = document.getElementById('player-list-lobby');
     const playerCount = document.getElementById('player-count');
     const leaderboardList = document.getElementById('leaderboard');
     const gameCodeDisplay = document.getElementById('game-code-display');
     const startGameBtn = document.getElementById('start-game-btn');
     const nextQuestionBtn = document.getElementById('next-question-btn');
     const finalPodiumListHost = document.getElementById('final-podium-list-host');
     const quizLoadStatus = document.getElementById('quiz-load-status');
     const resultsDisplay = document.getElementById('results-display');

     if(playerListLobby) playerListLobby.innerHTML = '<li class="list-group-item text-muted">Esperando jugadores...</li>';
     if(playerCount) playerCount.textContent = '0';
     if(leaderboardList) leaderboardList.innerHTML = '<li class="list-group-item text-muted">Esperando respuestas...</li>';
     if(gameCodeDisplay) gameCodeDisplay.textContent = '------';
     if(startGameBtn) {
        startGameBtn.disabled = true;
        startGameBtn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Empezar Juego';
     }
     if(nextQuestionBtn) nextQuestionBtn.disabled = true;
     if(finalPodiumListHost) finalPodiumListHost.innerHTML = '';
     if(quizLoadStatus) quizLoadStatus.textContent = '';
     if(resultsDisplay) resultsDisplay.style.display = 'none';

     console.log("Host game state reset (excluding auth)");
}

 function copyGameCode() {
    const gameCodeDisplay = document.getElementById('game-code-display');
    if (window.currentGameCode && gameCodeDisplay && gameCodeDisplay.textContent !== 'CREANDO...' && gameCodeDisplay.textContent !== '------') {
        navigator.clipboard.writeText(window.currentGameCode).then(() => {
            const originalText = gameCodeDisplay.textContent;
            const originalTitle = gameCodeDisplay.title;
            gameCodeDisplay.textContent = '¡COPIADO!';
            gameCodeDisplay.title = ''; // Quitar tooltip temporalmente
            setTimeout(() => {
                // Check if element still exists before updating
                const currentDisplay = document.getElementById('game-code-display');
                if (currentDisplay) {
                    currentDisplay.textContent = originalText;
                    currentDisplay.title = originalTitle;
                }
             }, 1500);
        }).catch(err => {
            console.error('Error copying game code:', err);
        });
    }
}
