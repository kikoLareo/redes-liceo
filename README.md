# Redes · HC Liceo

Herramienta del equipo de redes del HC Liceo, pensada para el móvil (se instala en el iPhone como una app).

- **Calendario**: partidos (casa/fuera, OK Liga, Copa del Rey, Champions…), entrenos, trabajos y seguimientos, con filtros.
- **Sincronización** con el calendario de cada persona: `/cal/<token>.ics` (suscripción `webcal://`).
- **Tareas** tipo Notion (explicación en Markdown, checklist, personas, fecha, partido) e **Ideas** de contenido.
- **Asistente IA** (Claude): chat que conoce todos los datos y lee archivos; «Desarrollar con IA»; plan de redes por partido; importar partidos pegando un calendario.
- **Contactos y patrocinadores**, **archivos** (hasta 5 MB) y **equipo**.

## Estructura
- `public/`: la web (HTML, CSS y JS a mano, sin compilación) + manifest y service worker.
- `netlify/functions/api.mts`: datos y archivos en Netlify Blobs (`/api/datos`, `/api/escribir`, `/api/archivo`).
- `netlify/functions/cal.mts`: calendario `.ics` por persona.
- `netlify/functions/ia.mts`: asistente (`/api/ia/chat`, `/api/ia/desarrollar`, `/api/ia/importar`).
- **Los datos no están en el repositorio**: viven en Netlify.

## Variables de entorno (Netlify)
- `CLAVE_EQUIPO`: clave que se comparte con el equipo. Enlace directo: `https://<web>/?k=<clave>`.
- `ANTHROPIC_API_KEY`: activa la IA (opcional).
