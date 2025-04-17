// --- Lógica del Quiz Builder (con GIFT y Tiempo por Defecto) ---

let quizBuilderView, builderTitle, quizBuilderForm, quizIdInput, quizTitleInput, defaultQuestionTimeInput,
    questionsContainer, addQuestionBtn, cancelQuizBuilderBtnBottom,
    saveQuizBtn,
    questionTemplate, optionTemplate,
    importGiftBtn, giftFileInput, giftFileNameSpan, giftImportStatus;

let nextQuestionTempId = 0;
let infoModalInstance = null;
const DEFAULT_TIME = 20; // Valor por defecto para el tiempo

function showInfoModal(message, title = 'Aviso') {
    const modalElement = document.getElementById('infoModal');
    const modalTitleElement = document.getElementById('infoModalLabel');
    const modalBodyElement = document.getElementById('infoModalBody');

    if (!modalElement || !modalTitleElement || !modalBodyElement) {
        console.error("Elementos del modal de información no encontrados (#infoModal, #infoModalLabel, #infoModalBody)");
        alert(message);
        return;
    }

    modalTitleElement.textContent = title;
    modalBodyElement.textContent = message;

    if (!infoModalInstance) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            infoModalInstance = new bootstrap.Modal(modalElement);
        } else {
            console.error("Bootstrap Modal no está disponible. Asegúrate de que el JS de Bootstrap esté cargado.");
            alert(message);
            return;
        }
    }
    if (infoModalInstance) {
        infoModalInstance.show();
    }
}


function openQuizBuilder(quiz = null) {
    quizBuilderView = quizBuilderView || document.getElementById('quiz-builder-view');
    builderTitle = builderTitle || document.getElementById('builder-title');
    quizBuilderForm = quizBuilderForm || document.getElementById('quiz-builder-form');
    quizIdInput = quizIdInput || document.getElementById('quiz-id');
    quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
    defaultQuestionTimeInput = defaultQuestionTimeInput || document.getElementById('default-question-time');
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    giftFileInput = giftFileInput || document.getElementById('gift-file-input');
    giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');

    if (!quizBuilderView || !builderTitle || !quizBuilderForm || !quizIdInput || !quizTitleInput || !defaultQuestionTimeInput || !questionsContainer || !giftFileInput || !giftFileNameSpan || !giftImportStatus) {
        console.error("Quiz builder elements not found!");
        return;
    }

    nextQuestionTempId = 0;
    questionsContainer.innerHTML = '';
    quizBuilderForm.reset(); // Esto resetea el default time input a su valor HTML inicial (20)
    giftFileInput.value = '';
    giftFileNameSpan.textContent = '';
    giftFileNameSpan.style.display = 'none';
    giftImportStatus.textContent = '';
    window.currentQuizForBuilder = null;

    if (quiz) {
         window.currentQuizForBuilder = JSON.parse(JSON.stringify(quiz));
         builderTitle.textContent = "Editar Cuestionario";
         quizIdInput.value = window.currentQuizForBuilder.id;
         quizTitleInput.value = window.currentQuizForBuilder.title;
         // Establecer el tiempo por defecto al de la primera pregunta si existe, sino al default global
         const firstQuestionTime = window.currentQuizForBuilder.questions?.[0]?.time_limit;
         defaultQuestionTimeInput.value = firstQuestionTime ? firstQuestionTime : DEFAULT_TIME;

         console.log("Loading quiz for editing:", window.currentQuizForBuilder.id);
         if (window.currentQuizForBuilder.questions && window.currentQuizForBuilder.questions.length > 0) {
             window.currentQuizForBuilder.questions.forEach(q => addQuestionBlock(q));
         } else {
              addQuestionBlock(); // Añadir una vacía si no tiene
         }
    } else {
        builderTitle.textContent = "Crear Nuevo Cuestionario";
        quizIdInput.value = '';
        defaultQuestionTimeInput.value = DEFAULT_TIME; // Asegurar valor por defecto al crear
        addQuestionBlock(); // Añadir una pregunta inicial (con tiempo por defecto ya aplicado)
    }

    updateBuilderUIState();
    updateMoveButtonStates();
    showView('quiz-builder-view');
}

