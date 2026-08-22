/* Correcciones del importador. La implementación original se conserva en excel-import-service-base.js. */
"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const base = require("./excel-import-service-base");
const { normalizeName } = require("../catalog/catalog-service");
const { BackupService } = require("../backups/backup-service");

const normalizeLoose = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9%/]+/g, " ").trim();
const normalizeCode = (value) => String(value ?? "").trim().toLowerCase();
const priceWithTax = (value, rate = 15) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * (1 + rate / 100) * 100) / 100 : null;
};

function parseWorkbook(sheets) {
  const parsed = base.parseWorkbook(sheets);
  parsed.rows = parsed.rows.map((row) => {
    if (row.price !== null && typeof row.price !== "undefined") return row;
    if (row.priceWithoutTax === null || typeof row.priceWithoutTax === "undefined") return row;
    return { ...row, price: priceWithTax(row.priceWithoutTax), priceSource: "without_tax_converted" };
  });
  return parsed;
}

function uniqueNewName(baseName, row, database) {
  const suffixes = [row.code, row.presentation, row.category].filter(Boolean);
  for (const suffix of suffixes) {
    const candidate = `${baseName} - ${suffix}`.slice(0, 180);
    if (!database.prepare("SELECT id FROM products WHERE normalized_name = ? AND status <> 'retired'").get(normalizeName(candidate))) return candidate;
  }
  for (let number = 2; number <= 99; number += 1) {
    const candidate = `${baseName} (${number})`.slice(0, 180);
    if (!database.prepare("SELECT id FROM products WHERE normalized_name = ? AND status <> 'retired'").get(normalizeName(candidate))) return candidate;
  }
  const error = new Error(`No se pudo crear un nombre único para ${baseName}.`);
  error.code = "IMPORT_NAME_CONFLICT";
  throw error;
}

class ExcelImportService extends base.ExcelImportService {
  constructor(options) {
    super(options);
    this.backupService = options?.backupService || null;
  }

  assertNoPendingDuplicates() {
    if (!this.pendingDuplicates.size) return;
    const error = new Error(`Todavía tienes ${this.pendingDuplicates.size} posible(s) duplicado(s) por revisar. Resuélvelos antes de importar otro archivo.`);
    error.code = "IMPORT_DUPLICATES_PENDING";
    throw error;
  }

  async createPreImportBackup() {
    if (!this.backupService) {
      const databaseFile = this.databaseService.filePath;
      if (!databaseFile) {
        const error = new Error("No se pudo localizar la base local para crear el respaldo previo.");
        error.code = "IMPORT_BACKUP_UNAVAILABLE";
        throw error;
      }
      this.backupService = new BackupService({
        userDataPath: path.dirname(path.dirname(databaseFile)),
        databaseService: this.databaseService,
        appVersion: "pre-import"
      });
    }
    const backup = await this.backupService.create("automatic");
    if (backup?.healthy) return backup;
    const error = new Error("No se pudo verificar el respaldo previo a la importación.");
    error.code = "IMPORT_BACKUP_FAILED";
    throw error;
  }

  exactCandidates(row) {
    const normalizedName = normalizeName(row.name);
    const code = normalizeCode(row.code);
    return this.database.prepare(
      `SELECT p.id AS product_id, p.canonical_name, p.normalized_name,
              pv.id AS variant_id, pv.internal_code, pv.presentation
       FROM products p
       LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.status <> 'retired'
       WHERE p.status <> 'retired'
         AND (p.normalized_name = ? OR (? <> '' AND lower(COALESCE(pv.internal_code, '')) = ?))
       ORDER BY p.updated_at DESC LIMIT 30`
    ).all(normalizedName, code, code);
  }

  classifyMatch(row) {
    const exact = this.exactCandidates(row);
    const code = normalizeCode(row.code);
    const normalizedName = normalizeName(row.name);
    const codeMatches = code ? exact.filter((item) => normalizeCode(item.internal_code) === code) : [];
    const nameMatches = exact.filter((item) => item.normalized_name === normalizedName);

    if (codeMatches.length === 1) {
      const candidate = codeMatches[0];
      if (!nameMatches.some((item) => item.product_id !== candidate.product_id)) return { kind: "exact", candidate, score: 1, reason: "code" };
      return { kind: "ambiguous", candidates: exact, score: 1, reason: "code_name_conflict" };
    }
    if (codeMatches.length > 1) return { kind: "ambiguous", candidates: codeMatches, score: 1, reason: "duplicate_code" };

    const productIds = [...new Set(nameMatches.map((item) => item.product_id))];
    if (productIds.length === 1) {
      if (nameMatches.length === 1) return { kind: "exact", candidate: nameMatches[0], score: 1, reason: "name" };
      const presentation = normalizeLoose(row.presentation);
      if (presentation) {
        const matches = nameMatches.filter((item) => normalizeLoose(item.presentation) === presentation);
        if (matches.length === 1) return { kind: "exact", candidate: matches[0], score: 1, reason: "name_presentation" };
      }
      return { kind: "ambiguous", candidates: nameMatches, score: 1, reason: "multiple_variants" };
    }
    if (productIds.length > 1) return { kind: "ambiguous", candidates: nameMatches, score: 1, reason: "duplicate_name" };

    const fuzzy = super.candidateRows(row);
    if (!fuzzy.length) return { kind: "none", candidates: [], score: 0, reason: "new" };
    return { kind: "ambiguous", candidates: fuzzy, score: fuzzy[0].score, reason: "similar_name" };
  }

