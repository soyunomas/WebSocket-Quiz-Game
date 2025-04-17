# 🎮 WebSocket-Quiz-Game

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) <!-- Opcional: Añade licencia si quieres -->

Una aplicación web para crear y jugar partidas de quiz en tiempo real, utilizando FastAPI (Python) para el backend y WebSockets para la comunicación instantánea con los clientes (HTML, CSS, JavaScript). ⚡️

**Estado:** 🚧 **Fase Beta** 🚧 - Funcionalidad principal implementada, pero puede contener bugs o requerir ajustes.

## 📝 Descripción Breve

Este proyecto permite a un "Anfitrión" crear cuestionarios de opción múltiple, **ya sea manualmente a través de una interfaz web o importando preguntas directamente desde archivos en formato GIFT**, e iniciar partidas interactivas. Los "Jugadores" pueden unirse usando un código de partida único y competir respondiendo preguntas en tiempo real. La puntuación se calcula basada en la corrección y la velocidad.

## 🖼️ Captura de Pantalla / Demo (Pendiente)

<!-- TODO: Añadir captura de pantalla cuando esté más pulido -->
<!-- ![Captura de Pantalla del Proyecto](screenshot.png) -->

*(Actualmente no hay demo pública disponible)*

## ✨ Características Principales

*   **🚀 Tiempo Real:** Juego interactivo gracias a WebSockets para comunicación bidireccional instantánea.
*   **👤 Roles Separados:** Vistas y lógica diferenciadas para el Anfitrión (Host) y los Jugadores (Players).
*   **📝 Creación/Edición de Quizzes (Host):**
    *   Interfaz para crear/editar títulos y preguntas.
    *   Añadir/eliminar opciones de respuesta (2-4 por pregunta).
    *   Marcar la respuesta correcta.
    *   Establecer límite de tiempo por pregunta.
    *   Reordenar preguntas mediante Drag & Drop.
*   **📄 Importación GIFT (Host):** Carga preguntas de opción múltiple desde archivos `.txt` en formato GIFT.
*   **🎮 Flujo de Juego (Host):**
    *   Iniciar partida y obtener código único.
    *   Ver jugadores unirse al lobby.
    *   Controlar el avance entre preguntas (o automático).
    *   Ver ranking en tiempo real (Top 5).
    *   Finalizar partida manualmente.
*   **🕹️ Flujo de Juego (Jugador):**
    *   Unirse con código de partida y apodo.
    *   Ver preguntas y opciones.
    *   Responder dentro del límite de tiempo.
    *   Recibir feedback instantáneo (correcto/incorrecto, puntos).
    *   Ver marcador entre preguntas.
    *   Ver podio final.
*   **💯 Puntuación:** Basada en acierto y velocidad de respuesta.
*   **💾 Persistencia Local (Host):** Los quizzes creados por el host se guardan en `localStorage` (simulación de base de datos).
*   **🌓 Tema Claro/Oscuro (Jugador):** Botón para cambiar entre temas claro y oscuro, con persistencia en `localStorage`.
*   **📱 Diseño Responsivo (Básico):** Intenta adaptarse a diferentes pantallas usando Bootstrap.

## 🛠️ Tecnologías Utilizadas

*   **Backend:**
    *   **Python 3.x**
    *   **FastAPI:** Framework web ASGI moderno y rápido.
    *   **Uvicorn:** Servidor ASGI.
    *   **WebSockets (FastAPI):** Para la comunicación en tiempo real.
    *   **Pydantic:** Para validación de datos y modelos.
*   **Frontend:**
    *   **HTML5:** Estructura semántica.
    *   **CSS3:** Estilos personalizados.
    *   **Bootstrap 5.3.x:** Framework CSS/JS para layout y componentes.
    *   **Bootstrap Icons:** Iconografía.
    *   **JavaScript (ES6+):** Lógica del cliente, manipulación del DOM, WebSockets (cliente), Drag & Drop, manejo de eventos, `localStorage`.
*   **Formato de Datos:**
    *   **JSON:** Para mensajes WebSocket y datos de quiz.
    *   **GIFT (Formato Moodle):** Para importación de preguntas.

## 🚀 Instalación y Ejecución Local

