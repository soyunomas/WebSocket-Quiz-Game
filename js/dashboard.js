// --- dashboard.js ---

// Referencias a elementos (se obtendrán/verificarán dentro de las funciones)
let quizListContainer, createQuizBtn, noQuizzesMessage;
let confirmDeleteModalInstance = null; // Para guardar la instancia del modal

/**
 * Carga los cuestionarios desde localStorage o crea datos de ejemplo.
 */
function loadQuizzesFromStorage() {
    quizListContainer = quizListContainer || document.getElementById('quiz-list');
    noQuizzesMessage = noQuizzesMessage || document.getElementById('no-quizzes-message');
    if (!quizListContainer || !noQuizzesMessage) {
        console.error("Dashboard elements (quiz-list or no-quizzes-message) not found!");
        return;
    }

    console.log("Loading quizzes from localStorage...");
    quizListContainer.innerHTML = '<p class="list-group-item text-muted">Cargando...</p>';
    noQuizzesMessage.style.display = 'none';
    const storedQuizzes = localStorage.getItem('hostQuizzes');
    if (storedQuizzes) {
        try {
            window.quizzes = JSON.parse(storedQuizzes); // Almacenar en scope global (revisar si es la mejor práctica a largo plazo)
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
    // Asegurarse de que quizzes sea un array
    if (!Array.isArray(window.quizzes)) {
        console.warn("Loaded quizzes is not an array, resetting.");
        window.quizzes = [];
        localStorage.removeItem('hostQuizzes');
    }
    renderQuizList();
}

/**
 * Guarda el array global window.quizzes en localStorage.
 */
function saveQuizzesToStorage() {
    if (!Array.isArray(window.quizzes)) {
        console.error("Cannot save quizzes, window.quizzes is not an array.");
        return;
    }
    try {
        localStorage.setItem('hostQuizzes', JSON.stringify(window.quizzes));
        console.log("Quizzes saved to localStorage");
    } catch (e) {
        console.error("Error saving quizzes to localStorage", e);
        // Considera mostrar un error menos intrusivo que alert si es posible
        // displayErrorOnPage("Error al guardar los cuestionarios localmente.");
    }
}

/**
 * Configura y muestra el modal de confirmación para eliminar un quiz.
 * @param {string} quizId - El ID del cuestionario a eliminar.
 * @param {string} quizTitle - El título del cuestionario a eliminar.
 */
function setupDeleteConfirmation(quizId, quizTitle) {
    // 1. Obtener referencias a los elementos del modal
    const modalElement = document.getElementById('confirmDeleteQuizModal');
    if (!modalElement) {
        console.error("Modal element #confirmDeleteQuizModal not found!");
        return;
    }
    const quizNameElement = document.getElementById('quizNameToDelete');
    const confirmBtn = document.getElementById('confirmDeleteQuizBtn');

    if (!quizNameElement || !confirmBtn) {
        console.error("Modal content elements (quizNameToDelete or confirmDeleteQuizBtn) not found!");
        return;
    }

    // 2. Rellenar el nombre del quiz en el modal
    quizNameElement.textContent = quizTitle || 'este cuestionario'; // Fallback por si el título es undefined

    // 3. Guardar el ID del quiz a eliminar en el botón de confirmación
    confirmBtn.dataset.quizIdToDelete = quizId;

    // 4. Obtener o crear la instancia del modal y mostrarlo
    if (!confirmDeleteModalInstance) {
        confirmDeleteModalInstance = new bootstrap.Modal(modalElement);
    }
    confirmDeleteModalInstance.show();
}

/**
 * Ejecuta la eliminación real del cuestionario después de la confirmación.
 * @param {string} quizId - El ID del cuestionario a eliminar.
 */
function performQuizDeletion(quizId) {
    console.log("Performing deletion for quiz:", quizId);

    if (!Array.isArray(window.quizzes)) {
        console.error("Cannot delete quiz, window.quizzes is not an array.");
        return;
    }

    // Filtrar el cuestionario del array global
    window.quizzes = window.quizzes.filter(q => q && q.id !== quizId); // Añadir verificación de 'q' por seguridad

    // Guardar el array actualizado en localStorage
    saveQuizzesToStorage();

    // Volver a renderizar la lista para reflejar el cambio en la UI
    renderQuizList();

    console.log(`Quiz ${quizId} deleted successfully.`);
    // No se muestra ningún alert aquí.
}

/**
 * Renderiza la lista de cuestionarios en el contenedor HTML.
 */
function renderQuizList() {
    quizListContainer = quizListContainer || document.getElementById('quiz-list');
    noQuizzesMessage = noQuizzesMessage || document.getElementById('no-quizzes-message');
    if (!quizListContainer || !noQuizzesMessage) return;

    quizListContainer.innerHTML = '';

    // Asegurarse de que window.quizzes exista y sea un array
    if (!window.quizzes || !Array.isArray(window.quizzes) || window.quizzes.length === 0) {
        noQuizzesMessage.style.display = 'block';
    } else {
        noQuizzesMessage.style.display = 'none';
        window.quizzes.forEach(quiz => {
            // Saltar si el quiz es inválido (p.ej., null después de un parseo erróneo)
            if (!quiz || !quiz.id || !quiz.title) {
                console.warn("Skipping invalid quiz object during render:", quiz);
                return;
            }

            const div = document.createElement('div');
            div.className = 'list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 bg-dark text-light border-secondary';
            const questionCount = quiz.questions && Array.isArray(quiz.questions) ? quiz.questions.length : 0;
            // Usar textContent para evitar problemas de XSS con títulos
            const titleSpan = document.createElement('span');
            titleSpan.className = 'fw-bold flex-grow-1 me-3';
            titleSpan.textContent = `${quiz.title} (${questionCount} ${questionCount === 1 ? 'pregunta' : 'preguntas'})`;

            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'btn-group';
            buttonGroup.setAttribute('role', 'group');
            buttonGroup.innerHTML = `
                <button class="btn btn-sm btn-primary start-quiz-btn" data-quiz-id="${quiz.id}" title="Iniciar Partida"><i class="bi bi-play-fill"></i> Iniciar</button>
                <button class="btn btn-sm btn-secondary edit-quiz-btn" data-quiz-id="${quiz.id}" title="Editar Cuestionario"><i class="bi bi-pencil-fill"></i> Editar</button>
                <button class="btn btn-sm btn-danger delete-quiz-btn" data-quiz-id="${quiz.id}" data-quiz-title="${quiz.title}" title="Eliminar Cuestionario"><i class="bi bi-trash-fill"></i> Eliminar</button>
            `; // Añadido data-quiz-title

            div.appendChild(titleSpan);
            div.appendChild(buttonGroup);

            // Añadir listeners a los botones dentro del grupo
            const startBtn = buttonGroup.querySelector('.start-quiz-btn');
            const editBtn = buttonGroup.querySelector('.edit-quiz-btn');
            const deleteBtn = buttonGroup.querySelector('.delete-quiz-btn');

            if (startBtn) startBtn.addEventListener('click', () => initiateGame(quiz.id)); // initiateGame debe estar definido globalmente o importado
            if (editBtn) editBtn.addEventListener('click', () => loadQuizForEditing(quiz.id)); // loadQuizForEditing debe estar definido globalmente o importado

            // El botón de eliminar ahora llama a setupDeleteConfirmation
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    const targetButton = e.currentTarget;
                    const idToDelete = targetButton.dataset.quizId;
                    const titleToDelete = targetButton.dataset.quizTitle;
                    if (idToDelete && titleToDelete !== undefined) { // Verificar que ambos datos existen
                        setupDeleteConfirmation(idToDelete, titleToDelete);
                    } else {
                        console.error("Missing data-quiz-id or data-quiz-title on delete button.");
                    }
                });
            }
            quizListContainer.appendChild(div);
        });
    }
}

