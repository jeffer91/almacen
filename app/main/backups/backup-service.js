/* =========================================================
Nombre completo: backup-service.js
Ruta o ubicación: /app/main/backups/backup-service.js
Función o funciones:
- Crear respaldos consistentes de la base SQLite mediante VACUUM INTO.
- Generar respaldos automáticos y manuales con nombres seguros.
- Verificar integridad, tablas y versión de cada respaldo.
- Aplicar retención para evitar crecimiento ilimitado.
- Entregar un resumen administrativo de los respaldos locales.
========================================================= */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadDatabaseSync } = require("../database/connection");

const BACKUP_DIRECTORY = "backups";
const BACKUP_PREFIX = "almacen-familiar";
const AUTOMATIC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION = Object.freeze({ automatic: 10, manual: 20 });
const VALID_KINDS = new Set(["automatic", "manual"]);

function backupDirectory(userDataPath) {
  return path.join(userDataPath, BACKUP_DIRECTORY);
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function backupFileName(kind, date = new Date()) {
  if (!VALID_KINDS.has(kind)) {
    const error = new Error("El tipo de respaldo no es válido.");
    error.code = "BACKUP_KIND_INVALID";
    throw error;
  }

  return `${BACKUP_PREFIX}_${kind}_${timestampForFile(date)}_${crypto.randomUUID().slice(0, 8)}.sqlite3`;
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function parseBackupName(fileName) {
  const expression = new RegExp(
    `^${BACKUP_PREFIX}_(automatic|manual)_(.+)_([a-f0-9]{8})\\.sqlite3$`,
    "i"
  );
  const match = expression.exec(fileName);

  return match
    ? {
        kind: match[1].toLowerCase(),
        encodedTimestamp: match[2],
        shortId: match[3].toLowerCase()
      }
    : null;
}

function secureBackupPath(directory, fileName) {
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName) {
    const error = new Error("El archivo de respaldo solicitado no es válido.");
    error.code = "BACKUP_FILE_INVALID";
    throw error;
  }

  if (!parseBackupName(fileName)) {
    const error = new Error("El archivo no pertenece a los respaldos de la aplicación.");
    error.code = "BACKUP_FILE_INVALID";
    throw error;
  }

  return path.join(directory, fileName);
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

class BackupService {
  constructor({ userDataPath, databaseService, appVersion }) {
    this.userDataPath = userDataPath;
    this.databaseService = databaseService;
    this.appVersion = appVersion;
    this.directory = backupDirectory(userDataPath);
  }

  assertReady() {
    this.databaseService.assertReady();
  }

  async ensureDirectory() {
    await fs.mkdir(this.directory, { recursive: true });
    return this.directory;
  }

  async list() {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const backups = [];

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const parsed = parseBackupName(entry.name);
      if (!parsed) {
        continue;
      }

      const filePath = path.join(this.directory, entry.name);

      try {
        const stat = await fs.stat(filePath);
        backups.push({
          fileName: entry.name,
          kind: parsed.kind,
          sizeBytes: stat.size,
          createdAt: stat.birthtimeMs > 0 ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
          modifiedAt: stat.mtime.toISOString()
        });
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    }

    return backups.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  }

  async create(kind = "manual") {
    this.assertReady();
    await this.ensureDirectory();

    if (!VALID_KINDS.has(kind)) {
      const error = new Error("El tipo de respaldo no es válido.");
      error.code = "BACKUP_KIND_INVALID";
      throw error;
    }

    const startedAt = Date.now();
    const fileName = backupFileName(kind);
    const filePath = path.join(this.directory, fileName);

    try {
      this.databaseService.database.exec("PRAGMA wal_checkpoint(PASSIVE)");
      this.databaseService.database.exec(
        `VACUUM INTO '${escapeSqlLiteral(filePath)}'`
      );

      const verification = await this.verify(fileName);

      if (!verification.healthy) {
        await fs.rm(filePath, { force: true });
        const error = new Error("El respaldo fue creado, pero no superó la verificación de integridad.");
        error.code = "BACKUP_VERIFICATION_FAILED";
        throw error;
      }

      await this.applyRetention(kind);

      return {
        ...verification,
        kind,
        durationMs: Date.now() - startedAt,
        appVersion: this.appVersion
      };
    } catch (error) {
      await fs.rm(filePath, { force: true }).catch(() => {});
      error.code = error.code || "BACKUP_CREATE_FAILED";
      throw error;
    }
  }

  async verify(fileName) {
    await this.ensureDirectory();
    const filePath = secureBackupPath(this.directory, fileName);
    const stat = await fs.stat(filePath);
    const DatabaseSync = loadDatabaseSync();
    let database;

    try {
      database = new DatabaseSync(filePath, {
        open: true,
        readOnly: true,
        enableForeignKeyConstraints: true,
        enableDoubleQuotedStringLiterals: false,
        allowExtension: false,
        timeout: 5000
      });

      const quickCheck = database.prepare("PRAGMA quick_check").all().map((row) => ({ ...row }));
      const foreignKeyIssues = database
        .prepare("PRAGMA foreign_key_check")
        .all()
        .map((row) => ({ ...row }));
      const migration = database
        .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
        .get();
      const tableCount = database
        .prepare(
          `SELECT COUNT(*) AS total
           FROM sqlite_schema
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
        )
        .get();
      const quickCheckHealthy =
        quickCheck.length === 1 &&
        String(Object.values(quickCheck[0])[0]).toLowerCase() === "ok";
      const healthy = quickCheckHealthy && foreignKeyIssues.length === 0;

      return {
        fileName,
        healthy,
        status: healthy ? "healthy" : "error",
        sizeBytes: stat.size,
        createdAt: stat.birthtimeMs > 0 ? stat.birthtime.toISOString() : stat.mtime.toISOString(),
        verifiedAt: new Date().toISOString(),
        schemaVersion: Number(migration.version),
        tableCount: Number(tableCount.total),
        foreignKeyIssueCount: foreignKeyIssues.length,
        checksumSha256: await sha256File(filePath)
      };
    } catch (error) {
      return {
        fileName,
        healthy: false,
        status: "error",
        sizeBytes: stat.size,
        verifiedAt: new Date().toISOString(),
        error: error.message
      };
    } finally {
      try {
        database?.close();
      } catch {
        // El archivo se abrió solo para lectura y puede haberse cerrado por el error.
      }
    }
  }

  async applyRetention(kind) {
    const limit = RETENTION[kind];
    const backups = (await this.list()).filter((backup) => backup.kind === kind);
    const excess = backups.slice(limit);

    for (const backup of excess) {
      await fs.rm(secureBackupPath(this.directory, backup.fileName), { force: true });
    }

    return excess.length;
  }

  async maybeCreateAutomatic() {
    const backups = await this.list();
    const latest = backups.find((backup) => backup.kind === "automatic");

    if (latest) {
      const age = Date.now() - new Date(latest.modifiedAt).getTime();
      if (Number.isFinite(age) && age < AUTOMATIC_INTERVAL_MS) {
        return { created: false, reason: "recent_backup_exists", latest };
      }
    }

    const backup = await this.create("automatic");
    return { created: true, backup };
  }

  async getSummary() {
    const backups = await this.list();
    const latest = backups[0] || null;
    const automaticCount = backups.filter((backup) => backup.kind === "automatic").length;
    const manualCount = backups.filter((backup) => backup.kind === "manual").length;

    return {
      directory: this.directory,
      totalCount: backups.length,
      automaticCount,
      manualCount,
      latest,
      retention: { ...RETENTION },
      backups
    };
  }
}

module.exports = {
  AUTOMATIC_INTERVAL_MS,
  BACKUP_DIRECTORY,
  BACKUP_PREFIX,
  BackupService,
  RETENTION,
  backupDirectory,
  backupFileName,
  parseBackupName,
  secureBackupPath
};
