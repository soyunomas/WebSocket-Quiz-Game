// --- Lógica del Quiz Builder (con GIFT y Drag & Drop) ---

// Referencias a elementos
let quizBuilderView, builderTitle, quizBuilderForm, quizIdInput, quizTitleInput,
    questionsContainer, addQuestionBtn, cancelQuizBuilderBtnBottom, // quitado cancelQuizBuilderBtnTop como variable global
    saveQuizBtn, // ID del botón de guardar ORIGINAL (inferior)
    questionTemplate, optionTemplate,
    importGiftBtn, giftFileInput, giftFileNameSpan, giftImportStatus;

let nextQuestionTempId = 0; // Para IDs temporales únicos de preguntas/opciones
let draggedQuestion = null; // Para drag & drop
let dropZone = null; // Para el placeholder visual de drag & drop
let infoModalInstance = null; // Instancia para el modal de información genérico

/**
 * Muestra un modal de Bootstrap genérico con un mensaje.
 * @param {string} message El mensaje a mostrar en el cuerpo del modal.
 * @param {string} [title='Aviso'] El título opcional para el modal.
 */
function showInfoModal(message, title = 'Aviso') {
    const modalElement = document.getElementById('infoModal');
    const modalTitleElement = document.getElementById('infoModalLabel');
    const modalBodyElement = document.getElementById('infoModalBody');

    if (!modalElement || !modalTitleElement || !modalBodyElement) {
        console.error("Elementos del modal de información no encontrados (#infoModal, #infoModalLabel, #infoModalBody)");
        // Fallback a alert si el modal no está listo
        alert(message);
        return;
    }

    // Establecer título y mensaje
    modalTitleElement.textContent = title;
    modalBodyElement.textContent = message; // Usar textContent para seguridad

    // Obtener o crear la instancia del modal y mostrarlo
    if (!infoModalInstance) {
        // Asegurarse de que Bootstrap esté cargado
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            infoModalInstance = new bootstrap.Modal(modalElement);
        } else {
            console.error("Bootstrap Modal no está disponible. Asegúrate de que el JS de Bootstrap esté cargado.");
            alert(message); // Fallback si Bootstrap no funciona
            return;
        }
    }
    // Prevenir error si la instancia no se pudo crear
    if (infoModalInstance) {
        infoModalInstance.show();
    }
}


function openQuizBuilder(quiz = null) {
    // Get elements needed by the builder
    quizBuilderView = quizBuilderView || document.getElementById('quiz-builder-view');
    builderTitle = builderTitle || document.getElementById('builder-title');
    quizBuilderForm = quizBuilderForm || document.getElementById('quiz-builder-form');
    quizIdInput = quizIdInput || document.getElementById('quiz-id');
    quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    giftFileInput = giftFileInput || document.getElementById('gift-file-input');
    giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');

    if (!quizBuilderView || !builderTitle || !quizBuilderForm || !quizIdInput || !quizTitleInput || !questionsContainer || !giftFileInput || !giftFileNameSpan || !giftImportStatus) {
        console.error("Quiz builder elements not found!");
        return;
    }


    nextQuestionTempId = 0; // Reiniciar contador para IDs/nombres de radio
    questionsContainer.innerHTML = '';
    quizBuilderForm.reset();
    giftFileInput.value = '';
    giftFileNameSpan.textContent = '';
    giftFileNameSpan.style.display = 'none';
    giftImportStatus.textContent = '';
    window.currentQuizForBuilder = null; // Limpiar quiz anterior

    if (quiz) {
         // Clonar PROFUNDAMENTE para evitar modificar el original en la lista 'quizzes'
         window.currentQuizForBuilder = JSON.parse(JSON.stringify(quiz));
         builderTitle.textContent = "Editar Cuestionario";
         quizIdInput.value = window.currentQuizForBuilder.id;
         quizTitleInput.value = window.currentQuizForBuilder.title;
         console.log("Loading quiz for editing:", window.currentQuizForBuilder.id);
         if (window.currentQuizForBuilder.questions && window.currentQuizForBuilder.questions.length > 0) {
             window.currentQuizForBuilder.questions.forEach(q => addQuestionBlock(q));
         } else {
              addQuestionBlock(); // Añadir una vacía si no tiene
         }
    } else {
        builderTitle.textContent = "Crear Nuevo Cuestionario";
        quizIdInput.value = ''; // Sin ID para nuevo quiz
        addQuestionBlock(); // Añadir una pregunta inicial
    }
     enableDragAndDrop(); // Habilitar Drag & Drop
     updateBuilderUIState(); // Actualizar estado inicial
    showView('quiz-builder-view'); // Utility function (debe estar definida globalmente o importada)
}

