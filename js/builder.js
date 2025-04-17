// --- Lógica del Quiz Builder (con GIFT y Drag & Drop) ---

// Referencias a elementos
let quizBuilderView, builderTitle, quizBuilderForm, quizIdInput, quizTitleInput,
    questionsContainer, addQuestionBtn, cancelQuizBuilderBtnTop,
    cancelQuizBuilderBtnBottom, saveQuizBtn, questionTemplate, optionTemplate,
    importGiftBtn, giftFileInput, giftFileNameSpan, giftImportStatus;

let nextQuestionTempId = 0; // Para IDs temporales únicos de preguntas/opciones
let draggedQuestion = null; // Para drag & drop
let dropZone = null; // Para el placeholder visual de drag & drop

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
    showView('quiz-builder-view'); // Utility function
}

function loadQuizForEditing(quizId) {
     // Asegurarse que quizzes esté cargado
     if (!window.quizzes || window.quizzes.length === 0) {
         console.warn("Quizzes not loaded yet, cannot edit.");
         // Podrías intentar cargarlos aquí si no lo están
         // loadQuizzesFromStorage();
         // if (!window.quizzes) return; // Salir si aún no se cargaron
     }
     const quiz = window.quizzes.find(q => q.id === quizId);
     if (quiz) {
         openQuizBuilder(quiz);
     } else {
         alert("Error: No se encontró el cuestionario.");
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
         // Asignar IDs existentes si los hay (importante para mantener referencias si se edita)
         questionBlock.dataset.id = questionData.id || '';

         if (questionData.options && questionData.options.length >= 2) {
            questionData.options.forEach(opt => addOptionBlock(optionsCont, radioGroupName, opt));
         } else {
              // Si no hay opciones válidas, añadir 2 por defecto
              addOptionBlock(optionsCont, radioGroupName);
              addOptionBlock(optionsCont, radioGroupName);
         }
     } else {
        // Añadir 2 opciones por defecto para preguntas nuevas
        addOptionBlock(optionsCont, radioGroupName);
        addOptionBlock(optionsCont, radioGroupName);
     }
     questionsContainer.appendChild(questionNode);
     updateBuilderUIState(questionBlock);
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
         // Asignar ID existente si lo hay
         optionBlock.dataset.id = optionData.id || '';
     }
     optionsContainer.appendChild(optionNode);
 }

 function updateBuilderUIState(questionBlock = null) {
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     if (!questionsContainer) return;

     const allQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
     const canDeleteQuestion = allQuestionBlocks.length > 1;

     allQuestionBlocks.forEach(qb => {
         const deleteQBtn = qb.querySelector('.delete-question-btn');
         if (deleteQBtn) deleteQBtn.disabled = !canDeleteQuestion;

         const optionsContainer = qb.querySelector('.options-container');
         const addOptionBtn = qb.querySelector('.add-option-btn');
         const deleteOptionBtns = qb.querySelectorAll('.delete-option-btn');

         if (!optionsContainer || !addOptionBtn) return;

         const currentOptionsCount = optionsContainer.querySelectorAll('.option-block').length;

         addOptionBtn.disabled = currentOptionsCount >= 4;
         deleteOptionBtns.forEach(delBtn => {
             delBtn.disabled = currentOptionsCount <= 2;
         });
     });
 }

 function saveQuiz(e) {
     e.preventDefault();
     quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     quizIdInput = quizIdInput || document.getElementById('quiz-id');
     saveQuizBtn = saveQuizBtn || document.getElementById('save-quiz-btn');

     if (!quizTitleInput || !questionsContainer || !quizIdInput || !saveQuizBtn) return;

     console.log("Validating and preparing quiz data...");
     const quizData = {
        title: quizTitleInput.value.trim(),
        questions: []
     };

     let isValid = true;
     let firstErrorField = null;

     if (!quizData.title) {
         alert("El título del cuestionario no puede estar vacío.");
         quizTitleInput.focus();
         return;
     }

     const questionBlocks = questionsContainer.querySelectorAll('.question-block');

     if (questionBlocks.length === 0) {
          alert("El cuestionario debe tener al menos una pregunta.");
          return;
     }

     questionBlocks.forEach((qb, qIndex) => {
         if (!isValid) return;

         const questionTextInput = qb.querySelector('.question-text');
         const questionTimeInput = qb.querySelector('.question-time');
         if (!questionTextInput || !questionTimeInput) { isValid = false; return; }

         const questionText = questionTextInput.value.trim();
         const questionTime = parseInt(questionTimeInput.value, 10);
         const optionsData = [];
         let correctOptionFound = false;
         const questionId = qb.dataset.id || `q_${Date.now()}_${qIndex}`;

         if (!questionText) {
             alert(`El texto de la pregunta ${qIndex + 1} no puede estar vacío.`);
             isValid = false; firstErrorField = questionTextInput; return;
         }
         if (isNaN(questionTime) || questionTime < 5 || questionTime > 120) {
             alert(`El tiempo límite de la pregunta ${qIndex + 1} debe ser entre 5 y 120 segundos.`);
             isValid = false; firstErrorField = questionTimeInput; return;
         }

         const optionBlocks = qb.querySelectorAll('.option-block');
         if (optionBlocks.length < 2 || optionBlocks.length > 4) {
              alert(`La pregunta ${qIndex + 1} debe tener entre 2 y 4 opciones.`);
              isValid = false; return;
         }

         optionBlocks.forEach((ob, oIndex) => {
             if (!isValid) return;
             const optionTextInput = ob.querySelector('.option-text');
             const optionCorrectInput = ob.querySelector('.option-correct');
             if (!optionTextInput || !optionCorrectInput) { isValid = false; return; }

             const optionText = optionTextInput.value.trim();
             const isCorrect = optionCorrectInput.checked;
             const optionId = ob.dataset.id || `opt_${questionId}_${oIndex}`;

             if (!optionText) {
                 alert(`El texto de la opción ${oIndex + 1} en la pregunta ${qIndex + 1} no puede estar vacío.`);
                 isValid = false; firstErrorField = optionTextInput; return;
             }
             if (isCorrect && correctOptionFound) {
                 alert(`La pregunta ${qIndex + 1} tiene más de una opción marcada como correcta.`);
                 isValid = false; firstErrorField = optionCorrectInput; return;
             }
             if (isCorrect) correctOptionFound = true;

             optionsData.push({ id: optionId, text: optionText, is_correct: isCorrect });
         });
         if (!isValid) return;

         if (!correctOptionFound) {
             alert(`Debes marcar una opción como correcta en la pregunta ${qIndex + 1}.`);
             isValid = false; firstErrorField = qb.querySelector('.option-correct'); return; // Find first radio
         }

         quizData.questions.push({
             id: questionId,
             text: questionText,
             time_limit: questionTime,
             options: optionsData
         });
     });

     if (!isValid) {
         console.error("Validation failed.");
         if (firstErrorField) {
             firstErrorField.focus();
             try { firstErrorField.select(); } catch(err){}
         }
         return;
     }

     // --- GUARDADO SIMULADO EN LOCALSTORAGE ---
     console.log("Quiz data is valid. Saving (simulated)...");
     saveQuizBtn.disabled = true;
     saveQuizBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';

     const existingQuizId = quizIdInput.value;
     quizData.id = existingQuizId || `quiz_${Date.now()}`;

     setTimeout(() => {
         let saved = false;
         if (!window.quizzes) window.quizzes = []; // Initialize if not existing

         if (existingQuizId) { // Editando
            const index = window.quizzes.findIndex(q => q.id === existingQuizId);
            if (index !== -1) {
                window.quizzes[index] = quizData;
                console.log("Quiz updated:", quizData.id);
                saved = true;
            } else {
                console.error("Error: Quiz to edit not found in array");
                alert("Error al guardar: Cuestionario no encontrado para editar.");
            }
         } else { // Creando nuevo
            window.quizzes.push(quizData);
            console.log("Quiz created:", quizData.id);
            saved = true;
         }

         saveQuizBtn.disabled = false;
         saveQuizBtn.innerHTML = 'Guardar Cuestionario';

         if (saved) {
             saveQuizzesToStorage(); // dashboard.js function
             alert("Cuestionario guardado correctamente.");
             renderQuizList(); // dashboard.js function
             showView('dashboard-view'); // utils.js function
         }
     }, 300);
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

    giftImportStatus.textContent = '';
    const file = event.target.files[0];
    if (!file) {
        giftFileNameSpan.textContent = ''; giftFileNameSpan.style.display = 'none'; return;
    }
    giftFileNameSpan.textContent = file.name; giftFileNameSpan.style.display = 'inline-block';
    console.log("Selected GIFT file:", file.name);

    if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.gift')) {
        displayError('gift-import-status', 'Error: El archivo debe ser .txt o .gift.');
        resetGiftInput(); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
         const fileContent = e.target.result;
         try {
             const parsedQuestions = parseGIFT(fileContent); // parseGIFT debe retornar [] si no hay válidas
             if (parsedQuestions.length > 0) {
                 console.log(`Parsed ${parsedQuestions.length} GIFT questions.`);

                 // --- INICIO DE LA LÓGICA CLAVE ---
                 const isCreatingNewQuiz = !quizIdInput.value;
                 const existingQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
                 let shouldClearInitialBlock = false;

                 if (isCreatingNewQuiz && existingQuestionBlocks.length === 1) {
                     // Comprobar si el único bloque existente está realmente vacío
                     const firstQuestionText = existingQuestionBlocks[0].querySelector('.question-text');
                     const firstOptionsContainer = existingQuestionBlocks[0].querySelector('.options-container');
                     const firstOptions = firstOptionsContainer ? firstOptionsContainer.querySelectorAll('.option-text') : [];
                     let firstOptionsAreEmpty = true;
                     firstOptions.forEach(optInput => {
                         if (optInput.value.trim() !== '') {
                             firstOptionsAreEmpty = false;
                         }
                     });

                     if (firstQuestionText && firstQuestionText.value.trim() === '' && firstOptionsAreEmpty) {
                         console.log("Detected initial empty block while creating new quiz. Clearing before import.");
                         shouldClearInitialBlock = true;
                     }
                 }

                 if (shouldClearInitialBlock) {
                     questionsContainer.innerHTML = ''; // Limpiar el bloque inicial vacío
                 }
                 // --- FIN DE LA LÓGICA CLAVE ---


                 // Añadir las preguntas parseadas (al contenedor vacío o al final si no se limpió)
                 parsedQuestions.forEach(q => addQuestionBlock(q));

                 displayError('gift-import-status', `${parsedQuestions.length} pregunta(s) importada(s) correctamente. Revisa y guarda.`, true);

                 // Si el título del quiz está vacío y el GIFT tenía título, usarlo (mantener)
                 if (!quizTitleInput.value.trim() && parsedQuestions[0]._giftTitle) {
                     quizTitleInput.value = parsedQuestions[0]._giftTitle;
                 }
                  enableDragAndDrop();
                  updateBuilderUIState();
             } else {
                 displayError('gift-import-status', 'No se encontraron preguntas de opción múltiple válidas (formato GIFT) en el archivo.');
             }
         } catch (parseError) {
             console.error("Error parsing GIFT:", parseError);
             displayError('gift-import-status', `Error al procesar el archivo: ${parseError.message}`);
         } finally {
             resetGiftInput();
         }
     };
    reader.onerror = (e) => {
         console.error("Error reading file:", e);
         displayError('gift-import-status', 'Error al leer el archivo.');
         resetGiftInput();
     };
    reader.readAsText(file);
}

