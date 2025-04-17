// --- Lógica del Dashboard (Simulada con LocalStorage) ---

// Referencias a elementos
let quizListContainer, createQuizBtn, noQuizzesMessage;

 function loadQuizzesFromStorage() {
    quizListContainer = quizListContainer || document.getElementById('quiz-list');
    noQuizzesMessage = noQuizzesMessage || document.getElementById('no-quizzes-message');
    if (!quizListContainer || !noQuizzesMessage) return;

    console.log("Loading quizzes from localStorage...");
    quizListContainer.innerHTML = '<p class="list-group-item text-muted">Cargando...</p>';
    noQuizzesMessage.style.display = 'none';
     const storedQuizzes = localStorage.getItem('hostQuizzes');
     if (storedQuizzes) {
         try {
             window.quizzes = JSON.parse(storedQuizzes); // Store in global scope for now
         } catch (e) {
             console.error("Error parsing quizzes from localStorage", e);
             window.quizzes = []; // Resetear si hay error
             localStorage.removeItem('hostQuizzes'); // Limpiar dato corrupto
         }
     } else {
         // Si no hay nada, crear datos de ejemplo y guardarlos
         console.log("No quizzes found in localStorage, creating demo data...");
          window.quizzes = [
             { id: 'demo_q1', title: 'Cultura General (Demo)', questions: [{id: 'dq1_1', text: '¿Capital de Francia?', time_limit: 15, options: [{id:'dq1_1_o1', text:'Berlín', is_correct: false},{id:'dq1_1_o2', text:'Madrid', is_correct: false},{id:'dq1_1_o3', text:'París', is_correct: true},{id:'dq1_1_o4', text:'Roma', is_correct: false}]}, {id: 'dq1_2', text: '¿2 + 2?', time_limit: 10, options: [{id:'dq1_2_o1', text:'3', is_correct: false},{id:'dq1_2_o2', text:'4', is_correct: true},{id:'dq1_2_o3', text:'5', is_correct: false}]}]},
             { id: 'demo_q2', title: 'Planetas (Demo)', questions: [{id: 'dq2_1', text: '¿Planeta Rojo?', time_limit: 12, options: [{id:'dq2_1_o1', text:'Júpiter', is_correct: false},{id:'dq2_1_o2', text:'Marte', is_correct: true},{id:'dq2_1_o3', text:'Venus', is_correct: false},{id:'dq2_1_o4', text:'Saturno', is_correct: false}]}] },
         ];
         saveQuizzesToStorage(); // Guardar los de ejemplo
     }
     renderQuizList();
 }

 function saveQuizzesToStorage() {
     try {
         localStorage.setItem('hostQuizzes', JSON.stringify(window.quizzes));
         console.log("Quizzes saved to localStorage");
     } catch (e) {
         console.error("Error saving quizzes to localStorage", e);
         alert("Error al guardar los cuestionarios localmente. Puede que el almacenamiento esté lleno.");
     }
 }

 function renderQuizList() {
    // Re-get elements
    quizListContainer = quizListContainer || document.getElementById('quiz-list');
    noQuizzesMessage = noQuizzesMessage || document.getElementById('no-quizzes-message');
    if (!quizListContainer || !noQuizzesMessage) return;

    quizListContainer.innerHTML = '';
    if (window.quizzes.length === 0) {
        noQuizzesMessage.style.display = 'block';
    } else {
        noQuizzesMessage.style.display = 'none';
        window.quizzes.forEach(quiz => {
            const div = document.createElement('div');
            div.className = 'list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 bg-dark text-light border-secondary';
            const questionCount = quiz.questions ? quiz.questions.length : 0;
            div.innerHTML = `
                <span class="fw-bold flex-grow-1 me-3">${quiz.title} (${questionCount} ${questionCount === 1 ? 'pregunta' : 'preguntas'})</span>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-primary start-quiz-btn" data-quiz-id="${quiz.id}" title="Iniciar Partida"><i class="bi bi-play-fill"></i> Iniciar</button>
                    <button class="btn btn-sm btn-secondary edit-quiz-btn" data-quiz-id="${quiz.id}" title="Editar Cuestionario"><i class="bi bi-pencil-fill"></i> Editar</button>
                    <button class="btn btn-sm btn-danger delete-quiz-btn" data-quiz-id="${quiz.id}" title="Eliminar Cuestionario"><i class="bi bi-trash-fill"></i> Eliminar</button>
                </div>`;
            // Add listeners directly here
            const startBtn = div.querySelector('.start-quiz-btn');
            const editBtn = div.querySelector('.edit-quiz-btn');
            const deleteBtn = div.querySelector('.delete-quiz-btn');

            if(startBtn) startBtn.addEventListener('click', () => initiateGame(quiz.id)); // initiateGame is in game.js now
            if(editBtn) editBtn.addEventListener('click', () => loadQuizForEditing(quiz.id)); // loadQuizForEditing is in builder.js now
            if(deleteBtn) deleteBtn.addEventListener('click', () => deleteQuiz(quiz.id, quiz.title));
            quizListContainer.appendChild(div);
        });
    }
 }

 function deleteQuiz(quizId, quizTitle) {
    if (!confirm(`¿Estás seguro de que quieres eliminar "${quizTitle}"? Esta acción NO se puede deshacer.`)) return;
     console.log("Deleting quiz:", quizId);
     window.quizzes = window.quizzes.filter(q => q.id !== quizId);
     saveQuizzesToStorage(); // Guardar cambios en localStorage
     renderQuizList(); // Actualizar la lista
     alert(`Cuestionario "${quizTitle}" eliminado.`);
 }

 function initDashboard() {
    quizListContainer = document.getElementById('quiz-list');
    createQuizBtn = document.getElementById('create-quiz-btn');
    noQuizzesMessage = document.getElementById('no-quizzes-message');

    if (createQuizBtn) {
        // openQuizBuilder is in builder.js
        createQuizBtn.addEventListener('click', () => openQuizBuilder());
    }

    // Initial load if authenticated (might be called from main.js instead)
    // if (window.hostAuthToken) {
    //     loadQuizzesFromStorage();
    // }
 }
