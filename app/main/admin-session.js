/* =========================================================
Nombre completo: admin-session.js
Ruta o ubicación: /app/main/admin-session.js
Función o funciones:
- Mantener la sesión administrativa únicamente en memoria.
- Cerrar la sesión automáticamente después de inactividad.
- Limitar intentos consecutivos de contraseña incorrecta.
- Informar el estado de bloqueo y tiempo restante de la sesión.
========================================================= */

"use strict";

const DEFAULT_SESSION_DURATION_MS = 15 * 60 * 1000;
const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCKOUT_DURATION_MS = 5 * 60 * 1000;

class AdminSessionManager {
  constructor(options = {}) {
    this.sessionDurationMs = options.sessionDurationMs || DEFAULT_SESSION_DURATION_MS;
    this.maxFailedAttempts = options.maxFailedAttempts || DEFAULT_MAX_FAILED_ATTEMPTS;
    this.lockoutDurationMs = options.lockoutDurationMs || DEFAULT_LOCKOUT_DURATION_MS;

    this.unlockedAt = null;
    this.expiresAt = null;
    this.failedAttempts = 0;
    this.lockedUntil = null;
  }

  normalizeExpiredState(now = Date.now()) {
    if (this.expiresAt && this.expiresAt <= now) {
      this.unlockedAt = null;
      this.expiresAt = null;
    }

    if (this.lockedUntil && this.lockedUntil <= now) {
      this.lockedUntil = null;
      this.failedAttempts = 0;
    }
  }

  isUnlocked(now = Date.now()) {
    this.normalizeExpiredState(now);
    return Boolean(this.expiresAt && this.expiresAt > now);
  }

  isLocked(now = Date.now()) {
    this.normalizeExpiredState(now);
    return Boolean(this.lockedUntil && this.lockedUntil > now);
  }

  registerSuccessfulLogin(now = Date.now()) {
    this.failedAttempts = 0;
    this.lockedUntil = null;
    this.unlockedAt = now;
    this.expiresAt = now + this.sessionDurationMs;
    return this.getStatus(now);
  }

  registerFailedLogin(now = Date.now()) {
    this.normalizeExpiredState(now);

    if (this.isLocked(now)) {
      return this.getStatus(now);
    }

    this.failedAttempts += 1;

    if (this.failedAttempts >= this.maxFailedAttempts) {
      this.lockedUntil = now + this.lockoutDurationMs;
      this.unlockedAt = null;
      this.expiresAt = null;
    }

    return this.getStatus(now);
  }

  touch(now = Date.now()) {
    if (!this.isUnlocked(now)) {
      return this.getStatus(now);
    }

    this.expiresAt = now + this.sessionDurationMs;
    return this.getStatus(now);
  }

  logout() {
    this.unlockedAt = null;
    this.expiresAt = null;
    return this.getStatus();
  }

  getStatus(now = Date.now()) {
    this.normalizeExpiredState(now);

    const locked = Boolean(this.lockedUntil && this.lockedUntil > now);
    const unlocked = Boolean(this.expiresAt && this.expiresAt > now);

    return {
      unlocked,
      unlockedAt: unlocked ? new Date(this.unlockedAt).toISOString() : null,
      expiresAt: unlocked ? new Date(this.expiresAt).toISOString() : null,
      locked,
      lockedUntil: locked ? new Date(this.lockedUntil).toISOString() : null,
      attemptsRemaining: locked
        ? 0
        : Math.max(0, this.maxFailedAttempts - this.failedAttempts),
      sessionDurationMinutes: Math.round(this.sessionDurationMs / 60000)
    };
  }
}

module.exports = {
  AdminSessionManager,
  DEFAULT_SESSION_DURATION_MS,
  DEFAULT_MAX_FAILED_ATTEMPTS,
  DEFAULT_LOCKOUT_DURATION_MS
};
