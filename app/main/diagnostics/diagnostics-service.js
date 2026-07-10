/* =========================================================
Nombre completo: diagnostics-service.js
Ruta o ubicación: /app/main/diagnostics/diagnostics-service.js
Función o funciones:
- Recibir y validar reportes de pantallas enviados por la interfaz.
- Ejecutar un diagnóstico general de aplicación, perfil, base y preferencias.
- Guardar cada ejecución y sus comprobaciones en SQLite.
- Entregar el último resultado y el historial reciente al administrador.
========================================================= */

"use strict";

const crypto = require("node:crypto");

const VALID_STATUSES = new Set(["passed", "warning", "failed"]);
const VALID_AREAS = new Set(["application", "profile", "database", "preferences", "screen"]);
const MAX_REPORTS = 50;
const MAX_TEXT = 300;

function nowIso() {
  return new Date().toISOString();
}

function safeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, MAX_TEXT) || fallback;
}

function sanitizeDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output = {};

  for (const [key, item] of Object.entries(value).slice(0, 25)) {
    if (["string", "number", "boolean"].includes(typeof item) || item === null) {
      output[safeText(key, "detail")] = typeof item === "string" ? safeText(item) : item;
    }
  }

  return output;
}

function normalizeScreenReport(report) {
  const status = VALID_STATUSES.has(report?.status) ? report.status : "failed";

  return {
    screenKey: safeText(report?.screenKey, "unknown-screen").slice(0, 80),
    label: safeText(report?.label, "Pantalla sin nombre"),
    status,
    message: safeText(report?.message, "Sin información disponible."),
    details: sanitizeDetails(report?.details),
    reportedAt: nowIso()
  };
}

function makeCheck(area, checkKey, label, status, message, details = {}, durationMs = 0) {
  return {
    id: crypto.randomUUID(),
    area: VALID_AREAS.has(area) ? area : "application",
    checkKey: safeText(checkKey, "unknown-check").slice(0, 100),
    label: safeText(label, "Comprobación"),
    status: VALID_STATUSES.has(status) ? status : "failed",
    message: safeText(message, "Sin detalle."),
    details: sanitizeDetails(details),
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0))
  };
}

