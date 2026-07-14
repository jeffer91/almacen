/* =========================================================
Nombre completo: photo-storage-service.js
Ruta o ubicación: /app/main/catalog/photo-storage-service.js
Función o funciones:
- Seleccionar imágenes mediante Electron.
- Redimensionar y comprimir fotografías para almacenamiento y sincronización.
- Guardar archivos en una carpeta controlada por la aplicación.
- Calcular tamaño, dimensiones y checksum SHA-256.
Con qué se conecta:
- app/main/main.js
- app/main/catalog/catalog-service.js
- app/main/sync/firebase-sync-service.js
========================================================= */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ALLOWED_EXTENSIONS = Object.freeze([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_SYNC_BYTES = 520 * 1024;

class PhotoStorageService {
  constructor({ userDataPath, dialog, nativeImage }) {
    this.userDataPath = userDataPath;
    this.dialog = dialog;
    this.nativeImage = nativeImage;
  }

  get directory() {
    return path.join(this.userDataPath, "photos");
  }

  ensureDirectory() {
    fs.mkdirSync(this.directory, { recursive: true });
    return this.directory;
  }

  checksumBuffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  resizeToLimit(image, maxDimension) {
    const size = image.getSize();
    if (!size.width || !size.height || (size.width <= maxDimension && size.height <= maxDimension)) {
      return image;
    }
    const ratio = Math.min(maxDimension / size.width, maxDimension / size.height);
    return image.resize({
      width: Math.max(1, Math.round(size.width * ratio)),
      height: Math.max(1, Math.round(size.height * ratio)),
      quality: "good"
    });
  }

  compressedBuffer(sourcePath) {
    const source = this.nativeImage.createFromPath(sourcePath);
    if (source.isEmpty()) {
      const error = new Error("No se pudo leer la fotografía seleccionada.");
      error.code = "PHOTO_READ_FAILED";
      throw error;
    }

    let image = this.resizeToLimit(source, 1280);
    let buffer = image.toJPEG(82);
    if (buffer.length > MAX_SYNC_BYTES) buffer = image.toJPEG(65);
    if (buffer.length > MAX_SYNC_BYTES) {
      image = this.resizeToLimit(source, 960);
      buffer = image.toJPEG(58);
    }
    if (buffer.length > MAX_SYNC_BYTES) {
      image = this.resizeToLimit(source, 720);
      buffer = image.toJPEG(52);
    }

    if (!buffer.length || buffer.length > MAX_SYNC_BYTES) {
      const error = new Error("La fotografía no pudo reducirse a un tamaño seguro.");
      error.code = "PHOTO_TOO_LARGE";
      throw error;
    }

    return { image, buffer };
  }

  async chooseAndStore(browserWindow) {
    const result = await this.dialog.showOpenDialog(browserWindow, {
      title: "Seleccionar fotografía del producto",
      properties: ["openFile"],
      filters: [{ name: "Imágenes", extensions: ["jpg", "jpeg", "png", "webp"] }]
    });

    if (result.canceled || !result.filePaths?.[0]) return null;
    const sourcePath = result.filePaths[0];
    if (!ALLOWED_EXTENSIONS.includes(path.extname(sourcePath).toLowerCase())) {
      const error = new Error("La fotografía debe ser JPG, PNG o WEBP.");
      error.code = "PHOTO_TYPE_INVALID";
      throw error;
    }

    this.ensureDirectory();
    const prepared = this.compressedBuffer(sourcePath);
    const fileName = `${Date.now()}-${crypto.randomUUID()}.jpg`;
    const targetPath = path.join(this.directory, fileName);
    fs.writeFileSync(targetPath, prepared.buffer, { flag: "wx" });
    const size = prepared.image.getSize();

    return {
      localPath: targetPath,
      fileName,
      originalFileName: path.basename(sourcePath),
      mimeType: "image/jpeg",
      fileSizeBytes: prepared.buffer.length,
      widthPixels: Number(size.width) || null,
      heightPixels: Number(size.height) || null,
      checksumSha256: this.checksumBuffer(prepared.buffer),
      syncStatus: "metadata_pending"
    };
  }
}

module.exports = {
  ALLOWED_EXTENSIONS,
  MAX_SYNC_BYTES,
  PhotoStorageService
};