function loadQuizForEditing(quizId) {
     if (!window.quizzes || !Array.isArray(window.quizzes) || window.quizzes.length === 0) {
         console.warn("Quizzes not loaded yet, cannot edit.");
         showInfoModal("No se han cargado los cuestionarios aún. Intenta recargar la página o volver al dashboard.", "Error de Carga");
         return;
     }
     const quiz = window.quizzes.find(q => q && q.id === quizId);
     if (quiz) {
         openQuizBuilder(quiz);
     } else {
         showInfoModal("Error: No se encontró el cuestionario.", "Error al Cargar");
     }
}

function addQuestionBlock(questionData = null) {
    questionTemplate = questionTemplate || document.getElementById('question-template');
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    defaultQuestionTimeInput = defaultQuestionTimeInput || document.getElementById('default-question-time');
    if (!questionTemplate || !questionsContainer || !defaultQuestionTimeInput) return;

    const qTempId = `qtmp_${nextQuestionTempId++}`;
    const questionNode = questionTemplate.content.cloneNode(true);
    const questionBlock = questionNode.querySelector('.question-block');
    if (!questionBlock) return;
    questionBlock.dataset.tempId = qTempId;

    const optionsCont = questionBlock.querySelector('.options-container');
    const questionTextInput = questionBlock.querySelector('.question-text');
    const questionTimeInput = questionBlock.querySelector('.question-time');
    const radioGroupName = `correct_option_${qTempId}`;

     if (!optionsCont || !questionTextInput || !questionTimeInput) return;

     // Establecer tiempo de la pregunta: usar data si existe, sino el valor actual del campo por defecto
     const timeToSet = questionData?.time_limit ?? defaultQuestionTimeInput.value ?? DEFAULT_TIME;
     questionTimeInput.value = timeToSet;

     if (questionData) {
         questionTextInput.value = questionData.text || '';
         // questionTimeInput.value ya se estableció arriba
         questionBlock.dataset.id = questionData.id || '';

         if (questionData.options && Array.isArray(questionData.options) && questionData.options.length >= 2) {
            questionData.options.forEach(opt => addOptionBlock(optionsCont, radioGroupName, opt));
         } else {
              addOptionBlock(optionsCont, radioGroupName);
              addOptionBlock(optionsCont, radioGroupName);
         }
     } else {
        // questionTimeInput.value ya se estableció arriba
        addOptionBlock(optionsCont, radioGroupName);
        addOptionBlock(optionsCont, radioGroupName);
     }
     questionsContainer.appendChild(questionNode);
     updateBuilderUIState(questionBlock);
     updateMoveButtonStates();
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
     if (!radioInput || !textInput) return;

     radioInput.name = radioGroupName;

     if (optionData) {
         textInput.value = optionData.text || '';
         radioInput.checked = optionData.is_correct === true;
         optionBlock.dataset.id = optionData.id || '';
     }
     optionsContainer.appendChild(optionNode);
 }

 function updateBuilderUIState(questionBlock = null) {
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     if (!questionsContainer) return;

     const allQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
     const canDeleteQuestion = allQuestionBlocks.length > 1;

     const blocksToUpdate = questionBlock ? [questionBlock] : allQuestionBlocks;

     blocksToUpdate.forEach(qb => {
         const deleteQBtn = qb.querySelector('.delete-question-btn');
         if (deleteQBtn) deleteQBtn.disabled = !canDeleteQuestion;

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

     if (!questionBlock) {
        allQuestionBlocks.forEach(qb => {
            const deleteQBtn = qb.querySelector('.delete-question-btn');
            if (deleteQBtn) deleteQBtn.disabled = !canDeleteQuestion;
        });
     }
 }

 function updateMoveButtonStates() {
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    if (!questionsContainer) return;

    const allQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
    allQuestionBlocks.forEach((qb, index) => {
        const moveUpBtn = qb.querySelector('.move-question-up-btn');
        const moveDownBtn = qb.querySelector('.move-question-down-btn');
        if (moveUpBtn) moveUpBtn.disabled = (index === 0);
        if (moveDownBtn) moveDownBtn.disabled = (index === allQuestionBlocks.length - 1);
    });
 }

 function saveQuiz(e) {
     e.preventDefault();
     quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
     questionsContainer = questionsContainer || document.getElementById('questions-container');
     quizIdInput = quizIdInput || document.getElementById('quiz-id');
     // defaultQuestionTimeInput no se usa para guardar, solo para editar
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
             if (!isValid) return;

             const questionTextInput = qb.querySelector('.question-text');
             const questionTimeInput = qb.querySelector('.question-time'); // Leer el tiempo de esta pregunta
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
             // Validar el tiempo específico de esta pregunta
             if (isNaN(questionTime) || questionTime < 5 || questionTime > 120) {
                 errorMessage = `El tiempo límite de la pregunta ${qIndex + 1} debe ser entre 5 y 120 segundos.`;
                 isValid = false; firstErrorField = questionTimeInput; return;
             }

             const optionBlocks = qb.querySelectorAll('.option-block');
             if (optionBlocks.length < 2 || optionBlocks.length > 4) {
                  errorMessage = `La pregunta ${qIndex + 1} debe tener entre 2 y 4 opciones.`;
                  isValid = false; firstErrorField = qb.querySelector('.add-option-btn'); return;
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
                 isValid = false; firstErrorField = qb.querySelector('.option-correct'); return;
             }

             quizData.questions.push({
                 id: questionId,
                 text: questionText,
                 time_limit: questionTime, // Guardar el tiempo de esta pregunta
                 options: optionsData
             });
         });
     }

     if (!isValid) {
         console.error("Validation failed:", errorMessage);
         showInfoModal(errorMessage, "Error de Validación");
         if (firstErrorField) {
             // firstErrorField.focus();
         }
         return;
     }

     console.log("Quiz data is valid. Saving (simulated)...");
     saveBtnBottom.disabled = true;
     saveBtnTop.disabled = true;
     saveBtnBottom.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';
     saveBtnTop.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';

     const existingQuizId = quizIdInput.value;
     quizData.id = existingQuizId || `quiz_${Date.now()}`;

     setTimeout(() => {
         let saved = false;
         if (!window.quizzes) window.quizzes = [];

         if (existingQuizId) {
            const index = window.quizzes.findIndex(q => q && q.id === existingQuizId);
            if (index !== -1) {
                window.quizzes[index] = quizData;
                console.log("Quiz updated:", quizData.id);
                saved = true;
            } else {
                console.error("Error: Quiz to edit not found in array");
                showInfoModal("Error al guardar: No se encontró el cuestionario que intentabas editar.", "Error de Guardado");
            }
         } else {
            window.quizzes.push(quizData);
            console.log("Quiz created:", quizData.id);
            saved = true;
         }

         saveBtnBottom.disabled = false;
         saveBtnTop.disabled = false;
         saveBtnBottom.innerHTML = 'Guardar Cuestionario';
         saveBtnTop.innerHTML = 'Guardar Cuestionario';

         if (saved) {
             if (typeof saveQuizzesToStorage === 'function') saveQuizzesToStorage(); else console.error("saveQuizzesToStorage is not defined");
             if (typeof renderQuizList === 'function') renderQuizList(); else console.error("renderQuizList is not defined");
             if (typeof showView === 'function') showView('dashboard-view'); else console.error("showView is not defined");
         }
     }, 300);
 }


 // --- Lógica para Importar GIFT ---
 function handleFileSelect(event) {
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');
    giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
    giftFileInput = giftFileInput || document.getElementById('gift-file-input');
    quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    quizIdInput = quizIdInput || document.getElementById('quiz-id');
    defaultQuestionTimeInput = defaultQuestionTimeInput || document.getElementById('default-question-time');


    if (!giftImportStatus || !giftFileNameSpan || !giftFileInput || !quizTitleInput || !questionsContainer || !quizIdInput || !defaultQuestionTimeInput) return;

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
             const parsedQuestions = parseGIFT(fileContent);
             if (parsedQuestions.length > 0) {
                 console.log(`Parsed ${parsedQuestions.length} GIFT questions.`);

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
                 // Usar el tiempo por defecto actual para las preguntas importadas
                 const currentDefaultTime = defaultQuestionTimeInput.value || DEFAULT_TIME;
                 parsedQuestions.forEach(q => {
                    q.time_limit = parseInt(currentDefaultTime, 10); // Sobreescribir tiempo con el default
                    addQuestionBlock(q);
                 });

                 displayError('gift-import-status', `${parsedQuestions.length} pregunta(s) importada(s) correctamente. Revisa y guarda.`, true);

                 if (!quizTitleInput.value.trim() && parsedQuestions[0]._giftTitle) {
                     quizTitleInput.value = parsedQuestions[0]._giftTitle;
                 }
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
     giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
     if (giftFileNameSpan) {
         giftFileNameSpan.textContent = '';
         giftFileNameSpan.style.display = 'none';
     }
}

function parseGIFT(text) {
     if (!text) return [];

     const questions = [];
     const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
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

         questionText = questionText.replace(/\[(html|moodle|markdown)\]/gi, '');
         questionText = questionText.replace(/<[^>]+>/g, '');
         questionText = questionText.replace(/\\([:={}\[\]#~])/g, '$1');

         const options = [];
         let correctCount = 0;
         const optionRegex = /([=~])(?:%-?\d+(?:\.\d+)?%)?\s*((?:[^\\#=~]|\\.)+?)\s*(?:#((?:[^\\=~]|\\.)*))?\s*(?=[=~]|$)/g;
         let match;

         while ((match = optionRegex.exec(answerBlockContent)) !== null) {
            const type = match[1];
            let optText = match[2].trim();
            optText = optText.replace(/<[^>]+>/g, '');
            optText = optText.replace(/\\([:={}\[\]#~])/g, '$1');

            const isCorrect = (type === '=');
            if (isCorrect) correctCount++;

            if (optText) {
                options.push({
                    id: `opt_gift_${index}_${options.length}`,
                    text: optText,
                    is_correct: isCorrect
                });
            } else {
                 console.warn(`GIFT block ${index+1}: Skipped empty option text after cleaning.`);
            }
         }

         const isValidMC = options.length >= 2 && options.length <= 4 && correctCount === 1 && questionText.trim();

         if (isValidMC) {
            questions.push({
                id: `q_gift_${index}`,
                text: questionText.trim(),
                time_limit: DEFAULT_TIME, // Dejar tiempo por defecto aquí, se sobrescribe luego si es necesario
                options: options,
                _giftTitle: questionTitle || currentTitle
            });
         } else {
             console.warn(`GIFT block ${index+1} skipped: Not a valid single-choice MC (options: ${options.length}, correct: ${correctCount}, text: ${!!questionText.trim()}).`);
         }
     });

     return questions;
 }

// --- Manejador para el cambio de tiempo por defecto ---
function handleDefaultTimeChange(event) {
    const input = event.target;
    let newTime = parseInt(input.value, 10);
    const minTime = parseInt(input.min, 10) || 5;
    const maxTime = parseInt(input.max, 10) || 120;

    // Validar y corregir el valor introducido
    if (isNaN(newTime)) {
        newTime = DEFAULT_TIME; // Resetear a default si no es número
    } else if (newTime < minTime) {
        newTime = minTime;
    } else if (newTime > maxTime) {
        newTime = maxTime;
    }
    // Actualizar el valor del input si se corrigió
    if (input.value !== newTime.toString()) {
       input.value = newTime;
    }


    // Actualizar todos los inputs de tiempo de las preguntas existentes
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    if (!questionsContainer) return;
    const questionTimeInputs = questionsContainer.querySelectorAll('.question-time');
    questionTimeInputs.forEach(qTimeInput => {
        qTimeInput.value = newTime;
    });
}

 function initBuilder() {
    quizBuilderView = document.getElementById('quiz-builder-view');
    addQuestionBtn = document.getElementById('add-question-btn');
    quizBuilderForm = document.getElementById('quiz-builder-form');
    importGiftBtn = document.getElementById('import-gift-btn');
    giftFileInput = document.getElementById('gift-file-input');
    questionsContainer = document.getElementById('questions-container');
    defaultQuestionTimeInput = document.getElementById('default-question-time'); // Obtener referencia

    const cancelBtnSmallTop = document.getElementById('cancel-quiz-builder-btn-top');
    const cancelBtnDuplicateTop = document.getElementById('cancel-quiz-builder-btn-top-duplicate');
    cancelQuizBuilderBtnBottom = document.getElementById('cancel-quiz-builder-btn-bottom');
    saveQuizBtn = document.getElementById('save-quiz-btn');
    const saveBtnDuplicateTop = document.getElementById('save-quiz-btn-top-duplicate');

    if (addQuestionBtn) addQuestionBtn.addEventListener('click', () => { addQuestionBlock(); });

    const cancelAction = () => {
        if (typeof showView === 'function') {
             showView('dashboard-view');
        } else {
            console.error("showView function is not defined");
            window.location.hash = '';
        }
    };
    if (cancelBtnSmallTop) cancelBtnSmallTop.addEventListener('click', cancelAction);
    if (cancelBtnDuplicateTop) cancelBtnDuplicateTop.addEventListener('click', cancelAction);
    if (cancelQuizBuilderBtnBottom) cancelQuizBuilderBtnBottom.addEventListener('click', cancelAction);

    if (quizBuilderForm) {
        quizBuilderForm.addEventListener('submit', saveQuiz);
    } else {
        console.error("Quiz builder form not found!");
    }

    if (importGiftBtn) importGiftBtn.addEventListener('click', () => giftFileInput?.click());
    if (giftFileInput) giftFileInput.addEventListener('change', handleFileSelect);

    // Listener para el input de tiempo por defecto
    if (defaultQuestionTimeInput) {
        defaultQuestionTimeInput.addEventListener('change', handleDefaultTimeChange); // Usar 'change' para que se dispare al perder foco o presionar Enter
        defaultQuestionTimeInput.addEventListener('input', handleDefaultTimeChange); // Usar 'input' para respuesta inmediata mientras se teclea/usa flechas
    }

    if (quizBuilderView) {
        quizBuilderView.addEventListener('click', (e) => {
             const addOptionButton = e.target.closest('.add-option-btn');
             const deleteOptionButton = e.target.closest('.delete-option-btn');
             const deleteQuestionButton = e.target.closest('.delete-question-btn');
             const moveUpButton = e.target.closest('.move-question-up-btn');
             const moveDownButton = e.target.closest('.move-question-down-btn');
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
                      updateBuilderUIState();
                      updateMoveButtonStates();
                  } else {
                      showInfoModal("No puedes eliminar la última pregunta. Añade otra primero si deseas reemplazarla.", "Acción No Permitida");
                  }
             } else if (moveUpButton && questionBlock) {
                 const prevSibling = questionBlock.previousElementSibling;
                 if (prevSibling) {
                     questionsContainer.insertBefore(questionBlock, prevSibling);
                     updateMoveButtonStates();
                 }
             } else if (moveDownButton && questionBlock) {
                 const nextSibling = questionBlock.nextElementSibling;
                 if (nextSibling) {
                     questionsContainer.insertBefore(questionBlock, nextSibling.nextSibling);
                     updateMoveButtonStates();
                 }
             }
         });
    }

    if (!document.getElementById('infoModal')) {
        console.warn("Info modal element (#infoModal) not found during initBuilder. Modals will fallback to alerts.");
    } else {
         console.log("Info modal element found.");
    }
 }

 // document.addEventListener('DOMContentLoaded', initBuilder);