  updateExisting(row, candidate, context) {
    const current = this.simpleCatalogService.getRow(candidate.product_id, candidate.variant_id || null, context);
    if (!current) {
      const error = new Error(`No se pudo abrir el producto existente ${candidate.canonical_name}.`);
      error.code = "IMPORT_MATCH_NOT_FOUND";
      throw error;
    }
    return this.simpleCatalogService.updateRow({
      productId: candidate.product_id,
      variantId: candidate.variant_id || null,
      variantName: current.variantName || undefined,
      name: current.name || candidate.canonical_name,
      category: row.category || current.category,
      code: row.code || current.code,
      presentation: row.presentation || current.presentationRaw || current.presentation,
      unitName: row.unitName || current.unitName,
      quantityValue: row.quantityValue ?? current.quantityValue,
      cost: row.cost ?? current.cost,
      price: row.price ?? current.price,
      supplierName: row.supplierName || current.supplierName,
      supplierId: current.supplierId || null
    }, context);
  }

  publicDuplicate(entry) {
    return { ...super.publicDuplicate(entry), reason: entry.reason || null };
  }

  importRows(parsedInput, context, filePath, backup = null) {
    this.assertNoPendingDuplicates();
    const parsed = { ...parsedInput, rows: (parsedInput.rows || []).map((row) => row.price == null && row.priceWithoutTax != null ? { ...row, price: priceWithTax(row.priceWithoutTax), priceSource: "without_tax_converted" } : row) };
    const summary = {
      fileName: path.basename(filePath), backupFileName: backup?.fileName || null,
      totalRecognized: parsed.rows.length, imported: 0, created: 0, updated: 0,
      duplicates: 0, ignored: parsed.ignored.length, errors: 0, resolved: 0,
      errorRows: [], ignoredRows: parsed.ignored.slice(0, 80)
    };

    for (const row of parsed.rows) {
      try {
        const match = this.classifyMatch(row);
        if (match.kind === "exact") {
          this.updateExisting(row, match.candidate, context);
          summary.imported += 1;
          summary.updated += 1;
          continue;
        }
        if (match.kind === "ambiguous") {
          const best = match.candidates[0];
          const id = crypto.randomUUID();
          this.pendingDuplicates.set(id, {
            id, source: row, score: match.score, reason: match.reason,
            match: {
              productId: best.product_id, variantId: best.variant_id || null,
              name: best.canonical_name, code: best.internal_code || null,
              presentation: best.presentation || null
            }
          });
          summary.duplicates += 1;
          continue;
        }
        this.simpleCatalogService.createRow(row, context);
        summary.imported += 1;
        summary.created += 1;
      } catch (error) {
        summary.errors += 1;
        if (summary.errorRows.length < 80) summary.errorRows.push({ sheet: row.sourceSheet, row: row.sourceRow, name: row.name, message: error.message });
      }
    }
    this.lastSummary = summary;
    return { summary, duplicates: Array.from(this.pendingDuplicates.values()).map((entry) => this.publicDuplicate(entry)) };
  }

  async selectAndImport(parentWindow, context) {
    this.assertNoPendingDuplicates();
    const result = await this.dialog.showOpenDialog(parentWindow, {
      title: "Seleccionar Excel del almacén", buttonLabel: "Importar Excel", properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xls", "xlsx", "xlsm"] }, { name: "CSV", extensions: ["csv", "txt"] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return { cancelled: true, summary: null, duplicates: [] };
    const filePath = result.filePaths[0];
    const backup = await this.createPreImportBackup();
    const parsed = parseWorkbook(this.readWorkbook(filePath));
    return { cancelled: false, ...this.importRows(parsed, context, filePath, backup) };
  }

  resolveDuplicate(id, action, context) {
    const entry = this.pendingDuplicates.get(id);
    if (!entry) {
      const error = new Error("Ese posible duplicado ya fue resuelto o ya no está disponible.");
      error.code = "IMPORT_DUPLICATE_NOT_FOUND";
      throw error;
    }
    if (!["same", "new"].includes(action)) {
      const error = new Error("Selecciona Es el mismo o Crear nuevo.");
      error.code = "IMPORT_DUPLICATE_ACTION_INVALID";
      throw error;
    }

    if (action === "same") {
      this.updateExisting(entry.source, { product_id: entry.match.productId, variant_id: entry.match.variantId, canonical_name: entry.match.name }, context);
    } else {
      const source = { ...entry.source };
      if (this.database.prepare("SELECT id FROM products WHERE normalized_name = ? AND status <> 'retired'").get(normalizeName(source.name))) {
        source.name = uniqueNewName(source.name, source, this.database);
      }
      this.simpleCatalogService.createRow(source, context);
    }
    this.pendingDuplicates.delete(id);
    if (this.lastSummary) {
      this.lastSummary.resolved += 1;
      this.lastSummary.duplicates = this.pendingDuplicates.size;
      this.lastSummary.imported += 1;
      if (action === "new") this.lastSummary.created += 1;
      else this.lastSummary.updated += 1;
    }
    return { summary: this.lastSummary, duplicates: Array.from(this.pendingDuplicates.values()).map((item) => this.publicDuplicate(item)) };
  }
}

module.exports = { ...base, ExcelImportService, parseWorkbook, priceWithTax };
