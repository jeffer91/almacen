/* =========================================================
Nombre completo: admin-auth-store.js
Ruta o ubicación: /app/main/admin-auth-store.js
Función o funciones:
- Crear y guardar la contraseña administrativa de forma segura.
- Verificar la contraseña sin almacenar texto plano.
- Proteger el archivo local de credenciales mediante escritura atómica.
- Validar la integridad básica de la configuración administrativa.
========================================================= */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scryptAsync = promisify(crypto.scrypt);

const AUTH_VERSION = 1;
const FILE_NAME = "admin-auth.json";
const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 128;

function createAuthError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildFilePath(userDataPath) {
  return path.join(userDataPath, FILE_NAME);
}

function validatePassword(password) {
  if (typeof password !== "string") {
    throw createAuthError("INVALID_PASSWORD", "La contraseña no es válida.");
  }

  const length = Array.from(password).length;

  if (length < MIN_PASSWORD_LENGTH) {
    throw createAuthError(
      "PASSWORD_TOO_SHORT",
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    );
  }

  if (length > MAX_PASSWORD_LENGTH) {
    throw createAuthError(
      "PASSWORD_TOO_LONG",
      `La contraseña no puede superar ${MAX_PASSWORD_LENGTH} caracteres.`
    );
  }

  return password;
}

function isCredentialShapeValid(value) {
  return Boolean(
    value &&
      value.authVersion === AUTH_VERSION &&
      value.algorithm === "scrypt" &&
      typeof value.salt === "string" &&
      /^[a-f0-9]+$/i.test(value.salt) &&
      typeof value.passwordHash === "string" &&
      /^[a-f0-9]+$/i.test(value.passwordHash) &&
      typeof value.createdAt === "string" &&
      typeof value.updatedAt === "string"
  );
}

async function readCredential(userDataPath) {
  const filePath = buildFilePath(userDataPath);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const credential = JSON.parse(raw);

    if (!isCredentialShapeValid(credential)) {
      throw createAuthError(
        "AUTH_DATA_INVALID",
        "La configuración administrativa local está dañada o incompleta."
      );
    }

    return credential;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    if (error && error.code) {
      throw error;
    }

    throw createAuthError(
      "AUTH_DATA_INVALID",
      "No fue posible leer la configuración administrativa local."
    );
  }
}

async function isAdminConfigured(userDataPath) {
  return Boolean(await readCredential(userDataPath));
}

async function derivePasswordHash(password, saltHex) {
  const derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  return Buffer.from(derived);
}

async function createAdminCredential(userDataPath, password) {
  validatePassword(password);

  const existing = await readCredential(userDataPath);
  if (existing) {
    throw createAuthError(
      "AUTH_ALREADY_CONFIGURED",
      "La contraseña administrativa ya fue configurada en este equipo."
    );
  }

  await fs.mkdir(userDataPath, { recursive: true });

  const now = new Date().toISOString();
  const salt = crypto.randomBytes(24).toString("hex");
  const passwordHash = (await derivePasswordHash(password, salt)).toString("hex");

  const payload = {
    authVersion: AUTH_VERSION,
    algorithm: "scrypt",
    salt,
    passwordHash,
    createdAt: now,
    updatedAt: now
  };

  const filePath = buildFilePath(userDataPath);
  const temporaryPath = `${filePath}.tmp`;

  await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await fs.rename(temporaryPath, filePath);

  try {
    await fs.chmod(filePath, 0o600);
  } catch (error) {
    if (process.platform !== "win32") {
      console.warn("No fue posible ajustar los permisos del archivo administrativo:", error);
    }
  }

  return {
    configured: true,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt
  };
}

async function verifyAdminPassword(userDataPath, password) {
  if (typeof password !== "string" || password.length === 0) {
    return false;
  }

  const credential = await readCredential(userDataPath);
  if (!credential) {
    return false;
  }

  const expectedHash = Buffer.from(credential.passwordHash, "hex");
  const actualHash = await derivePasswordHash(password, credential.salt);

  if (expectedHash.length !== actualHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedHash, actualHash);
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  createAdminCredential,
  isAdminConfigured,
  readCredential,
  verifyAdminPassword
};
