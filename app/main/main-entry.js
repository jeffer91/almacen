/* =========================================================
Nombre completo: main-entry.js
Ruta o ubicación: /app/main/main-entry.js
Función:
- Aplicar migraciones y mejoras comerciales antes de iniciar Electron.
- Mantener main.js como núcleo estable de la aplicación.
========================================================= */

"use strict";

require("./enhancements/register");
require("./main");
