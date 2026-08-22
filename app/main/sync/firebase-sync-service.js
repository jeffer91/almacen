/* =========================================================
Nombre completo: firebase-sync-service.js
Ruta o ubicación: /app/main/sync/firebase-sync-service.js
Función:
- Extender la sincronización Firebase existente sin romper compatibilidad.
- Evitar escrituras de instantáneas cuando no hay cambios locales pendientes.
- Mantener una sola escritura por lote de cambios para reducir consumo Firestore.
- Paginar la descarga de instantáneas y fotografías para no perder datos remotos.
========================================================= */

"use strict";

const legacy = require("./firebase-sync-service-base");

class FirebaseSyncService extends legacy.FirebaseSyncService {
  pendingLocalChanges() {
    const row = this.database
      .prepare("SELECT COUNT(*) AS total FROM sync_queue WHERE completed_at IS NULL")
      .get();
    return Number(row?.total || 0);
  }

  async pushSnapshot(profile, appVersion) {
    const pending = this.pendingLocalChanges();
    if (pending === 0) {
      return { pushedRecords: 0, snapshot: null, skipped: true };
    }
    return super.pushSnapshot(profile, appVersion);
  }

  async fetchSnapshots() {
    const documents = [];
    let pageToken = null;
    do {
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const response = await this.fetch(`${this.listUrl()}${token}`, { method: "GET" });
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`Firebase rechazó la descarga (${response.status}). ${text.slice(0, 300)}`);
        error.code = "FIREBASE_PULL_FAILED";
        throw error;
      }
      const body = await response.json();
      documents.push(...(body.documents || []).map((document) => this.parseDocument(document)).filter(Boolean));
      pageToken = body.nextPageToken || null;
    } while (pageToken);
    return documents;
  }

  async fetchPhotoDocuments() {
    const documents = [];
    let pageToken = null;
    do {
      const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const response = await this.fetch(`${this.photoListUrl()}${token}`, { method: "GET" });
      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`Firebase rechazó la descarga de fotografías (${response.status}). ${text.slice(0, 300)}`);
        error.code = "FIREBASE_PHOTO_PULL_FAILED";
        throw error;
      }
      const body = await response.json();
      documents.push(...(body.documents || []).map((document) => this.parsePhotoDocument(document)).filter(Boolean));
      pageToken = body.nextPageToken || null;
    } while (pageToken);
    return documents;
  }
}

module.exports = {
  ...legacy,
  FirebaseSyncService
};
