// --- Lógica de Autenticación (Simulada) ---

// Referencias a elementos (se asignarán en main.js o se buscarán aquí)
let loginForm, registerForm, toggleAuthLink, authTitle, logoutButton;

function handleLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    if (!emailInput || !passwordInput) return; // Guard clause

    const email = emailInput.value;
    const password = passwordInput.value;
    console.log("Host Login attempt:", email);

    // --- SIMULACIÓN ---
    if (email === "admin" && password === "1234") {
         console.log("Hardcoded login successful for admin");
         window.hostAuthToken = "fake-admin-token-" + Date.now();
         window.hostEmail = email;
         localStorage.setItem('hostAuthToken', window.hostAuthToken);
         localStorage.setItem('hostEmail', window.hostEmail);
         loadQuizzesFromStorage(); // Asume que esta función está disponible (desde dashboard.js)
         showView('dashboard-view');
         displayError('login-error', '');
         if(loginForm) loginForm.reset();
    } else {
         displayError('login-error', 'Credenciales incorrectas (Prueba admin / 1234 para demo).');
    }
}

function handleRegister(e) {
     e.preventDefault();
     const emailInput = document.getElementById('register-email');
     const passwordInput = document.getElementById('register-password'); // Necesario para posible validación futura
     const loginEmailInput = document.getElementById('login-email');
     if (!emailInput || !passwordInput || !loginEmailInput || !registerForm) return;

     // --- SIMULACIÓN ---
     const email = emailInput.value;
     alert(`Simulación: Registro exitoso para ${email} (no guardado). Usa admin / 1234 para entrar.`);
     registerForm.reset();
     toggleAuthForms();
     loginEmailInput.value = email; // Pre-fill login form
     displayError('register-error', '');
}

function toggleAuthForms() {
    // Re-get elements in case they weren't ready initially
    loginForm = loginForm || document.getElementById('login-form');
    registerForm = registerForm || document.getElementById('register-form');
    authTitle = authTitle || document.getElementById('auth-title');
    toggleAuthLink = toggleAuthLink || document.getElementById('toggle-auth-link');

    if (!loginForm || !registerForm || !authTitle || !toggleAuthLink) return;

    const isLoginVisible = loginForm.style.display !== 'none';
    loginForm.style.display = isLoginVisible ? 'none' : 'block';
    registerForm.style.display = isLoginVisible ? 'block' : 'none';
    authTitle.textContent = isLoginVisible ? 'Registrarse' : 'Iniciar Sesión';
    toggleAuthLink.textContent = isLoginVisible ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate';
     displayError('login-error', '');
     displayError('register-error', '');
}

 function handleLogout() {
    if (window.hostWebSocket && window.hostWebSocket.readyState === WebSocket.OPEN) {
        window.hostWebSocket.close(1000, "Host logged out");
    }
    window.hostAuthToken = null;
    window.hostEmail = null;
    localStorage.removeItem('hostAuthToken');
    localStorage.removeItem('hostEmail');
    // No borramos los quizzes del localStorage al hacer logout
    resetHostState(); // Utility function
    showView('auth-view'); // Utility function

    // Reset forms if they exist
    loginForm = loginForm || document.getElementById('login-form');
    registerForm = registerForm || document.getElementById('register-form');
    if(loginForm) loginForm.reset();
    if(registerForm) registerForm.reset();

    console.log("Host logged out");
 }

 function initAuth() {
    // Get elements needed by this module
    loginForm = document.getElementById('login-form');
    registerForm = document.getElementById('register-form');
    toggleAuthLink = document.getElementById('toggle-auth-link');
    authTitle = document.getElementById('auth-title');
    logoutButton = document.getElementById('logout-button');

    // Add listeners if elements exist
    if(loginForm) loginForm.addEventListener('submit', handleLogin);
    if(registerForm) registerForm.addEventListener('submit', handleRegister);
    if(toggleAuthLink) toggleAuthLink.addEventListener('click', (e) => { e.preventDefault(); toggleAuthForms(); });
    if(logoutButton) logoutButton.addEventListener('click', handleLogout);
 }