function overallStatus(checks) {
  if (checks.some((check) => check.status === "failed")) {
    return "error";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "healthy";
}

class DiagnosticsService {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  assertDatabaseReady() {
    this.databaseService.assertReady();
    return this.databaseService.database;
  }

  reportScreens(reports) {
    const database = this.assertDatabaseReady();
    const normalized = Array.isArray(reports)
      ? reports.slice(0, MAX_REPORTS).map(normalizeScreenReport)
      : [];
    const statement = database.prepare(
      `INSERT INTO screen_reports (
        screen_key, label, status, message, details_json, reported_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(screen_key) DO UPDATE SET
        label = excluded.label,
        status = excluded.status,
        message = excluded.message,
        details_json = excluded.details_json,
        reported_at = excluded.reported_at`
    );

    database.exec("BEGIN IMMEDIATE");

    try {
      for (const report of normalized) {
        statement.run(
          report.screenKey,
          report.label,
          report.status,
          report.message,
          JSON.stringify(report.details),
          report.reportedAt
        );
      }

      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // La transacción podría haberse cerrado automáticamente.
      }
      throw error;
    }

    return normalized;
  }

  getScreenReports() {
    const database = this.assertDatabaseReady();

    return database
      .prepare(
        `SELECT screen_key, label, status, message, details_json, reported_at
         FROM screen_reports
         ORDER BY label`
      )
      .all()
      .map((row) => ({
        screenKey: row.screen_key,
        label: row.label,
        status: row.status,
        message: row.message,
        details: JSON.parse(row.details_json || "{}"),
        reportedAt: row.reported_at
      }));
  }

  run({ appVersion, profile, preferences, windowState }) {
    const database = this.assertDatabaseReady();
    const startedAt = nowIso();
    const startedMs = Date.now();
    const checks = [];

    checks.push(
      makeCheck(
        "application",
        "main-window",
        "Ventana principal",
        windowState?.available ? "passed" : "failed",
        windowState?.available
          ? "La ventana principal está disponible y responde."
          : "La ventana principal no está disponible.",
        {
          visible: Boolean(windowState?.visible),
          focused: Boolean(windowState?.focused),
          maximized: Boolean(windowState?.maximized)
        }
      )
    );

    checks.push(
      makeCheck(
        "application",
        "app-version",
        "Versión de la aplicación",
        appVersion ? "passed" : "failed",
        appVersion ? `Versión instalada: ${appVersion}.` : "No se pudo identificar la versión.",
        { appVersion: appVersion || null }
      )
    );

    checks.push(
      makeCheck(
        "profile",
        "assigned-profile",
        "Perfil asignado",
        profile?.id && profile?.deviceId ? "passed" : "failed",
        profile?.id && profile?.deviceId
          ? `El equipo está asignado a ${profile.displayName}.`
          : "El equipo no tiene un perfil completo.",
        {
          profileId: profile?.id || null,
          deviceId: profile?.deviceId || null,
          channelId: profile?.channelId || null
        }
      )
    );

    checks.push(
      makeCheck(
        "preferences",
        "device-preferences",
        "Preferencias del equipo",
        preferences?.textSize && preferences?.friendlyName ? "passed" : "warning",
        preferences?.textSize && preferences?.friendlyName
          ? "La configuración visual está disponible."
          : "Se utilizarán valores visuales predeterminados.",
        {
          friendlyName: preferences?.friendlyName || null,
          textSize: preferences?.textSize || null,
          highContrast: Boolean(preferences?.highContrast),
          reducedMotion: Boolean(preferences?.reducedMotion)
        }
      )
    );

    const databaseStarted = Date.now();
    const databaseDiagnostic = this.databaseService.runDiagnostic();
    checks.push(
      makeCheck(
        "database",
        "sqlite-integrity",
        "Integridad de la base local",
        databaseDiagnostic.healthy
          ? "passed"
          : databaseDiagnostic.status === "warning"
            ? "warning"
            : "failed",
        databaseDiagnostic.healthy
          ? "La base local, sus tablas y claves foráneas funcionan correctamente."
          : databaseDiagnostic.error || "La base local requiere revisión.",
        {
          schemaVersion: databaseDiagnostic.schemaVersion || 0,
          tableCount: databaseDiagnostic.tables?.length || 0,
          missingTables: databaseDiagnostic.missingTables?.length || 0,
          foreignKeyIssues: databaseDiagnostic.foreignKeyIssues?.length || 0
        },
        Date.now() - databaseStarted
      )
    );

    const screenReports = this.getScreenReports();

    if (screenReports.length === 0) {
      checks.push(
        makeCheck(
          "screen",
          "renderer-report",
          "Pruebas de pantallas",
          "warning",
          "La interfaz todavía no ha enviado su reporte de pantallas."
        )
      );
    } else {
      for (const report of screenReports) {
        checks.push(
          makeCheck(
            "screen",
            report.screenKey,
            report.label,
            report.status,
            report.message,
            {
              ...report.details,
              reportedAt: report.reportedAt
            }
          )
        );
      }
    }

    const completedAt = nowIso();
    const runId = crypto.randomUUID();
    const summary = {
      id: runId,
      overallStatus: overallStatus(checks),
      passedCount: checks.filter((check) => check.status === "passed").length,
      warningCount: checks.filter((check) => check.status === "warning").length,
      failedCount: checks.filter((check) => check.status === "failed").length,
      durationMs: Math.max(0, Date.now() - startedMs),
      appVersion: appVersion || "unknown",
      startedAt,
      completedAt,
      deviceId: profile?.deviceId || null,
      checks
    };

    database.exec("BEGIN IMMEDIATE");

    try {
      database
        .prepare(
          `INSERT INTO diagnostic_runs (
            id, device_id, overall_status, passed_count, warning_count, failed_count,
            duration_ms, app_version, started_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          summary.id,
          summary.deviceId,
          summary.overallStatus,
          summary.passedCount,
          summary.warningCount,
          summary.failedCount,
          summary.durationMs,
          summary.appVersion,
          summary.startedAt,
          summary.completedAt
        );

      const insertCheck = database.prepare(
        `INSERT INTO diagnostic_checks (
          id, run_id, area, check_key, label, status, message,
          details_json, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const check of checks) {
        insertCheck.run(
          check.id,
          summary.id,
          check.area,
          check.checkKey,
          check.label,
          check.status,
          check.message,
          JSON.stringify(check.details),
          check.durationMs,
          completedAt
        );
      }

      database.exec("COMMIT");
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // La transacción podría haberse cerrado automáticamente.
      }
      throw error;
    }

    return summary;
  }

  getLatestRun() {
    const database = this.assertDatabaseReady();
    const run = database
      .prepare(
        `SELECT * FROM diagnostic_runs
         ORDER BY completed_at DESC
         LIMIT 1`
      )
      .get();

    if (!run) {
      return null;
    }

    const checks = database
      .prepare(
        `SELECT area, check_key, label, status, message, details_json, duration_ms, created_at
         FROM diagnostic_checks
         WHERE run_id = ?
         ORDER BY area, label`
      )
      .all(run.id)
      .map((check) => ({
        area: check.area,
        checkKey: check.check_key,
        label: check.label,
        status: check.status,
        message: check.message,
        details: JSON.parse(check.details_json || "{}"),
        durationMs: Number(check.duration_ms),
        createdAt: check.created_at
      }));

    return {
      id: run.id,
      deviceId: run.device_id,
      overallStatus: run.overall_status,
      passedCount: Number(run.passed_count),
      warningCount: Number(run.warning_count),
      failedCount: Number(run.failed_count),
      durationMs: Number(run.duration_ms),
      appVersion: run.app_version,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      checks
    };
  }

  getRecentRuns(limit = 10) {
    const database = this.assertDatabaseReady();
    const safeLimit = Math.max(1, Math.min(30, Number(limit) || 10));

    return database
      .prepare(
        `SELECT id, overall_status, passed_count, warning_count, failed_count,
                duration_ms, app_version, completed_at
         FROM diagnostic_runs
         ORDER BY completed_at DESC
         LIMIT ?`
      )
      .all(safeLimit)
      .map((run) => ({
        id: run.id,
        overallStatus: run.overall_status,
        passedCount: Number(run.passed_count),
        warningCount: Number(run.warning_count),
        failedCount: Number(run.failed_count),
        durationMs: Number(run.duration_ms),
        appVersion: run.app_version,
        completedAt: run.completed_at
      }));
  }

  getSummary() {
    return {
      latest: this.getLatestRun(),
      recent: this.getRecentRuns(10),
      screens: this.getScreenReports()
    };
  }
}

module.exports = {
  DiagnosticsService,
  makeCheck,
  normalizeScreenReport,
  overallStatus
};