function loadQuizForEditing(quizId) {
     // Asegurarse que quizzes esté cargado
     if (!window.quizzes || !Array.isArray(window.quizzes) || window.quizzes.length === 0) { // Comprobación más robusta
         console.warn("Quizzes not loaded yet, cannot edit.");
         // Idealmente, intentar cargar y luego reintentar, o mostrar mensaje
         // Por ahora, mostramos error directo si no están cargados
         showInfoModal("No se han cargado los cuestionarios aún. Intenta recargar la página o volver al dashboard.", "Error de Carga");
         return; // Salir si no hay quizzes
     }
     const quiz = window.quizzes.find(q => q && q.id === quizId); // Añadir q && por seguridad
     if (quiz) {
         openQuizBuilder(quiz);
     } else {
         showInfoModal("Error: No se encontró el cuestionario.", "Error al Cargar");
     }
}

function addQuestionBlock(questionData = null) {
    questionTemplate = questionTemplate || document.getElementById('question-template');
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    if (!questionTemplate || !questionsContainer) return;

    const qTempId = `qtmp_${nextQuestionTempId++}`;
    const questionNode = questionTemplate.content.cloneNode(true);
    const questionBlock = questionNode.querySelector('.question-block');
    if (!questionBlock) return;
    questionBlock.dataset.tempId = qTempId; // Guardar ID temporal

    const optionsCont = questionBlock.querySelector('.options-container');
    const questionTextInput = questionBlock.querySelector('.question-text');
    const questionTimeInput = questionBlock.querySelector('.question-time');
    const radioGroupName = `correct_option_${qTempId}`; // Nombre único para grupo de radios

     if (!optionsCont || !questionTextInput || !questionTimeInput) return; // Guard clause

     // Configurar datos si existen
     if (questionData) {
         questionTextInput.value = questionData.text || '';
         questionTimeInput.value = questionData.time_limit || 20;
         questionBlock.dataset.id = questionData.id || ''; // Asignar ID existente

         if (questionData.options && Array.isArray(questionData.options) && questionData.options.length >= 2) {
            questionData.options.forEach(opt => addOptionBlock(optionsCont, radioGroupName, opt));
         } else {
              // Si no hay opciones válidas (o no es array), añadir 2 por defecto
              addOptionBlock(optionsCont, radioGroupName);
              addOptionBlock(optionsCont, radioGroupName);
         }
     } else {
        // Añadir 2 opciones por defecto para preguntas nuevas
        addOptionBlock(optionsCont, radioGroupName);
        addOptionBlock(optionsCont, radioGroupName);
     }
     questionsContainer.appendChild(questionNode);
     updateBuilderUIState(questionBlock); // Actualizar estado específico de este bloque
 }

 function addOptionBlock(optionsContainer, radioGroupName, optionData = null) {
     optionTemplate = optionTemplate || document.getElementById('option-template');
     if (!optionTemplate) return;

     const oTempId = `otmp_${nextQuestionTempId++}`;
     const optionNode = optionTemplate.content.cloneNode(true);
     const optionBlock = optionNode.querySelector('.option-block');
     if (!optionBlock) return;
     optionBlock.dataset.tempId = oTempId;

     const radioInput = optionBlock.querySelector('.option-correct');
     const textInput = optionBlock.querySelector('.option-text');
     if (!radioInput || !textInput) return; // Guard clause

     radioInput.name = radioGroupName; // Asignar nombre de grupo

     if (optionData) {
         textInput.value = optionData.text || '';
         radioInput.checked = optionData.is_correct === true;
         optionBlock.dataset.id = optionData.id || ''; // Asignar ID existente
     }
     optionsContainer.appendChild(optionNode);
 }

 function updateBuilderUIState(questionBlock = null) {
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     if (!questionsContainer) return;

     const allQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
     const canDeleteQuestion = allQuestionBlocks.length > 1;

     // Si se pasa un bloque específico, solo actualiza ese
     const blocksToUpdate = questionBlock ? [questionBlock] : allQuestionBlocks;

     blocksToUpdate.forEach(qb => {
         const deleteQBtn = qb.querySelector('.delete-question-btn');
         // Habilitar/deshabilitar botón de eliminar pregunta GLOBALMENTE
         if (deleteQBtn) deleteQBtn.disabled = !canDeleteQuestion;

         // Lógica para botones de opciones DENTRO del bloque
         const optionsContainer = qb.querySelector('.options-container');
         const addOptionBtn = qb.querySelector('.add-option-btn');
         const deleteOptionBtns = qb.querySelectorAll('.delete-option-btn');

         if (!optionsContainer || !addOptionBtn) return;

         const currentOptionsCount = optionsContainer.querySelectorAll('.option-block').length;
         const canAddOption = currentOptionsCount < 4;
         const canDeleteOption = currentOptionsCount > 2;

         addOptionBtn.disabled = !canAddOption;
         deleteOptionBtns.forEach(delBtn => {
             delBtn.disabled = !canDeleteOption;
         });
     });

     // Si no se pasó un bloque específico, re-evaluar el estado de todos los botones de eliminar pregunta
     if (!questionBlock) {
        allQuestionBlocks.forEach(qb => {
            const deleteQBtn = qb.querySelector('.delete-question-btn');
            if (deleteQBtn) deleteQBtn.disabled = !canDeleteQuestion;
        });
     }
 }

 function saveQuiz(e) {
     e.preventDefault();
     quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     quizIdInput = quizIdInput || document.getElementById('quiz-id');
     // Referencias a AMBOS botones de guardar (aunque solo necesitamos uno para deshabilitar)
     const saveBtnBottom = document.getElementById('save-quiz-btn');
     const saveBtnTop = document.getElementById('save-quiz-btn-top-duplicate');

     if (!quizTitleInput || !questionsContainer || !quizIdInput || !saveBtnBottom || !saveBtnTop) {
         console.error("Elementos necesarios para guardar no encontrados.");
         return;
     }

     console.log("Validating and preparing quiz data...");
     const quizData = {
        title: quizTitleInput.value.trim(),
        questions: []
     };

     let isValid = true;
     let firstErrorField = null;
     let errorMessage = '';

     if (!quizData.title) {
         errorMessage = "El título del cuestionario no puede estar vacío.";
         isValid = false; firstErrorField = quizTitleInput;
     }

     const questionBlocks = questionsContainer.querySelectorAll('.question-block');

     if (isValid && questionBlocks.length === 0) {
          errorMessage = "El cuestionario debe tener al menos una pregunta.";
          isValid = false;
     }

     if (isValid) {
         questionBlocks.forEach((qb, qIndex) => {
             if (!isValid) return; // Salir del bucle forEach si ya falló

             const questionTextInput = qb.querySelector('.question-text');
             const questionTimeInput = qb.querySelector('.question-time');
             if (!questionTextInput || !questionTimeInput) { isValid = false; errorMessage = "Error interno al procesar la pregunta."; return; }

             const questionText = questionTextInput.value.trim();
             const questionTime = parseInt(questionTimeInput.value, 10);
             const optionsData = [];
             let correctOptionFound = false;
             const questionId = qb.dataset.id || `q_${Date.now()}_${qIndex}`;

             if (!questionText) {
                 errorMessage = `El texto de la pregunta ${qIndex + 1} no puede estar vacío.`;
                 isValid = false; firstErrorField = questionTextInput; return;
             }
             if (isNaN(questionTime) || questionTime < 5 || questionTime > 120) {
                 errorMessage = `El tiempo límite de la pregunta ${qIndex + 1} debe ser entre 5 y 120 segundos.`;
                 isValid = false; firstErrorField = questionTimeInput; return;
             }

             const optionBlocks = qb.querySelectorAll('.option-block');
             if (optionBlocks.length < 2 || optionBlocks.length > 4) {
                  errorMessage = `La pregunta ${qIndex + 1} debe tener entre 2 y 4 opciones.`;
                  isValid = false; firstErrorField = qb.querySelector('.add-option-btn'); return; // Enfocar el botón de añadir por cercanía
             }

             optionBlocks.forEach((ob, oIndex) => {
                 if (!isValid) return;
                 const optionTextInput = ob.querySelector('.option-text');
                 const optionCorrectInput = ob.querySelector('.option-correct');
                 if (!optionTextInput || !optionCorrectInput) { isValid = false; errorMessage = "Error interno al procesar una opción."; return; }

                 const optionText = optionTextInput.value.trim();
                 const isCorrect = optionCorrectInput.checked;
                 const optionId = ob.dataset.id || `opt_${questionId}_${oIndex}`;

                 if (!optionText) {
                     errorMessage = `El texto de la opción ${oIndex + 1} en la pregunta ${qIndex + 1} no puede estar vacío.`;
                     isValid = false; firstErrorField = optionTextInput; return;
                 }
                 if (isCorrect && correctOptionFound) {
                     errorMessage = `La pregunta ${qIndex + 1} tiene más de una opción marcada como correcta.`;
                     isValid = false; firstErrorField = optionCorrectInput; return;
                 }
                 if (isCorrect) correctOptionFound = true;

                 optionsData.push({ id: optionId, text: optionText, is_correct: isCorrect });
             });
             if (!isValid) return;

             if (!correctOptionFound) {
                 errorMessage = `Debes marcar una opción como correcta en la pregunta ${qIndex + 1}.`;
                 isValid = false; firstErrorField = qb.querySelector('.option-correct'); return; // Find first radio
             }

             quizData.questions.push({
                 id: questionId,
                 text: questionText,
                 time_limit: questionTime,
                 options: optionsData
             });
         });
     } // Fin del if(isValid) inicial

     if (!isValid) {
         console.error("Validation failed:", errorMessage);
         showInfoModal(errorMessage, "Error de Validación"); // Mostrar modal en lugar de alert
         if (firstErrorField) {
            // Podríamos intentar enfocarlo, pero es menos crítico que mostrar el error
            // firstErrorField.focus();
         }
         return; // Detener el guardado
     }

     // --- GUARDADO SIMULADO EN LOCALSTORAGE ---
     console.log("Quiz data is valid. Saving (simulated)...");
     // Deshabilitar AMBOS botones de guardar
     saveBtnBottom.disabled = true;
     saveBtnTop.disabled = true;
     saveBtnBottom.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';
     saveBtnTop.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';


     const existingQuizId = quizIdInput.value;
     quizData.id = existingQuizId || `quiz_${Date.now()}`;

     // Simular retraso de red/guardado
     setTimeout(() => {
         let saved = false;
         if (!window.quizzes) window.quizzes = []; // Initialize if not existing

         if (existingQuizId) { // Editando
            const index = window.quizzes.findIndex(q => q && q.id === existingQuizId);
            if (index !== -1) {
                window.quizzes[index] = quizData;
                console.log("Quiz updated:", quizData.id);
                saved = true;
            } else {
                console.error("Error: Quiz to edit not found in array");
                showInfoModal("Error al guardar: No se encontró el cuestionario que intentabas editar.", "Error de Guardado");
            }
         } else { // Creando nuevo
            window.quizzes.push(quizData);
            console.log("Quiz created:", quizData.id);
            saved = true;
         }

         // Rehabilitar AMBOS botones de guardar
         saveBtnBottom.disabled = false;
         saveBtnTop.disabled = false;
         saveBtnBottom.innerHTML = 'Guardar Cuestionario';
         saveBtnTop.innerHTML = 'Guardar Cuestionario';

         if (saved) {
             // Funciones de dashboard.js (deben estar accesibles globalmente o importadas)
             if (typeof saveQuizzesToStorage === 'function') saveQuizzesToStorage(); else console.error("saveQuizzesToStorage is not defined");
             if (typeof renderQuizList === 'function') renderQuizList(); else console.error("renderQuizList is not defined");

             // showInfoModal("Cuestionario guardado correctamente."); // Opcional: Notificación de éxito
             if (typeof showView === 'function') showView('dashboard-view'); else console.error("showView is not defined"); // Función de utils.js
         }
     }, 300); // Fin del setTimeout
 }


 // --- Lógica para Importar GIFT ---
 function handleFileSelect(event) {
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');
    giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
    giftFileInput = giftFileInput || document.getElementById('gift-file-input'); // Needed for reset
    quizTitleInput = quizTitleInput || document.getElementById('quiz-title'); // To potentially set title
    questionsContainer = questionsContainer || document.getElementById('questions-container'); // Needed for check
    quizIdInput = quizIdInput || document.getElementById('quiz-id'); // Needed to check if creating new


    if (!giftImportStatus || !giftFileNameSpan || !giftFileInput || !quizTitleInput || !questionsContainer || !quizIdInput) return;

    giftImportStatus.textContent = ''; // Limpiar estado anterior
    const file = event.target.files[0];
    if (!file) {
        giftFileNameSpan.textContent = ''; giftFileNameSpan.style.display = 'none'; return;
    }
    giftFileNameSpan.textContent = file.name; giftFileNameSpan.style.display = 'inline-block';
    console.log("Selected GIFT file:", file.name);

    if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.gift')) {
        displayError('gift-import-status', 'Error: El archivo debe ser .txt o .gift.'); // Usamos displayError para mensajes en línea
        resetGiftInput(); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
         const fileContent = e.target.result;
         try {
             const parsedQuestions = parseGIFT(fileContent);
             if (parsedQuestions.length > 0) {
                 console.log(`Parsed ${parsedQuestions.length} GIFT questions.`);

                 // --- LÓGICA PARA LIMPIAR BLOQUE INICIAL VACÍO ---
                 const isCreatingNewQuiz = !quizIdInput.value;
                 const existingQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
                 let shouldClearInitialBlock = false;
                 if (isCreatingNewQuiz && existingQuestionBlocks.length === 1) {
                     const firstQuestionText = existingQuestionBlocks[0].querySelector('.question-text');
                     const firstOptionsContainer = existingQuestionBlocks[0].querySelector('.options-container');
                     const firstOptions = firstOptionsContainer ? firstOptionsContainer.querySelectorAll('.option-text') : [];
                     let firstOptionsAreEmpty = true;
                     firstOptions.forEach(optInput => { if (optInput.value.trim() !== '') firstOptionsAreEmpty = false; });
                     if (firstQuestionText && firstQuestionText.value.trim() === '' && firstOptionsAreEmpty) {
                         shouldClearInitialBlock = true;
                     }
                 }
                 if (shouldClearInitialBlock) {
                     console.log("Clearing initial empty block before GIFT import.");
                     questionsContainer.innerHTML = '';
                 }
                 // --- FIN LÓGICA LIMPIEZA ---

                 parsedQuestions.forEach(q => addQuestionBlock(q));

                 displayError('gift-import-status', `${parsedQuestions.length} pregunta(s) importada(s) correctamente. Revisa y guarda.`, true); // Mensaje de éxito en línea

                 if (!quizTitleInput.value.trim() && parsedQuestions[0]._giftTitle) {
                     quizTitleInput.value = parsedQuestions[0]._giftTitle;
                 }
                  enableDragAndDrop();
                  updateBuilderUIState(); // Actualizar estado después de añadir
             } else {
                 displayError('gift-import-status', 'No se encontraron preguntas de opción múltiple válidas (formato GIFT) en el archivo.'); // Mensaje de fallo en línea
             }
         } catch (parseError) {
             console.error("Error parsing GIFT:", parseError);
             displayError('gift-import-status', `Error al procesar el archivo: ${parseError.message}`); // Error de parseo en línea
         } finally {
             resetGiftInput(); // Limpiar input de archivo en cualquier caso
         }
     };
    reader.onerror = (e) => {
         console.error("Error reading file:", e);
         displayError('gift-import-status', 'Error al leer el archivo.'); // Error de lectura en línea
         resetGiftInput();
     };
    reader.readAsText(file);
}