/**
 * Inicializa la vista del dashboard, añadiendo listeners principales.
 */
function initDashboard() {
    console.log("Initializing Dashboard...");
    createQuizBtn = document.getElementById('create-quiz-btn');

    if (createQuizBtn) {
        // openQuizBuilder debe estar definida globalmente o importada
        createQuizBtn.addEventListener('click', () => openQuizBuilder());
    } else {
        console.warn("Create quiz button not found during initDashboard.");
    }

    // Añadir listener para el botón de confirmación del modal de eliminación
    const confirmDeleteBtn = document.getElementById('confirmDeleteQuizBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', (e) => {
            const quizId = e.target.dataset.quizIdToDelete; // Recuperar el ID guardado
            if (quizId) {
                performQuizDeletion(quizId); // Ejecutar la eliminación
                // Ocultar el modal manualmente después de la acción
                if (confirmDeleteModalInstance) {
                    confirmDeleteModalInstance.hide();
                }
            } else {
                console.error("Could not find quizId to delete from modal button dataset.");
            }
        });
    } else {
         console.warn("Confirm delete button (#confirmDeleteQuizBtn) not found during initDashboard.");
    }

    // La carga inicial de quizzes se maneja ahora a través del flujo de autenticación en main.js
    // loadQuizzesFromStorage(); // -> No llamar aquí directamente, esperar a que auth confirme.
}

// Nota: Las funciones `initiateGame` (de game.js) y `loadQuizForEditing`, `openQuizBuilder` (de builder.js)
// deben estar accesibles en el scope global o ser importadas si estás usando módulos.
// La función `initDashboard` debe ser llamada DESPUÉS de una autenticación exitosa.
