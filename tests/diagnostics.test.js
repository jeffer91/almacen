/* =========================================================
Nombre completo: diagnostics.test.js
Ruta o ubicación: /tests/diagnostics.test.js
Función o funciones:
- Verificar la normalización de reportes de pantallas.
- Confirmar el cálculo del estado general.
- Ejecutar y persistir un diagnóstico completo en SQLite.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const {
  DiagnosticsService,
  normalizeScreenReport,
  overallStatus
} = require("../app/main/diagnostics/diagnostics-service");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-diagnostics-"));

  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-diagnostics-001",
    configuredAt: new Date().toISOString()
  };
}

test("normaliza reportes y calcula el peor estado", () => {
  const report = normalizeScreenReport({
    screenKey: "home-screen",
    label: "Pantalla principal",
    status: "desconocido",
    message: "   Falta revisar   ",
    details: { total: 4, ignored: { nested: true } }
  });

  assert.equal(report.status, "failed");
  assert.equal(report.message, "Falta revisar");
  assert.equal(report.details.total, 4);
  assert.equal(report.details.ignored, undefined);

  assert.equal(overallStatus([{ status: "passed" }]), "healthy");
  assert.equal(overallStatus([{ status: "passed" }, { status: "warning" }]), "warning");
  assert.equal(overallStatus([{ status: "warning" }, { status: "failed" }]), "error");
});

test("guarda reportes y un diagnóstico completo", async () => {
  await withTempDirectory(async (directory) => {
    const database = new LocalDatabaseService();
    const currentProfile = profile();

    database.initialize({
      userDataPath: directory,
      appVersion: "0.5.0",
      profile: currentProfile
    });

    const service = new DiagnosticsService(database);
    const savedScreens = service.reportScreens([
      {
        screenKey: "home-screen",
        label: "Pantalla principal",
        status: "passed",
        message: "Controles disponibles.",
        details: { requiredElements: 5 }
      },
      {
        screenKey: "admin-screen",
        label: "Centro de control",
        status: "passed",
        message: "Panel disponible.",
        details: { requiredElements: 5 }
      }
    ]);

    assert.equal(savedScreens.length, 2);
    assert.equal(service.getScreenReports().length, 2);

    const result = service.run({
      appVersion: "0.5.0",
      profile: currentProfile,
      preferences: {
        friendlyName: "Computadora de Jefferson",
        textSize: "normal",
        highContrast: false,
        reducedMotion: false
      },
      windowState: {
        available: true,
        visible: true,
        focused: true,
        maximized: true
      }
    });

    assert.equal(result.overallStatus, "healthy");
    assert.equal(result.failedCount, 0);
    assert.ok(result.passedCount >= 7);

    const summary = service.getSummary();
    assert.equal(summary.latest.id, result.id);
    assert.equal(summary.recent.length, 1);
    assert.equal(summary.latest.checks.some((check) => check.area === "screen"), true);

    database.close();
  });
});
