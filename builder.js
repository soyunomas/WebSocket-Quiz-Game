// --- Lógica del Quiz Builder (con GIFT y Tiempo por Defecto) ---

let quizBuilderView, builderTitle, quizBuilderForm, quizIdInput, quizTitleInput, defaultQuestionTimeInput,
    questionsContainer, addQuestionBtn, cancelQuizBuilderBtnBottom,
    saveQuizBtn,
    questionTemplate, optionTemplate,
    importGiftBtn, giftFileInput, giftFileNameSpan, giftImportStatus, // File import elements
    giftTextInput, importGiftTextBtn, copyGiftPromptBtn, giftPromptTemplateElement; // Text import elements

let nextQuestionTempId = 0;
let infoModalInstance = null;
const DEFAULT_TIME = 20; // Valor por defecto para el tiempo

function showInfoModal(message, title = 'Aviso') {
    const modalElement = document.getElementById('infoModal');
    const modalTitleElement = document.getElementById('infoModalLabel');
    const modalBodyElement = document.getElementById('infoModalBody');

    if (!modalElement || !modalTitleElement || !modalBodyElement) {
        console.error("Elementos del modal de información no encontrados (#infoModal, #infoModalLabel, #infoModalBody)");
        alert(message); // Fallback to alert
        return;
    }

    modalTitleElement.textContent = title;
    // Allow HTML in modal body for simple formatting if needed later
    // Be careful with user-generated content if you enable this broadly
    modalBodyElement.innerHTML = message; // Use innerHTML instead of textContent

    if (!infoModalInstance) {
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            try {
                infoModalInstance = new bootstrap.Modal(modalElement);
            } catch (e) {
                 console.error("Error initializing Bootstrap Modal:", e);
                 alert(message); // Fallback
                 return;
            }
        } else {
            console.error("Bootstrap Modal no está disponible. Asegúrate de que el JS de Bootstrap esté cargado.");
            alert(message); // Fallback
            return;
        }
    }
    // Verificar si el modal está ya visible para evitar errores
    if (modalElement.classList.contains('show')) {
        console.warn("Info modal already shown, updating content.");
    } else if (infoModalInstance) {
        try {
            infoModalInstance.show();
        } catch(e) {
             console.error("Error showing Bootstrap Modal:", e);
             alert(message); // Fallback
        }
    }
}


function openQuizBuilder(quiz = null) {
    // Re-initialize elements that might be needed before the view is shown
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
    giftTextInput = giftTextInput || document.getElementById('gift-text-input'); // Find text input

    if (!quizBuilderView || !builderTitle || !quizBuilderForm || !quizIdInput || !quizTitleInput || !defaultQuestionTimeInput || !questionsContainer || !giftFileInput || !giftFileNameSpan || !giftImportStatus || !giftTextInput) {
        console.error("Quiz builder elements not found!");
        return;
    }

    nextQuestionTempId = 0;
    questionsContainer.innerHTML = '';
    quizBuilderForm.reset(); // Resets form fields to initial values
    giftFileInput.value = '';
    giftFileNameSpan.textContent = '';
    giftFileNameSpan.style.display = 'none';
    giftImportStatus.textContent = '';
    giftImportStatus.className = 'mt-3'; // Reset class for color
    giftTextInput.value = ''; // Clear text area
    window.currentQuizForBuilder = null;

    // Reset tabs to the first one (File Import)
    const giftFileTab = document.getElementById('nav-gift-file-tab');
    const giftTextTab = document.getElementById('nav-gift-text-tab');
    const giftFilePane = document.getElementById('nav-gift-file');
    const giftTextPane = document.getElementById('nav-gift-text');
    if (giftFileTab && giftTextTab && giftFilePane && giftTextPane) {
        // Ensure Bootstrap's Tab instance handles activation if available
        const fileTabInstance = bootstrap.Tab.getInstance(giftFileTab) || new bootstrap.Tab(giftFileTab);
        fileTabInstance.show();
    }


    if (quiz) {
         window.currentQuizForBuilder = JSON.parse(JSON.stringify(quiz));
         builderTitle.textContent = "Editar Cuestionario";
         quizIdInput.value = window.currentQuizForBuilder.id;
         quizTitleInput.value = window.currentQuizForBuilder.title;
         const firstQuestionTime = window.currentQuizForBuilder.questions?.[0]?.time_limit;
         defaultQuestionTimeInput.value = firstQuestionTime ? firstQuestionTime : DEFAULT_TIME;

         console.log("Loading quiz for editing:", window.currentQuizForBuilder.id);
         if (window.currentQuizForBuilder.questions && window.currentQuizForBuilder.questions.length > 0) {
             window.currentQuizForBuilder.questions.forEach(q => addQuestionBlock(q));
         } else {
              addQuestionBlock(); // Add an empty one if the quiz has no questions
         }
    } else {
        builderTitle.textContent = "Crear Nuevo Cuestionario";
        quizIdInput.value = '';
        defaultQuestionTimeInput.value = DEFAULT_TIME; // Ensure default time on create
        addQuestionBlock(); // Add one initial question
    }

    updateBuilderUIState();
    updateMoveButtonStates();
    showView('quiz-builder-view');
}