function resetGiftInput(){
     giftFileInput = giftFileInput || document.getElementById('gift-file-input');
     if (giftFileInput) giftFileInput.value = null;
     // Also reset filename display
     giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
     if (giftFileNameSpan) {
         giftFileNameSpan.textContent = '';
         giftFileNameSpan.style.display = 'none';
     }
}

function parseGIFT(text) {
     const questions = [];
     const blocks = text.split(/\n\s*\n/);
     let currentTitle = null;

     blocks.forEach((block, index) => {
         block = block.trim();
         if (!block || block.startsWith('//')) return;

         let questionText = block;
         let answerBlockContent = '';
         let questionTitle = null;

         if (questionText.startsWith('::')) {
            const titleEndIndex = questionText.indexOf('::', 2);
            if (titleEndIndex !== -1) {
                questionTitle = questionText.substring(2, titleEndIndex).trim();
                questionText = questionText.substring(titleEndIndex + 2).trim();
                currentTitle = questionTitle;
            }
         }

         const answerStartIndex = questionText.indexOf('{');
         if (answerStartIndex === -1 || !questionText.endsWith('}')) {
             console.warn(`GIFT block ${index+1} skipped: No answer block {} found.`);
             return;
         }

         answerBlockContent = questionText.substring(answerStartIndex + 1, questionText.length - 1).trim();
         questionText = questionText.substring(0, answerStartIndex).trim();

         questionText = questionText.replace(/\[html\]/gi, '').replace(/<[^>]+>/g, '');
         questionText = questionText.replace(/\\:/g, ':').replace(/\\#/g, '#').replace(/\\=/g, '=').replace(/\\~/g, '~').replace(/\\}/g, '}').replace(/\\{/g, '{');

         const options = [];
         let correctCount = 0;
         const optionRegex = /([=~])\s*((?:[^\\#=~]|\\.)+?)\s*(?:#((?:[^\\=~]|\\.)*))?\s*(?=[=~]|$)/g;
         let match;

         while ((match = optionRegex.exec(answerBlockContent)) !== null) {
            const type = match[1];
            let optText = match[2].replace(/^%-?\d+(\.\d+)?%/, '').trim(); // Remove weight prefix
            optText = optText.replace(/<[^>]+>/g, '');
            optText = optText.replace(/\\:/g, ':').replace(/\\#/g, '#').replace(/\\=/g, '=').replace(/\\~/g, '~').replace(/\\}/g, '}').replace(/\\{/g, '{');

            const isCorrect = (type === '=');
            if (isCorrect) correctCount++;

            options.push({
                id: `opt_gift_${index}_${options.length}`,
                text: optText,
                is_correct: isCorrect
            });
         }

         if (options.length >= 2 && options.length <= 4 && correctCount === 1) {
            questions.push({
                id: `q_gift_${index}`,
                text: questionText,
                time_limit: 20,
                options: options,
                _giftTitle: questionTitle || currentTitle
            });
         } else {
             console.warn(`GIFT block ${index+1} skipped: Not a valid multiple-choice question for this app (options: ${options.length}, correct: ${correctCount}). Text: ${questionText.substring(0,30)}...`);
         }
     });

     return questions;
 }


 // --- Lógica Drag & Drop para Preguntas ---
 function enableDragAndDrop() {
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     if (!questionsContainer) return;
     // Remove existing listeners before adding new ones to prevent duplicates
     questionsContainer.removeEventListener('dragstart', handleDragStart);
     questionsContainer.removeEventListener('dragover', handleDragOver);
     questionsContainer.removeEventListener('dragleave', handleDragLeave);
     questionsContainer.removeEventListener('drop', handleDrop);
     questionsContainer.removeEventListener('dragend', handleDragEnd);
     // Add listeners
     questionsContainer.addEventListener('dragstart', handleDragStart);
     questionsContainer.addEventListener('dragover', handleDragOver);
     questionsContainer.addEventListener('dragleave', handleDragLeave);
     questionsContainer.addEventListener('drop', handleDrop);
     questionsContainer.addEventListener('dragend', handleDragEnd);
 }

 function handleDragStart(e) {
     const target = e.target.closest('.question-block');
     if (target && e.target.classList.contains('drag-handle')) {
         draggedQuestion = target;
         e.dataTransfer.effectAllowed = 'move';
         setTimeout(() => target.classList.add('dragging'), 0);
     } else {
         e.preventDefault();
     }
 }

  function handleDragOver(e) {
     e.preventDefault();
     e.dataTransfer.dropEffect = 'move';
     const target = e.target;
     const currentBlock = target.closest('.question-block');
     questionsContainer = questionsContainer || document.getElementById('questions-container'); // Ensure container is available

     if (!dropZone) {
         dropZone = document.createElement('div');
         dropZone.className = 'drop-zone';
     }

     if (currentBlock && currentBlock !== draggedQuestion) {
         const rect = currentBlock.getBoundingClientRect();
         const offsetY = e.clientY - rect.top;
         if (offsetY < rect.height / 2) {
             currentBlock.parentNode.insertBefore(dropZone, currentBlock);
         } else {
             if (currentBlock.nextSibling !== dropZone) {
                 currentBlock.parentNode.insertBefore(dropZone, currentBlock.nextSibling);
             }
         }
     } else if (!currentBlock && target === questionsContainer && questionsContainer) {
         if (questionsContainer.lastChild !== dropZone) {
             questionsContainer.appendChild(dropZone);
          }
     }
 }

 function handleDragLeave(e) {
    // Remove drop zone if leaving the container itself, or moving to a non-droppable child
    if (e.target === questionsContainer || !e.relatedTarget || !e.relatedTarget.closest('.question-block, .drop-zone')) {
       // Debounced removal might be better here to avoid flicker if moving quickly
       // For now, simple removal on leave might be okay
       // removeDropZone(); // Let's try removing only on drop/dragend
    }
 }

 function handleDrop(e) {
     e.preventDefault();
     questionsContainer = questionsContainer || document.getElementById('questions-container'); // Ensure container is available
     if (draggedQuestion && dropZone && dropZone.parentNode === questionsContainer && questionsContainer) {
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
    cancelQuizBuilderBtnTop = document.getElementById('cancel-quiz-builder-btn-top');
    cancelQuizBuilderBtnBottom = document.getElementById('cancel-quiz-builder-btn-bottom');
    quizBuilderForm = document.getElementById('quiz-builder-form');
    importGiftBtn = document.getElementById('import-gift-btn');
    giftFileInput = document.getElementById('gift-file-input');
    questionsContainer = document.getElementById('questions-container'); // Needed for event delegation

    // Add Listeners
    if (addQuestionBtn) addQuestionBtn.addEventListener('click', () => { addQuestionBlock(); updateBuilderUIState(); enableDragAndDrop(); });
    if (cancelQuizBuilderBtnTop) cancelQuizBuilderBtnTop.addEventListener('click', () => showView('dashboard-view'));
    if (cancelQuizBuilderBtnBottom) cancelQuizBuilderBtnBottom.addEventListener('click', () => showView('dashboard-view'));
    if (quizBuilderForm) quizBuilderForm.addEventListener('submit', saveQuiz);
    if (importGiftBtn) importGiftBtn.addEventListener('click', () => giftFileInput?.click()); // Use optional chaining
    if (giftFileInput) giftFileInput.addEventListener('change', handleFileSelect);

    // Delegación de eventos para botones +/-/delete dentro del builder
    if (quizBuilderView) { // Add listener to the parent view
        quizBuilderView.addEventListener('click', (e) => {
             const addOptionButton = e.target.closest('.add-option-btn');
             const deleteOptionButton = e.target.closest('.delete-option-btn');
             const deleteQuestionButton = e.target.closest('.delete-question-btn');
             const questionBlock = e.target.closest('.question-block'); // Get the parent question block

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
                    updateBuilderUIState(questionBlock); // Update state for this specific question
                  }
             } else if (deleteQuestionButton && questionBlock) {
                  questionBlock.remove();
                  updateBuilderUIState(); // Update state for all questions (as one was removed)
             }
         });
    }
    // Initial Drag and Drop setup (will be re-enabled when opening builder too)
    enableDragAndDrop();
 }
