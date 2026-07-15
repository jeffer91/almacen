/* =========================================================
Nombre completo: admin-navigation.test.js
Ruta o ubicación: /tests/admin-navigation.test.js
Función o funciones:
- Verificar las secciones del menú administrativo.
- Comprobar la traducción de errores técnicos de Firebase.
Con qué se conecta:
- app/renderer/admin-navigation.js
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ADMIN_SECTIONS,
  summarizeSyncError
} = require("../app/renderer/admin-navigation.js");

test("define las seis secciones del Centro de control", () => {
  assert.deepEqual(
    ADMIN_SECTIONS.map((section) => section.id),
    ["summary", "equipment", "database", "sync", "diagnostics", "backups"]
  );
});

test("resume el error de proyecto Firebase suspendido", () => {
  const result = summarizeSyncError(
    'Firebase rechazó la subida (403). {"error":{"status":"PERMISSION_DENIED","details":[{"reason":"CONSUMER_SUSPENDED"}]}}'
  );

  assert.equal(result.title, "Proyecto Firebase suspendido");
  assert.match(result.message, /base local/i);
  assert.match(result.technical, /CONSUMER_SUSPENDED/);
});

test("resume un error de permisos sin perder el detalle", () => {
  const result = summarizeSyncError("Permission denied: Firestore respondió 403");

  assert.equal(result.title, "Firebase rechazó el acceso");
  assert.match(result.message, /reglas de acceso/i);
  assert.match(result.technical, /403/);
});

test("no modifica mensajes normales de sincronización", () => {
  assert.equal(
    summarizeSyncError("La app trabaja localmente. Usa Sincronizar ahora para compartir cambios."),
    null
  );
});