// --- Resto de funciones (loadQuizForEditing, addQuestionBlock, addOptionBlock, updateBuilderUIState, updateMoveButtonStates, saveQuiz) permanecen igual que en la versión anterior ---
// ... (Assume these functions are here and correct as per the previous version) ...
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
    if (!questionTemplate || !questionsContainer || !defaultQuestionTimeInput) {
        console.error("Missing elements for adding question block.");
        return;
    }

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

     const timeToSet = questionData?.time_limit ?? defaultQuestionTimeInput.value ?? DEFAULT_TIME;
     questionTimeInput.value = timeToSet;

     if (questionData) {
         questionTextInput.value = questionData.text || '';
         questionBlock.dataset.id = questionData.id || '';

         if (questionData.options && Array.isArray(questionData.options) && questionData.options.length >= 2) {
            questionData.options.forEach(opt => addOptionBlock(optionsCont, radioGroupName, opt));
         } else {
              // Fallback: Add 2 empty options if data is incomplete/invalid
              addOptionBlock(optionsCont, radioGroupName);
              addOptionBlock(optionsCont, radioGroupName);
         }
     } else {
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

     radioInput.name = radioGroupName; // Crucial for radio button groups

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

     // Ensure delete buttons on *all* blocks are updated if a block was removed/added
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
     // Re-acquire elements within the function scope to be safe
     const currentQuizTitleInput = document.getElementById('quiz-title');
     const currentQuestionsContainer = document.getElementById('questions-container');
     const currentQuizIdInput = document.getElementById('quiz-id');
     const saveBtnBottom = document.getElementById('save-quiz-btn');
     const saveBtnTop = document.getElementById('save-quiz-btn-top-duplicate');


     if (!currentQuizTitleInput || !currentQuestionsContainer || !currentQuizIdInput || !saveBtnBottom || !saveBtnTop) {
         console.error("Elementos necesarios para guardar no encontrados.");
         showInfoModal("Error interno: No se pudieron encontrar elementos clave del formulario.", "Error Crítico");
         return;
     }

     console.log("Validating and preparing quiz data...");
     const quizData = {
        title: currentQuizTitleInput.value.trim(),
        questions: []
     };

     let isValid = true;
     let firstErrorField = null;
     let errorMessage = '';

     if (!quizData.title) {
         errorMessage = "El título del cuestionario no puede estar vacío.";
         isValid = false; firstErrorField = currentQuizTitleInput;
     }

     const questionBlocks = currentQuestionsContainer.querySelectorAll('.question-block');

     if (isValid && questionBlocks.length === 0) {
          errorMessage = "El cuestionario debe tener al menos una pregunta.";
          isValid = false;
          firstErrorField = document.getElementById('add-question-btn');
     }

     if (isValid) {
         for (let qIndex = 0; qIndex < questionBlocks.length; qIndex++) {
             const qb = questionBlocks[qIndex];
             const questionTextInput = qb.querySelector('.question-text');
             const questionTimeInput = qb.querySelector('.question-time');
             if (!questionTextInput || !questionTimeInput) {
                 isValid = false; errorMessage = "Error interno al procesar la estructura de la pregunta."; break;
             }

             const questionText = questionTextInput.value.trim();
             const questionTime = parseInt(questionTimeInput.value, 10);
             const optionsData = [];
             let correctOptionFound = false;
             const questionId = qb.dataset.id || `q_${Date.now()}_${qIndex}`;

             if (!questionText) {
                 errorMessage = `El texto de la pregunta ${qIndex + 1} no puede estar vacío.`;
                 isValid = false; firstErrorField = questionTextInput; break;
             }
             if (isNaN(questionTime) || questionTime < 5 || questionTime > 120) {
                 errorMessage = `El tiempo límite de la pregunta ${qIndex + 1} debe ser entre 5 y 120 segundos.`;
                 isValid = false; firstErrorField = questionTimeInput; break;
             }

             const optionBlocks = qb.querySelectorAll('.option-block');
             if (optionBlocks.length < 2 || optionBlocks.length > 4) {
                  errorMessage = `La pregunta ${qIndex + 1} debe tener entre 2 y 4 opciones.`;
                  isValid = false;
                  firstErrorField = qb.querySelector('.add-option-btn') || optionBlocks[0]?.querySelector('.option-text');
                  break;
             }

             let multipleCorrect = false;
             for (let oIndex = 0; oIndex < optionBlocks.length; oIndex++) {
                 const ob = optionBlocks[oIndex];
                 const optionTextInput = ob.querySelector('.option-text');
                 const optionCorrectInput = ob.querySelector('.option-correct');
                 if (!optionTextInput || !optionCorrectInput) {
                     isValid = false; errorMessage = "Error interno al procesar la estructura de una opción."; break;
                 }

                 const optionText = optionTextInput.value.trim();
                 const isCorrect = optionCorrectInput.checked;
                 const optionId = ob.dataset.id || `opt_${questionId}_${oIndex}`;

                 if (!optionText) {
                     errorMessage = `El texto de la opción ${oIndex + 1} en la pregunta ${qIndex + 1} no puede estar vacío.`;
                     isValid = false; firstErrorField = optionTextInput; break;
                 }
                 if (isCorrect) {
                    if (correctOptionFound) {
                        multipleCorrect = true;
                        errorMessage = `La pregunta ${qIndex + 1} tiene más de una opción marcada como correcta.`;
                        isValid = false; firstErrorField = optionCorrectInput; break;
                    }
                    correctOptionFound = true;
                 }

                 optionsData.push({ id: optionId, text: optionText, is_correct: isCorrect });
             }
             if (!isValid) break; // Exit outer loop if inner loop failed

             if (!correctOptionFound && !multipleCorrect) {
                 errorMessage = `Debes marcar una opción como correcta en la pregunta ${qIndex + 1}.`;
                 isValid = false;
                 firstErrorField = qb.querySelector('.option-correct');
                 break;
             }

             quizData.questions.push({
                 id: questionId,
                 text: questionText,
                 time_limit: questionTime,
                 options: optionsData,
                 order: qIndex
             });
         } // End of question loop
     }

     if (!isValid) {
         console.error("Validation failed:", errorMessage);
         showInfoModal(errorMessage, "Error de Validación");
         if (firstErrorField && typeof firstErrorField.focus === 'function') {
             firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
             firstErrorField.focus();
             firstErrorField.classList.add('is-invalid');
             setTimeout(() => firstErrorField.classList.remove('is-invalid'), 3000);
         }
         return;
     }

     console.log("Quiz data is valid. Saving (simulated)...");
     saveBtnBottom.disabled = true;
     saveBtnTop.disabled = true;
     saveBtnBottom.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';
     saveBtnTop.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';

     const existingQuizId = currentQuizIdInput.value;
     quizData.id = existingQuizId || `quiz_${Date.now()}`;

     setTimeout(() => {
         let saved = false;
         if (!window.quizzes) window.quizzes = [];

         try {
             if (existingQuizId) {
                const index = window.quizzes.findIndex(q => q && q.id === existingQuizId);
                if (index !== -1) {
                    window.quizzes[index] = quizData;
                    console.log("Quiz updated:", quizData.id);
                    saved = true;
                } else {
                    console.error("Error: Quiz to edit not found in array");
                    showInfoModal("Error al guardar: No se encontró el cuestionario que intentabas editar. Puede que haya sido eliminado.", "Error de Guardado");
                }
             } else {
                window.quizzes.push(quizData);
                console.log("Quiz created:", quizData.id);
                saved = true;
             }

             if (saved) {
                 if (typeof saveQuizzesToStorage === 'function') {
                     saveQuizzesToStorage();
                 } else { console.warn("saveQuizzesToStorage is not defined"); }

                 if (typeof renderQuizList === 'function') {
                     renderQuizList();
                 } else { console.warn("renderQuizList is not defined"); }

                 if (typeof showView === 'function') {
                     showView('dashboard-view');
                 } else { console.warn("showView is not defined"); }
             }
         } catch (error) {
              console.error("Error during save/update process:", error);
              showInfoModal(`Ocurrió un error inesperado al guardar: ${error.message}`, "Error Crítico");
              saved = false;
         } finally {
             saveBtnBottom.disabled = false;
             saveBtnTop.disabled = false;
             saveBtnBottom.innerHTML = 'Guardar Cuestionario';
             saveBtnTop.innerHTML = 'Guardar Cuestionario';
         }

     }, 300); // End setTimeout
 }