function resetGiftInput(){
     giftFileInput = giftFileInput || document.getElementById('gift-file-input');
     if (giftFileInput) giftFileInput.value = null;
     giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
     if (giftFileNameSpan) {
         giftFileNameSpan.textContent = '';
         giftFileNameSpan.style.display = 'none';
     }
}

function parseGIFT(text) {
     // Asegurarse de que el texto no sea null o undefined
     if (!text) return [];

     const questions = [];
     // Normalizar saltos de línea y dividir por bloques (dos o más saltos de línea)
     const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
     let currentTitle = null;

     blocks.forEach((block, index) => {
         block = block.trim();
         // Ignorar comentarios y bloques vacíos
         if (!block || block.startsWith('//')) return;

         let questionText = block;
         let answerBlockContent = '';
         let questionTitle = null;

         // Extraer título si existe ::Título::Pregunta...
         if (questionText.startsWith('::')) {
            const titleEndIndex = questionText.indexOf('::', 2);
            if (titleEndIndex !== -1) {
                questionTitle = questionText.substring(2, titleEndIndex).trim();
                questionText = questionText.substring(titleEndIndex + 2).trim();
                currentTitle = questionTitle; // Recordar título para preguntas sin título propio
            }
         }

         // Encontrar bloque de respuestas {}
         const answerStartIndex = questionText.indexOf('{');
         if (answerStartIndex === -1 || !questionText.endsWith('}')) {
             console.warn(`GIFT block ${index+1} skipped: No answer block {} found.`);
             return; // Saltar este bloque si no tiene formato de respuesta
         }

         answerBlockContent = questionText.substring(answerStartIndex + 1, questionText.length - 1).trim();
         questionText = questionText.substring(0, answerStartIndex).trim();

         // Limpieza básica de HTML y escapes GIFT para el texto de la pregunta
         questionText = questionText.replace(/\[(html|moodle|markdown)\]/gi, ''); // Remover tags de formato [html], [moodle]...
         questionText = questionText.replace(/<[^>]+>/g, ''); // Remover tags HTML <...>
         questionText = questionText.replace(/\\([:={}\[\]#~])/g, '$1'); // Manejar escapes comunes \:, \=, \{, \}, etc.

         const options = [];
         let correctCount = 0;
         // Regex para capturar opciones: [=~] (%peso%)? Texto (#Feedback)?
         const optionRegex = /([=~])(?:%-?\d+(?:\.\d+)?%)?\s*((?:[^\\#=~]|\\.)+?)\s*(?:#((?:[^\\=~]|\\.)*))?\s*(?=[=~]|$)/g;
         let match;

         while ((match = optionRegex.exec(answerBlockContent)) !== null) {
            const type = match[1]; // '=' o '~'
            // Limpiar texto de opción similar a la pregunta
            let optText = match[2].trim(); // Texto capturado
            optText = optText.replace(/<[^>]+>/g, '');
            optText = optText.replace(/\\([:={}\[\]#~])/g, '$1');

            const isCorrect = (type === '=');
            if (isCorrect) correctCount++;

            // Ignorar opciones vacías después de la limpieza
            if (optText) {
                options.push({
                    id: `opt_gift_${index}_${options.length}`,
                    text: optText,
                    is_correct: isCorrect
                    // Podríamos extraer el feedback (match[3]) si fuera necesario
                });
            } else {
                 console.warn(`GIFT block ${index+1}: Skipped empty option text after cleaning.`);
            }
         }

         // Validar que sea opción múltiple con UNA SOLA respuesta correcta y texto de pregunta no vacío
         const isValidMC = options.length >= 2 && options.length <= 4 && correctCount === 1 && questionText.trim();

         if (isValidMC) {
            questions.push({
                id: `q_gift_${index}`,
                text: questionText.trim(),
                time_limit: 20, // Tiempo por defecto
                options: options,
                _giftTitle: questionTitle || currentTitle // Guardar título si existe
            });
         } else {
             console.warn(`GIFT block ${index+1} skipped: Not a valid single-choice MC (options: ${options.length}, correct: ${correctCount}, text: ${!!questionText.trim()}).`);
         }
     });

     return questions;
 }


 // --- Lógica Drag & Drop para Preguntas ---
 function enableDragAndDrop() {
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     if (!questionsContainer) return;
     // Limpiar listeners existentes
     questionsContainer.removeEventListener('dragstart', handleDragStart);
     questionsContainer.removeEventListener('dragover', handleDragOver);
     questionsContainer.removeEventListener('dragleave', handleDragLeave);
     questionsContainer.removeEventListener('drop', handleDrop);
     questionsContainer.removeEventListener('dragend', handleDragEnd);
     // Añadir listeners
     questionsContainer.addEventListener('dragstart', handleDragStart);
     questionsContainer.addEventListener('dragover', handleDragOver);
     questionsContainer.addEventListener('dragleave', handleDragLeave);
     questionsContainer.addEventListener('drop', handleDrop);
     questionsContainer.addEventListener('dragend', handleDragEnd);
 }

 function handleDragStart(e) {
     if (e.target.classList.contains('drag-handle')) {
         draggedQuestion = e.target.closest('.question-block');
         if (draggedQuestion) {
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => { if(draggedQuestion) draggedQuestion.classList.add('dragging'); }, 0);
         } else { e.preventDefault(); }
     } else {
         // No prevenir por defecto para permitir selección de texto en inputs
     }
 }

 function handleDragOver(e) {
     e.preventDefault();
     e.dataTransfer.dropEffect = 'move';
     const target = e.target;
     const currentBlock = target.closest('.question-block');
     questionsContainer = questionsContainer || document.getElementById('questions-container');

     if (!dropZone) { dropZone = document.createElement('div'); dropZone.className = 'drop-zone'; }

     if (currentBlock && currentBlock !== draggedQuestion) {
         const rect = currentBlock.getBoundingClientRect();
         const offsetY = e.clientY - rect.top;
         if (offsetY < rect.height / 2) {
             questionsContainer.insertBefore(dropZone, currentBlock);
         } else {
             questionsContainer.insertBefore(dropZone, currentBlock.nextSibling);
         }
     } else if (!currentBlock && target === questionsContainer) {
         if(questionsContainer.lastElementChild !== dropZone) { questionsContainer.appendChild(dropZone); }
     }
 }

 function handleDragLeave(e) {
     // Podríamos quitar la dropzone aquí si salimos del contenedor,
     // pero dejarlo para drop/dragend es más simple y evita parpadeos.
 }

 function handleDrop(e) {
     e.preventDefault();
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     if (draggedQuestion && dropZone && dropZone.parentNode === questionsContainer) {
         questionsContainer.insertBefore(draggedQuestion, dropZone);
     }
     removeDropZone();
 }

 function handleDragEnd(e) {
     if (draggedQuestion) {
         draggedQuestion.classList.remove('dragging');
         draggedQuestion = null;
     }
     removeDropZone();
 }

 function removeDropZone() {
     if (dropZone && dropZone.parentNode) {
         dropZone.parentNode.removeChild(dropZone);
     }
     dropZone = null;
 }

 function initBuilder() {
    // Get elements
    quizBuilderView = document.getElementById('quiz-builder-view');
    addQuestionBtn = document.getElementById('add-question-btn');
    quizBuilderForm = document.getElementById('quiz-builder-form');
    importGiftBtn = document.getElementById('import-gift-btn');
    giftFileInput = document.getElementById('gift-file-input');
    questionsContainer = document.getElementById('questions-container');

    // --- Referencias a TODOS los botones de Cancelar y Guardar ---
    const cancelBtnSmallTop = document.getElementById('cancel-quiz-builder-btn-top'); // El pequeño original
    const cancelBtnDuplicateTop = document.getElementById('cancel-quiz-builder-btn-top-duplicate'); // El duplicado grande
    cancelQuizBuilderBtnBottom = document.getElementById('cancel-quiz-builder-btn-bottom'); // El original inferior (variable global si se usa)
    saveQuizBtn = document.getElementById('save-quiz-btn'); // El original inferior (variable global si se usa)
    const saveBtnDuplicateTop = document.getElementById('save-quiz-btn-top-duplicate'); // El duplicado superior

    // Add Listeners
    if (addQuestionBtn) addQuestionBtn.addEventListener('click', () => { addQuestionBlock(); updateBuilderUIState(); enableDragAndDrop(); });

    // Acción común para todos los botones Cancelar
    const cancelAction = () => {
        if (typeof showView === 'function') {
             showView('dashboard-view');
        } else {
            console.error("showView function is not defined");
            // Fallback si showView no existe
            window.location.hash = ''; // O alguna otra acción para volver
        }
    };
    // Asignar la acción a todos los botones de cancelar encontrados
    if (cancelBtnSmallTop) cancelBtnSmallTop.addEventListener('click', cancelAction);
    if (cancelBtnDuplicateTop) cancelBtnDuplicateTop.addEventListener('click', cancelAction);
    if (cancelQuizBuilderBtnBottom) cancelQuizBuilderBtnBottom.addEventListener('click', cancelAction);

    // Asegurar que los botones de guardar sean de tipo submit y estén asociados al form
    // Esto se hace mejor en el HTML con type="submit" y form="form-id"
    // El listener del FORMULARIO gestionará ambos botones de guardar
    if (quizBuilderForm) {
        quizBuilderForm.addEventListener('submit', saveQuiz);
    } else {
        console.error("Quiz builder form not found!");
    }

    // GIFT import listeners
    if (importGiftBtn) importGiftBtn.addEventListener('click', () => giftFileInput?.click());
    if (giftFileInput) giftFileInput.addEventListener('change', handleFileSelect);

    // Delegación de eventos para botones +/-/delete DENTRO de las preguntas
    if (quizBuilderView) {
        quizBuilderView.addEventListener('click', (e) => {
             const addOptionButton = e.target.closest('.add-option-btn');
             const deleteOptionButton = e.target.closest('.delete-option-btn');
             const deleteQuestionButton = e.target.closest('.delete-question-btn');
             const questionBlock = e.target.closest('.question-block');

             if (addOptionButton && questionBlock) {
                 const optionsCont = questionBlock.querySelector('.options-container');
                 const radioGroupName = `correct_option_${questionBlock.dataset.tempId}`;
                 if (optionsCont) {
                    addOptionBlock(optionsCont, radioGroupName);
                    updateBuilderUIState(questionBlock);
                 }
             } else if (deleteOptionButton && questionBlock) {
                  const optionBlock = deleteOptionButton.closest('.option-block');
                  if (optionBlock) {
                    optionBlock.remove();
                    updateBuilderUIState(questionBlock);
                  }
             } else if (deleteQuestionButton && questionBlock) {
                  const allBlocks = questionsContainer.querySelectorAll('.question-block');
                  if (allBlocks.length > 1) {
                      questionBlock.remove();
                      updateBuilderUIState(); // Actualizar estado global (afecta a los botones de eliminar)
                  } else {
                      showInfoModal("No puedes eliminar la última pregunta. Añade otra primero si deseas reemplazarla.", "Acción No Permitida");
                  }
             }
         });
    }
    // Initial Drag and Drop setup
    enableDragAndDrop();

    // Verificar existencia del modal de info (la instancia se crea bajo demanda)
    if (!document.getElementById('infoModal')) {
        console.warn("Info modal element (#infoModal) not found during initBuilder. Modals will fallback to alerts.");
    } else {
         console.log("Info modal element found.");
    }
 }

 // Asegúrate de que initBuilder se llama en el momento adecuado
 // document.addEventListener('DOMContentLoaded', initBuilder); // Si no depende de la autenticación