1.  **Clona el repositorio:**
    ```bash
    git clone https://github.com/soyunomas/WebSocket-Quiz-Game.git
    cd WebSocket-Quiz-Game
    ```

2.  **Crea y activa un entorno virtual (Recomendado):**
    ```bash
    python -m venv venv
    # En Windows:
    # venv\Scripts\activate
    # En macOS/Linux:
    # source venv/bin/activate
    ```

3.  **Instala las dependencias de Python:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Ejecuta el servidor FastAPI:**
    ```bash
    python main.py
    ```
    El servidor estará corriendo en `http://127.0.0.1:8000` (o `http://localhost:8000`).

5.  **Accede a las vistas:**
    *   **Jugador:** Abre tu navegador y ve a `http://127.0.0.1:8000`.
    *   **Anfitrión:** Abre otra pestaña o navegador y ve a `http://127.0.0.1:8000/host.html`.

## 🕹️ Cómo Usar

1.  **Anfitrión:**
    *   Abre `/host.html`.
    *   Inicia sesión (demo: `admin` / `1234`).
    *   Crea un nuevo quiz o edita/inicia uno existente.
        *   Al crear/editar: Añade preguntas, opciones, marca la correcta, ajusta tiempos. Puedes importar desde GIFT. Guarda el quiz.
    *   Desde el dashboard, haz clic en "Iniciar" en el quiz deseado.
    *   Comparte el CÓDIGO DE PARTIDA con los jugadores.
    *   Espera a que los jugadores se unan (los verás en la lista).
    *   Haz clic en "Empezar Juego".
    *   El juego avanzará automáticamente tras mostrar el marcador (5 segundos por defecto). Puedes pulsar "Siguiente" en la vista de la pregunta para saltar directamente al marcador.
    *   Puedes finalizar la partida antes con el botón correspondiente (usando el modal de confirmación).
    *   Al final, verás el podio. Vuelve al dashboard para otra partida.

2.  **Jugador:**
    *   Abre la dirección principal (`/`).
    *   Introduce el CÓDIGO DE PARTIDA proporcionado por el anfitrión.
    *   Introduce un APODO único.
    *   Espera en el lobby.
    *   Cuando el juego empiece, selecciona la opción que creas correcta antes de que el tiempo se agote.
    *   Verás el feedback y el marcador entre preguntas (avanzará automáticamente).
    *   Al final, verás tu puntuación/ranking y el podio. Puedes unirte a otra partida.

## 🚧 Por Hacer / Mejoras Futuras

-   [ ] Añadir cambio de tema (Claro/Oscuro) a la vista del Anfitrión (`host.html`).
-   [ ] Añadir feedback visual más claro cuando se copia el código de partida (ej. tooltip temporal).
-   [ ] Mejorar el manejo de errores de conexión y desconexiones inesperadas (ej. reintentos, mensajes más claros).
-   [ ] Implementar persistencia real para quizzes y partidas (ej. SQLite, PostgreSQL, MongoDB) en lugar de `localStorage` y memoria volátil.
-   [ ] Añadir autenticación de usuarios real para el Host (en lugar de la simulación `admin`/`1234`).
-   [ ] Refinar la UI/UX (mejorar estilos, transiciones, añadir animaciones sutiles).
-   [ ] Mostrar un resumen de respuestas por opción al final de cada pregunta para el Host.
-   [ ] Permitir al Host expulsar jugadores desde el lobby.
-   [ ] Añadir más tipos de preguntas (ej. verdadero/falso, respuesta corta - requeriría cambios significativos).
-   [ ] Escribir pruebas unitarias (para `game_logic`) y de integración (para API/WebSockets).
-   [ ] Optimizar el rendimiento del broadcast y manejo de estado para un gran número de jugadores concurrentes.
-   [ ] Investigar/implementar un mejor manejo del estado compartido (ej. Redis) si se usan múltiples workers en producción.
-   [ ] Configuración de despliegue (ej. Dockerfile, Gunicorn/Uvicorn en producción).
-   [ ] Añadir capturas de pantalla al README.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🧑‍💻 Contacto

Usuario de GitHub: [soyunomas](https://github.com/soyunomas)