// --- Lógica para Importar GIFT ---

 function displayGiftImportStatus(message, isSuccess = false) {
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');
    if (giftImportStatus) {
        giftImportStatus.textContent = message;
        giftImportStatus.className = `mt-3 alert ${isSuccess ? 'alert-success' : 'alert-danger'}`;
    } else {
        console.warn("gift-import-status element not found, using modal/alert.");
        showInfoModal(message, isSuccess ? "Importación Exitosa" : "Error de Importación");
    }
}

 function processGIFTContent(giftContent) {
    // Ensure necessary elements are available
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');
    quizTitleInput = quizTitleInput || document.getElementById('quiz-title');
    questionsContainer = questionsContainer || document.getElementById('questions-container');
    quizIdInput = quizIdInput || document.getElementById('quiz-id');
    defaultQuestionTimeInput = defaultQuestionTimeInput || document.getElementById('default-question-time');

    if (!giftImportStatus || !quizTitleInput || !questionsContainer || !quizIdInput || !defaultQuestionTimeInput) {
         console.error("Cannot process GIFT content, essential builder elements missing.");
         displayGiftImportStatus("Error interno al procesar contenido GIFT.");
         return;
    }
    // Clear previous status message before processing
    giftImportStatus.textContent = '';
    giftImportStatus.className = 'mt-3'; // Reset class

    try {
        console.log("Attempting to parse GIFT content:\n", giftContent.substring(0, 200) + "..."); // Log start of content
        const parsedQuestions = parseGIFT(giftContent);
        console.log(`parseGIFT returned ${parsedQuestions.length} questions.`);

        if (parsedQuestions.length > 0) {

            const isCreatingNewQuiz = !quizIdInput.value;
            const existingQuestionBlocks = questionsContainer.querySelectorAll('.question-block');
            let shouldClearInitialBlock = false;

            if (isCreatingNewQuiz && existingQuestionBlocks.length === 1) {
                const firstQuestionText = existingQuestionBlocks[0].querySelector('.question-text');
                const firstOptionsContainer = existingQuestionBlocks[0].querySelector('.options-container');
                const firstOptions = firstOptionsContainer ? firstOptionsContainer.querySelectorAll('.option-text') : [];
                let firstOptionsAreEmpty = Array.from(firstOptions).every(optInput => optInput.value.trim() === '');
                const firstRadio = existingQuestionBlocks[0].querySelector('.option-correct');
                let firstRadioUnchecked = firstRadio ? !firstRadio.checked : true;

                if (firstQuestionText && firstQuestionText.value.trim() === '' && firstOptionsAreEmpty && firstRadioUnchecked) {
                    shouldClearInitialBlock = true;
                }
            }

            if (shouldClearInitialBlock) {
                console.log("Clearing initial empty block before GIFT import.");
                questionsContainer.innerHTML = '';
            }

            const currentDefaultTime = defaultQuestionTimeInput.value || DEFAULT_TIME;
            parsedQuestions.forEach(q => {
               q.time_limit = parseInt(currentDefaultTime, 10);
               addQuestionBlock(q);
            });

            displayGiftImportStatus(`${parsedQuestions.length} pregunta(s) importada(s) correctamente. Revisa y guarda.`, true);

            if (!quizTitleInput.value.trim() && parsedQuestions[0]._giftTitle) {
                quizTitleInput.value = parsedQuestions[0]._giftTitle;
                console.log(`Set quiz title from GIFT: "${parsedQuestions[0]._giftTitle}"`);
            }
             updateBuilderUIState();
             updateMoveButtonStates();

        } else {
            // Only display error if content was provided but no questions parsed
            if(giftContent) {
                displayGiftImportStatus('No se encontraron preguntas de opción múltiple válidas (formato GIFT) en el contenido proporcionado. Verifica el formato.');
            } else {
                 displayGiftImportStatus('El contenido GIFT estaba vacío.');
            }
        }
    } catch (parseError) {
        console.error("Error processing GIFT content:", parseError);
        displayGiftImportStatus(`Error al procesar el contenido GIFT: ${parseError.message}`);
    }
}


 function handleFileSelect(event) {
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status');
    giftFileNameSpan = giftFileNameSpan || document.getElementById('gift-file-name');
    giftFileInput = giftFileInput || document.getElementById('gift-file-input');
    if (!giftImportStatus || !giftFileNameSpan || !giftFileInput) {
         console.error("Missing elements for file handling."); return;
    }

    giftImportStatus.textContent = '';
    giftImportStatus.className = 'mt-3';
    const file = event.target.files[0];

    if (!file) {
        giftFileNameSpan.textContent = ''; giftFileNameSpan.style.display = 'none';
        return;
    }
    giftFileNameSpan.textContent = file.name; giftFileNameSpan.style.display = 'inline-block';
    console.log("Selected GIFT file:", file.name);

    if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.gift')) {
        displayGiftImportStatus('Error: El archivo debe ser .txt o .gift.');
        resetGiftInput();
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
         const fileContent = e.target.result;
         processGIFTContent(fileContent);
         resetGiftInput();
     };
    reader.onerror = (e) => {
         console.error("Error reading file:", e);
         displayGiftImportStatus('Error al leer el archivo.');
         resetGiftInput();
     };
    reader.readAsText(file);
}

 function handleGiftTextImport() {
    console.log("handleGiftTextImport function called!"); // <-- Check if called
    giftTextInput = giftTextInput || document.getElementById('gift-text-input');
    giftImportStatus = giftImportStatus || document.getElementById('gift-import-status'); // Ensure status element is available

    if (!giftTextInput) {
        console.error("GIFT text input area (#gift-text-input) not found.");
        // Attempt to display error even if status element is missing initially
        const statusEl = document.getElementById('gift-import-status');
        if(statusEl) {
            statusEl.textContent = "Error interno: No se encontró el área de texto.";
            statusEl.className = 'mt-3 alert alert-danger';
        } else {
            showInfoModal("Error interno: No se encontró el área de texto.", "Error");
        }
        return;
    }
     if (giftImportStatus) { // Clear previous status if element exists
        giftImportStatus.textContent = '';
        giftImportStatus.className = 'mt-3';
     }

    const giftContent = giftTextInput.value.trim();
    console.log("Content from textarea:", giftContent.substring(0,100)+"..."); // <-- Check content

    if (!giftContent) {
        displayGiftImportStatus("El cuadro de texto está vacío. Pega el contenido GIFT primero.");
        return;
    }
    processGIFTContent(giftContent); // Use the common processing function
    // Decide if you want to clear the textarea after import:
    // giftTextInput.value = '';
 }

 function copyGiftPrompt() {
    console.log("copyGiftPrompt function called!"); // <-- Check if called
    copyGiftPromptBtn = copyGiftPromptBtn || document.getElementById('copy-gift-prompt-btn');
    giftPromptTemplateElement = giftPromptTemplateElement || document.getElementById('gift-prompt-template');

    if (!copyGiftPromptBtn || !giftPromptTemplateElement) {
        console.error("Copy button (#copy-gift-prompt-btn) or prompt template (#gift-prompt-template) not found.");
        showInfoModal("Error interno: No se pudo encontrar el botón o la plantilla del prompt.", "Error");
        return;
    }

    const promptText = giftPromptTemplateElement.value;
     console.log("Prompt text to copy:", promptText); // <-- Check text being copied

    if (!promptText) {
        showInfoModal("No hay prompt definido para copiar.", "Aviso");
        return;
    }

    // Check if Clipboard API is available and we're in a secure context
    if (!navigator.clipboard) {
        console.error('Clipboard API not available. Needs HTTPS or localhost.');
        showInfoModal('Error: La función de copiar al portapapeles no está disponible en este navegador o requiere una conexión segura (HTTPS). Intenta copiar manualmente.', "Error al Copiar");
        // Fallback: Select the text? Might not work well for hidden textarea.
        return;
    }

    navigator.clipboard.writeText(promptText).then(() => {
        console.log('Prompt copied to clipboard:', promptText);
        const originalButtonContent = copyGiftPromptBtn.innerHTML; // Store original HTML content
        copyGiftPromptBtn.innerHTML = '<i class="bi bi-check-lg"></i> Copiado!';
        copyGiftPromptBtn.disabled = true;

        setTimeout(() => {
            copyGiftPromptBtn.innerHTML = originalButtonContent; // Restore original HTML
            copyGiftPromptBtn.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy prompt: ', err);
        showInfoModal(`Error al copiar el prompt al portapapeles: ${err.message}. Por favor, intenta copiarlo manualmente.`, "Error al Copiar");
    });
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
     const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n+/);
     let currentTitle = null;

     console.log(`parseGIFT processing ${blocks.length} potential blocks.`);

     blocks.forEach((block, index) => {
         block = block.trim();
         if (!block || block.startsWith('//')) {
             // console.log(`Skipping block ${index+1}: Empty or comment.`);
             return;
         }

         let questionText = block;
         let answerBlockContent = '';
         let questionTitle = null;

         if (questionText.startsWith('::')) {
            const titleEndIndex = questionText.indexOf('::', 2);
            if (titleEndIndex !== -1) {
                questionTitle = questionText.substring(2, titleEndIndex).trim();
                questionText = questionText.substring(titleEndIndex + 2).trim();
                currentTitle = questionTitle;
            } else {
                console.warn(`GIFT block ${index+1}: Starts with '::' but no closing '::' found. Treating as text.`);
            }
         }

         const answerStartIndex = questionText.indexOf('{');
         if (answerStartIndex === -1 || !questionText.endsWith('}')) {
             console.warn(`GIFT block ${index+1} skipped: No valid answer block {} found or block doesn't end with '}'. Text:`, questionText.substring(0, 50) + "...");
             return;
         }

         answerBlockContent = questionText.substring(answerStartIndex + 1, questionText.length - 1).trim();
         questionText = questionText.substring(0, answerStartIndex).trim();

         questionText = questionText.replace(/\[(html|moodle|markdown|plain|tex)\]/gi, '');
         questionText = questionText.replace(/<[^>]+>/g, '');
         questionText = questionText.replace(/\\([:={}\[\]#~])/g, '$1');

         const options = [];
         let correctCount = 0;
         const optionRegex = /([=~])(?:%-?\d+(?:\.\d+)?%)?\s*((?:[^\\#=~]|\\.)+?)(?:\s*#((?:[^\\=~]|\\.)*))?\s*(?=[=~]|$)/g;
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
                 console.warn(`GIFT block ${index+1}: Skipped an option because its text became empty after cleaning.`);
            }
         }

         const isValidMC = questionText.trim() && options.length >= 2 && options.length <= 4 && correctCount === 1;

         if (isValidMC) {
            console.log(`GIFT block ${index+1}: Parsed successfully as MC.`);
            questions.push({
                id: `q_gift_${index}`,
                text: questionText.trim(),
                time_limit: DEFAULT_TIME,
                options: options,
                _giftTitle: questionTitle || currentTitle
            });
         } else {
             console.warn(`GIFT block ${index+1} skipped: Not a valid single-choice MC. Reason(s): ` +
                          `${!questionText.trim() ? 'No question text. ' : ''}` +
                          `${(options.length < 2 || options.length > 4) ? `Invalid option count (${options.length}). ` : ''}` +
                          `${correctCount !== 1 ? `Incorrect number of correct answers (${correctCount}). ` : ''}` +
                          `Original block approx: ${block.substring(0, 50)}...`);
         }
     });
     console.log(`parseGIFT finished. Returning ${questions.length} valid questions.`);
     return questions;
 }

// --- Manejador para el cambio de tiempo por defecto ---
function handleDefaultTimeChange(event) {
    const input = event.target;
    let newTime = parseInt(input.value, 10);
    const minTime = parseInt(input.min, 10) || 5;
    const maxTime = parseInt(input.max, 10) || 120;

    if (isNaN(newTime)) {
        newTime = DEFAULT_TIME;
    } else {
        newTime = Math.max(minTime, Math.min(newTime, maxTime));
    }

    if (input.value !== String(newTime)) {
       input.value = newTime;
    }

    questionsContainer = questionsContainer || document.getElementById('questions-container');
    if (!questionsContainer) return;
    const questionTimeInputs = questionsContainer.querySelectorAll('.question-time');
    questionTimeInputs.forEach(qTimeInput => {
        qTimeInput.value = newTime;
    });
    // console.log(`Default time changed, applied ${newTime}s to ${questionTimeInputs.length} questions.`); // Optional log
}

 function initBuilder() {
    console.log("initBuilder running..."); // <-- Check if initBuilder runs

    quizBuilderView = document.getElementById('quiz-builder-view');
    addQuestionBtn = document.getElementById('add-question-btn');
    quizBuilderForm = document.getElementById('quiz-builder-form');
    questionsContainer = document.getElementById('questions-container');
    defaultQuestionTimeInput = document.getElementById('default-question-time');

    // File Import elements
    importGiftBtn = document.getElementById('import-gift-btn');
    giftFileInput = document.getElementById('gift-file-input');
    giftFileNameSpan = document.getElementById('gift-file-name');

    // Text Import elements
    giftTextInput = document.getElementById('gift-text-input');
    importGiftTextBtn = document.getElementById('import-gift-text-btn');
    copyGiftPromptBtn = document.getElementById('copy-gift-prompt-btn');
    giftPromptTemplateElement = document.getElementById('gift-prompt-template');

    // Common status element
    giftImportStatus = document.getElementById('gift-import-status');

    // Buttons
    const cancelBtnSmallTop = document.getElementById('cancel-quiz-builder-btn-top');
    const cancelBtnDuplicateTop = document.getElementById('cancel-quiz-builder-btn-top-duplicate');
    cancelQuizBuilderBtnBottom = document.getElementById('cancel-quiz-builder-btn-bottom');
    saveQuizBtn = document.getElementById('save-quiz-btn');
    const saveBtnDuplicateTop = document.getElementById('save-quiz-btn-top-duplicate');

    // --- Event Listeners ---
    // Clear previous listeners if initBuilder is called multiple times (defensive)
    // Note: This requires storing references or a more robust teardown mechanism
    // For simplicity now, we assume initBuilder is called once per page load.

    if (addQuestionBtn) {
        addQuestionBtn.removeEventListener('click', addQuestionBlock); // Prevent duplicates if re-run
        addQuestionBtn.addEventListener('click', addQuestionBlock);
        console.log("Listener added for addQuestionBtn");
    } else { console.error("Add Question button not found"); }

    const cancelAction = () => {
        if (typeof showView === 'function') {
             showView('dashboard-view');
        } else {
            console.error("showView function is not defined");
        }
    };
    if (cancelBtnSmallTop) {
        cancelBtnSmallTop.removeEventListener('click', cancelAction);
        cancelBtnSmallTop.addEventListener('click', cancelAction);
         console.log("Listener added for cancelBtnSmallTop");
    }
    if (cancelBtnDuplicateTop) {
         cancelBtnDuplicateTop.removeEventListener('click', cancelAction);
         cancelBtnDuplicateTop.addEventListener('click', cancelAction);
          console.log("Listener added for cancelBtnDuplicateTop");
    }
    if (cancelQuizBuilderBtnBottom) {
         cancelQuizBuilderBtnBottom.removeEventListener('click', cancelAction);
         cancelQuizBuilderBtnBottom.addEventListener('click', cancelAction);
         console.log("Listener added for cancelQuizBuilderBtnBottom");
    }

    if (quizBuilderForm) {
        quizBuilderForm.removeEventListener('submit', saveQuiz);
        quizBuilderForm.addEventListener('submit', saveQuiz);
         console.log("Listener added for quizBuilderForm submit");
    } else {
        console.error("Quiz builder form not found!");
    }

    // File Import Listeners
    if (importGiftBtn && giftFileInput) {
         importGiftBtn.removeEventListener('click', () => giftFileInput.click()); // Need named function or wrapper
         importGiftBtn.addEventListener('click', () => {
             console.log("Import GIFT file button clicked");
             giftFileInput.click();
         });
         console.log("Listener added for importGiftBtn");
    } else { console.error("File import button or input not found"); }
    if (giftFileInput) {
         giftFileInput.removeEventListener('change', handleFileSelect);
         giftFileInput.addEventListener('change', handleFileSelect);
          console.log("Listener added for giftFileInput change");
    } else { console.error("File input element not found"); }

    // Text Import Listeners
    if (importGiftTextBtn) {
        importGiftTextBtn.removeEventListener('click', handleGiftTextImport);
        importGiftTextBtn.addEventListener('click', handleGiftTextImport);
         console.log("Listener added for importGiftTextBtn");
    } else { console.error("Text import button (#import-gift-text-btn) not found"); }

    if (copyGiftPromptBtn) {
         copyGiftPromptBtn.removeEventListener('click', copyGiftPrompt);
         copyGiftPromptBtn.addEventListener('click', copyGiftPrompt);
          console.log("Listener added for copyGiftPromptBtn");
    } else { console.error("Copy prompt button (#copy-gift-prompt-btn) not found"); }

    // Default Time Input Listener
    if (defaultQuestionTimeInput) {
        defaultQuestionTimeInput.removeEventListener('change', handleDefaultTimeChange);
        defaultQuestionTimeInput.removeEventListener('input', handleDefaultTimeChange);
        defaultQuestionTimeInput.addEventListener('change', handleDefaultTimeChange);
        defaultQuestionTimeInput.addEventListener('input', handleDefaultTimeChange);
         console.log("Listeners added for defaultQuestionTimeInput");
    } else { console.error("Default time input not found"); }


    // Event delegation for dynamic elements
    if (questionsContainer) {
        // Remove existing listener before adding a new one (if initBuilder runs multiple times)
        // This requires storing the listener function reference if it's complex,
        // but for this structure, re-adding might be okay assuming single init call.
        // A more robust approach would be to have a single listener added once.
        questionsContainer.addEventListener('click', (e) => {
             const questionBlock = e.target.closest('.question-block');
             if (!questionBlock) return;

             const addOptionButton = e.target.closest('.add-option-btn');
             const deleteOptionButton = e.target.closest('.delete-option-btn');
             const deleteQuestionButton = e.target.closest('.delete-question-btn');
             const moveUpButton = e.target.closest('.move-question-up-btn');
             const moveDownButton = e.target.closest('.move-question-down-btn');

             if (addOptionButton) {
                 const optionsCont = questionBlock.querySelector('.options-container');
                 const radioGroupName = `correct_option_${questionBlock.dataset.tempId}`;
                 if (optionsCont) {
                    addOptionBlock(optionsCont, radioGroupName);
                    updateBuilderUIState(questionBlock);
                 }
             } else if (deleteOptionButton) {
                  const optionBlock = deleteOptionButton.closest('.option-block');
                  if (optionBlock) {
                    optionBlock.remove();
                    updateBuilderUIState(questionBlock);
                  }
             } else if (deleteQuestionButton) {
                  const allBlocks = questionsContainer.querySelectorAll('.question-block');
                  if (allBlocks.length > 1) {
                      questionBlock.remove();
                      updateBuilderUIState();
                      updateMoveButtonStates();
                  } else {
                      showInfoModal("No puedes eliminar la última pregunta. Añade otra primero si deseas reemplazarla.", "Acción No Permitida");
                  }
             } else if (moveUpButton && !moveUpButton.disabled) {
                 const prevSibling = questionBlock.previousElementSibling;
                 if (prevSibling) {
                     questionsContainer.insertBefore(questionBlock, prevSibling);
                     updateMoveButtonStates();
                 }
             } else if (moveDownButton && !moveDownButton.disabled) {
                 const nextSibling = questionBlock.nextElementSibling;
                 if (nextSibling) {
                     questionsContainer.insertBefore(questionBlock, nextSibling.nextElementSibling);
                     updateMoveButtonStates();
                 }
             }
         });
          console.log("Delegated listener added for questionsContainer");
    } else {
        console.error("Questions container not found for event delegation!");
    }

    if (!document.getElementById('infoModal')) {
        console.warn("Info modal element (#infoModal) not found during initBuilder. Modals will fallback to alerts.");
    } else {
         console.log("Info modal element found.");
    }
     console.log("initBuilder finished.");
 }

// Ensure initBuilder runs after the DOM is ready and all scripts are loaded.
// Typically called from main.js or similar entry point.
// If still having issues, ensure initBuilder() is actually being called AFTER
// the DOM is fully loaded and Bootstrap JS is initialized.
