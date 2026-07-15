/* =========================================================
Nombre completo: admin-auth.test.js
Ruta o ubicación: /tests/admin-auth.test.js
Función o funciones:
- Verificar la creación segura de la contraseña administrativa.
- Confirmar que la contraseña correcta e incorrecta se distinguen.
- Comprobar el cierre automático y el bloqueo por intentos fallidos.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  createAdminCredential,
  isAdminConfigured,
  verifyAdminPassword
} = require("../app/main/admin-auth-store");
const { AdminSessionManager } = require("../app/main/admin-session");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-auth-"));

  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("crea y verifica una contraseña administrativa sin guardar texto plano", async () => {
  await withTempDirectory(async (directory) => {
    assert.equal(await isAdminConfigured(directory), false);

    await createAdminCredential(directory, "ClaveSegura2026");

    assert.equal(await isAdminConfigured(directory), true);
    assert.equal(await verifyAdminPassword(directory, "ClaveSegura2026"), true);
    assert.equal(await verifyAdminPassword(directory, "ClaveIncorrecta"), false);

    const saved = await fs.readFile(path.join(directory, "admin-auth.json"), "utf8");
    assert.equal(saved.includes("ClaveSegura2026"), false);
  });
});

test("rechaza contraseñas demasiado cortas", async () => {
  await withTempDirectory(async (directory) => {
    await assert.rejects(
      createAdminCredential(directory, "123"),
      (error) => error.code === "PASSWORD_TOO_SHORT"
    );
  });
});

test("acepta una contraseña sencilla de cuatro caracteres", async () => {
  await withTempDirectory(async (directory) => {
    await createAdminCredential(directory, "1234");
    assert.equal(await verifyAdminPassword(directory, "1234"), true);
  });
});

test("la sesión se cierra al vencer y bloquea después de varios intentos", () => {
  const session = new AdminSessionManager({
    sessionDurationMs: 1000,
    maxFailedAttempts: 3,
    lockoutDurationMs: 5000
  });

  session.registerSuccessfulLogin(1000);
  assert.equal(session.isUnlocked(1500), true);
  assert.equal(session.isUnlocked(2000), false);

  session.registerFailedLogin(3000);
  session.registerFailedLogin(3100);
  const status = session.registerFailedLogin(3200);

  assert.equal(status.locked, true);
  assert.equal(status.attemptsRemaining, 0);
  assert.equal(session.isLocked(7000), true);
  assert.equal(session.isLocked(8200), false);
});
