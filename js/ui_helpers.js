// Funciones para cambiar entre vistas (secciones)
function showView(viewId) {
  const views = document.querySelectorAll('main > section');
  views.forEach(view => {
    view.style.display = view.id === viewId ? 'block' : 'none';
  });
}

// Otras funciones útiles: mostrar errores, limpiar formularios, etc.
function displayError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = message ? 'block' : 'none';
  }
}
// ... más helpers ...
