/* =========================================================
Nombre completo: excel-import-service.js
Ruta o ubicación: /app/main/imports/excel-import-service.js
Función o funciones:
- Abrir archivos Excel desde Administración.
- Leer .xls y .xlsx usando Microsoft Excel en Windows, sin agregar dependencias npm.
- Interpretar hojas con encabezados variables y categorías por bloques.
- Importar automáticamente filas seguras y separar posibles duplicados para revisión.
========================================================= */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const { normalizeName } = require("../catalog/catalog-service");

const HEADER_ALIASES = Object.freeze({
  name: ["nombre", "producto", "articulo", "artículo", "descripcion", "descripción", "nombre y referencia", "detalle"],
  code: ["referencia", "ref", "codigo", "código", "cod"],
  presentation: ["presentacion", "presentación", "medida", "unidad", "empaque", "formato"],
  quantity: ["cantidad", "cant"],
  cost: ["costo", "coste", "compra", "precio compra"],
  price: ["p fin", "p/fin", "precio final", "pvp", "venta", "precio venta", "precio"],
  priceWithoutTax: ["sin iva", "s/iva", "sin i.v.a", "precio sin iva"],
  supplier: ["proveedor", "distribuidor"],
  category: ["categoria", "categoría", "familia", "grupo"]
});

const META_HEADING = /(nuevo|nuevos|precio|precios|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|20\d{2}|actualizado|actualización|lista)/i;
const PRESENTATION_WORDS = /\b(metro|metros|mts?|m\.?|rollo|rollos|pieza|piezas|unidad|unidades|ciento|docena|paquete|funda|caja|cono|yarda|yardas)\b/i;

function importError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function cleanCell(value) {
  if (value === null || typeof value === "undefined") return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLoose(value) {
  const text = cleanCell(value);
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value) {
  const text = cleanCell(value);
  if (!text) return null;
  let numeric = text.replace(/[^0-9,.-]/g, "");
  if (!numeric || numeric === "-" || numeric === "." || numeric === ",") return null;
  if (numeric.includes(",") && numeric.includes(".")) {
    if (numeric.lastIndexOf(",") > numeric.lastIndexOf(".")) {
      numeric = numeric.replace(/\./g, "").replace(",", ".");
    } else {
      numeric = numeric.replace(/,/g, "");
    }
  } else if (numeric.includes(",")) {
    numeric = numeric.replace(",", ".");
  }
  const amount = Number(numeric);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return null;
  return Math.round(amount * 100) / 100;
}

function aliasFor(value) {
  const normalized = normalizeLoose(value);
  if (!normalized) return null;
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalized === normalizeLoose(alias))) return key;
  }
  return null;
}

function detectHeader(cells) {
  const map = {};
  let hits = 0;
  cells.forEach((cell, index) => {
    const key = aliasFor(cell);
    if (key && typeof map[key] === "undefined") {
      map[key] = index;
      hits += 1;
    }
  });
  const strong = hits >= 2 && (typeof map.name !== "undefined" || typeof map.code !== "undefined");
  return { map, hits, strong };
}

function splitCodeAndName(value) {
  const text = cleanCell(value);
  if (!text) return { code: null, name: null };
  const match = text.match(/^([A-Za-z0-9][A-Za-z0-9._/-]{4,})\s+(.{3,})$/);
  if (!match) return { code: null, name: text };
  const codeCandidate = match[1];
  if (!/\d/.test(codeCandidate)) return { code: null, name: text };
  return { code: codeCandidate.replace(/[.,;:]$/, ""), name: cleanCell(match[2]) };
}

function parsePresentation(value) {
  const text = cleanCell(value);
  if (!text) return { presentation: null, unitName: null, quantityValue: null };
  const normalized = normalizeLoose(text);
  const quantityMatch = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(m|mt|mts|metro|metros|u|unidad|unidades|p|pieza|piezas|rollo|rollos)?\.?$/i);
  if (quantityMatch) {
    const quantityValue = Number(String(quantityMatch[1]).replace(",", "."));
    const unitRaw = normalizeLoose(quantityMatch[2] || "");
    let unitName = null;
    if (/^(m|mt|mts|metro|metros)$/.test(unitRaw)) unitName = "metro";
    else if (/^(u|unidad|unidades)$/.test(unitRaw)) unitName = "unidad";
    else if (/^(p|pieza|piezas)$/.test(unitRaw)) unitName = "pieza";
    else if (/^rollos?$/.test(unitRaw)) unitName = "rollo";
    return { presentation: text, unitName, quantityValue: Number.isFinite(quantityValue) ? quantityValue : null };
  }
  const word = normalized.match(PRESENTATION_WORDS);
  let unitName = null;
  if (word) {
    const token = normalizeLoose(word[1]);
    if (/^(m|mt|mts|metro|metros)$/.test(token)) unitName = "metro";
    else if (/^rollos?$/.test(token)) unitName = "rollo";
    else if (/^piezas?$/.test(token)) unitName = "pieza";
    else if (/^unidades?$/.test(token)) unitName = "unidad";
    else unitName = token;
  }
  return { presentation: text, unitName, quantityValue: null };
}

function isLikelyCategory(text) {
  const value = cleanCell(text);
  if (!value || value.length > 70 || META_HEADING.test(value)) return false;
  if (/[$=]/.test(value) || /^\d/.test(value)) return false;
  return value.split(/\s+/).length <= 6;
}

function mappedValue(cells, map, key) {
  const index = map[key];
  return typeof index === "number" ? cleanCell(cells[index]) : "";
}

function rowFromMap(cells, map, context) {
  let nameText = mappedValue(cells, map, "name");
  let code = mappedValue(cells, map, "code") || null;
  if (!nameText && code && cells.length > 1) {
    const textCandidate = cells.find((cell, index) => index !== map.code && cleanCell(cell) && parseMoney(cell) === null);
    nameText = cleanCell(textCandidate);
  }
  const split = splitCodeAndName(nameText);
  if (!code && split.code) code = split.code;
  const name = split.name || nameText;
  if (!name || aliasFor(name)) return null;

  const presentationText = mappedValue(cells, map, "presentation") || mappedValue(cells, map, "quantity");
  const parsedPresentation = parsePresentation(presentationText);
  const category = mappedValue(cells, map, "category") || context.category || null;
  const supplierName = mappedValue(cells, map, "supplier") || null;
  const cost = parseMoney(mappedValue(cells, map, "cost"));
  const price = parseMoney(mappedValue(cells, map, "price"));
  const priceWithoutTax = parseMoney(mappedValue(cells, map, "priceWithoutTax"));

  return {
    name,
    code,
    presentation: parsedPresentation.presentation,
    unitName: parsedPresentation.unitName,
    quantityValue: parsedPresentation.quantityValue,
    category,
    supplierName,
    cost,
    price,
    priceWithoutTax,
    sourceSheet: context.sheet,
    sourceRow: context.rowNumber,
    confidence: 1
  };
}

function inferRow(cells, context) {
  const nonEmpty = cells.map((cell, index) => ({ index, text: cleanCell(cell) })).filter((item) => item.text);
  if (nonEmpty.length < 2) return null;
  const textCells = nonEmpty.filter((item) => parseMoney(item.text) === null);
  const moneyCells = nonEmpty.filter((item) => parseMoney(item.text) !== null);
  if (!textCells.length || !moneyCells.length) return null;

  const primaryText = textCells.find((item) => !PRESENTATION_WORDS.test(item.text)) || textCells[0];
  if (!primaryText || META_HEADING.test(primaryText.text) || aliasFor(primaryText.text)) return null;
  const split = splitCodeAndName(primaryText.text);
  const presentationCandidate = textCells.find((item) => item.index !== primaryText.index && PRESENTATION_WORDS.test(item.text));
  const parsedPresentation = parsePresentation(presentationCandidate?.text || "");
  const orderedMoney = moneyCells.map((item) => parseMoney(item.text)).filter((value) => value !== null);
  if (!orderedMoney.length) return null;

  return {
    name: split.name,
    code: split.code,
    presentation: parsedPresentation.presentation,
    unitName: parsedPresentation.unitName,
    quantityValue: parsedPresentation.quantityValue,
    category: context.category || null,
    supplierName: null,
    cost: orderedMoney.length >= 2 ? orderedMoney[0] : null,
    price: orderedMoney.length >= 2 ? orderedMoney[orderedMoney.length - 1] : orderedMoney[0],
    priceWithoutTax: null,
    sourceSheet: context.sheet,
    sourceRow: context.rowNumber,
    confidence: orderedMoney.length >= 2 ? 0.72 : 0.58
  };
}

function parseWorkbook(sheets) {
  const rows = [];
  const ignored = [];
  for (const sheet of sheets || []) {
    let currentMap = null;
    let category = null;
    const sheetRows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    sheetRows.forEach((rawRow, rowIndex) => {
      const cells = (Array.isArray(rawRow) ? rawRow : []).map(cleanCell);
      const nonEmpty = cells.filter(Boolean);
      if (!nonEmpty.length) return;
      const header = detectHeader(cells);
      if (header.strong) {
        currentMap = header.map;
        return;
      }
      if (nonEmpty.length === 1) {
        if (isLikelyCategory(nonEmpty[0])) category = nonEmpty[0];
        else ignored.push({ sheet: sheet.name, row: rowIndex + 1, text: nonEmpty[0], reason: "encabezado" });
        return;
      }
      const context = { sheet: sheet.name || "Hoja", rowNumber: rowIndex + 1, category };
      let parsed = currentMap ? rowFromMap(cells, currentMap, context) : null;
      if (!parsed) parsed = inferRow(cells, context);
      if (!parsed || !parsed.name || parsed.confidence < 0.7) {
        ignored.push({ sheet: context.sheet, row: context.rowNumber, text: nonEmpty.slice(0, 5).join(" | "), reason: "no reconocido" });
        return;
      }
      rows.push(parsed);
    });
  }
  return { rows, ignored };
}

function bigrams(value) {
  const normalized = normalizeLoose(value).replace(/\s/g, "");
  if (normalized.length < 2) return [normalized];
  const result = [];
  for (let index = 0; index < normalized.length - 1; index += 1) result.push(normalized.slice(index, index + 2));
  return result;
}

function similarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length || !right.length) return 0;
  const counts = new Map();
  left.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  let intersection = 0;
  right.forEach((item) => {
    const count = counts.get(item) || 0;
    if (count > 0) {
      intersection += 1;
      counts.set(item, count - 1);
    }
  });
  return (2 * intersection) / (left.length + right.length);
}

function uniqueNewName(baseName, row, database) {
  const suffixes = [row.code, row.presentation, row.category].filter(Boolean);
  for (const suffix of suffixes) {
    const candidate = `${baseName} - ${suffix}`.slice(0, 180);
    const exists = database.prepare("SELECT id FROM products WHERE normalized_name = ? AND status <> 'retired'").get(normalizeName(candidate));
    if (!exists) return candidate;
  }
  for (let number = 2; number <= 99; number += 1) {
    const candidate = `${baseName} (${number})`.slice(0, 180);
    const exists = database.prepare("SELECT id FROM products WHERE normalized_name = ? AND status <> 'retired'").get(normalizeName(candidate));
    if (!exists) return candidate;
  }
  throw importError("IMPORT_NAME_CONFLICT", `No se pudo crear un nombre único para ${baseName}.`);
}

class ExcelImportService {
  constructor({ databaseService, simpleCatalogService, dialog }) {
    this.databaseService = databaseService;
    this.simpleCatalogService = simpleCatalogService;
    this.dialog = dialog;
    this.pendingDuplicates = new Map();
    this.lastSummary = null;
  }

  get database() {
    this.databaseService.assertReady();
    return this.databaseService.database;
  }

  readCsv(filePath) {
    const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const delimiter = text.split(/\r?\n/, 1)[0]?.includes(";") ? ";" : ",";
    const rows = text.split(/\r?\n/).map((line) => {
      const cells = [];
      let current = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
          if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
          else quoted = !quoted;
        } else if (char === delimiter && !quoted) {
          cells.push(current); current = "";
        } else current += char;
      }
      cells.push(current);
      return cells;
    });
    return [{ name: path.basename(filePath), rows }];
  }

  readExcelWithCom(filePath) {
    if (process.platform !== "win32") {
      throw importError("EXCEL_WINDOWS_ONLY", "La importación de archivos .xls y .xlsx funciona en la aplicación instalada en Windows.");
    }
    const script = `
$ErrorActionPreference = 'Stop'
$excel = $null
$book = $null
try {
  $file = $env:ALMACEN_EXCEL_PATH
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $book = $excel.Workbooks.Open($file, 0, $true)
  $sheets = @()
  foreach ($sheet in $book.Worksheets) {
    $used = $sheet.UsedRange
    $rowCount = [Math]::Min([int]$used.Rows.Count, 20000)
    $colCount = [Math]::Min([int]$used.Columns.Count, 80)
    $rows = @()
    for ($r = 1; $r -le $rowCount; $r++) {
      $cells = @()
      for ($c = 1; $c -le $colCount; $c++) {
        $cells += [string]$used.Cells.Item($r, $c).Text
      }
      $rows += ,$cells
    }
    $sheets += [pscustomobject]@{ name = [string]$sheet.Name; rows = $rows }
  }
  $sheets | ConvertTo-Json -Depth 8 -Compress
} finally {
  if ($book -ne $null) { $book.Close($false) }
  if ($excel -ne $null) { $excel.Quit() }
  if ($book -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($book) }
  if ($excel -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, ALMACEN_EXCEL_PATH: filePath }
    });
    if (result.error) {
      throw importError("EXCEL_READ_FAILED", "No se pudo abrir Microsoft Excel para leer el archivo.", result.error);
    }
    if (result.status !== 0) {
      const detail = cleanCell(result.stderr).slice(0, 500);
      throw importError(
        "EXCEL_READ_FAILED",
        `No se pudo leer el Excel. Verifica que Microsoft Excel esté instalado y que el archivo no esté protegido.${detail ? ` ${detail}` : ""}`
      );
    }
    try {
      const parsed = JSON.parse(result.stdout || "[]");
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      throw importError("EXCEL_JSON_INVALID", "Excel respondió, pero no fue posible interpretar sus datos.", error);
    }
  }

  readWorkbook(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".csv" || extension === ".txt") return this.readCsv(filePath);
    if (extension === ".xls" || extension === ".xlsx" || extension === ".xlsm") return this.readExcelWithCom(filePath);
    throw importError("EXCEL_FORMAT_UNSUPPORTED", "Selecciona un archivo .xls, .xlsx, .xlsm o .csv.");
  }

  candidateRows(row) {
    const normalizedName = normalizeName(row.name);
    const code = cleanCell(row.code).toLowerCase();
    const direct = this.database.prepare(
      `SELECT p.id AS product_id, p.canonical_name, pv.id AS variant_id, pv.internal_code, pv.presentation
       FROM products p
       LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.status <> 'retired'
       WHERE p.status <> 'retired'
         AND (p.normalized_name = ? OR (? <> '' AND lower(COALESCE(pv.internal_code, '')) = ?))
       LIMIT 8`
    ).all(normalizedName, code, code);
    if (direct.length) return direct.map((item) => ({ ...item, score: 1 }));

    const all = this.database.prepare(
      `SELECT p.id AS product_id, p.canonical_name, pv.id AS variant_id, pv.internal_code, pv.presentation
       FROM products p
       LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.status <> 'retired'
       WHERE p.status <> 'retired'
       ORDER BY p.updated_at DESC
       LIMIT 3000`
    ).all();
    return all
      .map((item) => ({ ...item, score: similarity(row.name, item.canonical_name) }))
      .filter((item) => item.score >= 0.88)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  publicDuplicate(entry) {
    return {
      id: entry.id,
      source: entry.source,
      match: entry.match,
      score: entry.score
    };
  }

  importRows(parsed, context, filePath) {
    this.pendingDuplicates.clear();
    const summary = {
      fileName: path.basename(filePath),
      totalRecognized: parsed.rows.length,
      imported: 0,
      created: 0,
      duplicates: 0,
      ignored: parsed.ignored.length,
      errors: 0,
      resolved: 0,
      errorRows: [],
      ignoredRows: parsed.ignored.slice(0, 80)
    };

    for (const row of parsed.rows) {
      try {
        const candidates = this.candidateRows(row);
        if (candidates.length) {
          const best = candidates[0];
          const id = crypto.randomUUID();
          const entry = {
            id,
            source: row,
            match: {
              productId: best.product_id,
              variantId: best.variant_id || null,
              name: best.canonical_name,
              code: best.internal_code || null,
              presentation: best.presentation || null
            },
            score: best.score
          };
          this.pendingDuplicates.set(id, entry);
          summary.duplicates += 1;
          continue;
        }
        this.simpleCatalogService.createRow(row, context);
        summary.imported += 1;
        summary.created += 1;
      } catch (error) {
        summary.errors += 1;
        if (summary.errorRows.length < 80) {
          summary.errorRows.push({ sheet: row.sourceSheet, row: row.sourceRow, name: row.name, message: error.message });
        }
      }
    }
    this.lastSummary = summary;
    return {
      summary,
      duplicates: Array.from(this.pendingDuplicates.values()).map((entry) => this.publicDuplicate(entry))
    };
  }

  async selectAndImport(parentWindow, context) {
    const result = await this.dialog.showOpenDialog(parentWindow, {
      title: "Seleccionar Excel del almacén",
      buttonLabel: "Importar Excel",
      properties: ["openFile"],
      filters: [
        { name: "Excel", extensions: ["xls", "xlsx", "xlsm"] },
        { name: "CSV", extensions: ["csv", "txt"] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) return { cancelled: true, summary: null, duplicates: [] };
    const filePath = result.filePaths[0];
    const sheets = this.readWorkbook(filePath);
    const parsed = parseWorkbook(sheets);
    return { cancelled: false, ...this.importRows(parsed, context, filePath) };
  }

  resolveDuplicate(id, action, context) {
    const entry = this.pendingDuplicates.get(id);
    if (!entry) throw importError("IMPORT_DUPLICATE_NOT_FOUND", "Ese posible duplicado ya fue resuelto o ya no está disponible.");
    if (!["same", "new"].includes(action)) throw importError("IMPORT_DUPLICATE_ACTION_INVALID", "Selecciona Es el mismo o Crear nuevo.");

    if (action === "same") {
      const current = this.simpleCatalogService.getRow(entry.match.productId, entry.match.variantId, context);
      const payload = {
        productId: entry.match.productId,
        variantId: entry.match.variantId,
        name: current?.name || entry.match.name,
        category: current?.category || entry.source.category,
        code: entry.source.code || current?.code,
        presentation: entry.source.presentation || current?.presentationRaw || current?.presentation,
        unitName: entry.source.unitName || current?.unitName,
        quantityValue: entry.source.quantityValue || current?.quantityValue,
        cost: entry.source.cost ?? current?.cost,
        price: entry.source.price ?? current?.price,
        supplierName: entry.source.supplierName || current?.supplierName,
        supplierId: current?.supplierId || null
      };
      this.simpleCatalogService.updateRow(payload, context);
    } else {
      const source = { ...entry.source };
      const exactName = this.database.prepare("SELECT id FROM products WHERE normalized_name = ? AND status <> 'retired'").get(normalizeName(source.name));
      if (exactName) source.name = uniqueNewName(source.name, source, this.database);
      this.simpleCatalogService.createRow(source, context);
    }

    this.pendingDuplicates.delete(id);
    if (this.lastSummary) {
      this.lastSummary.resolved += 1;
      this.lastSummary.duplicates = this.pendingDuplicates.size;
      this.lastSummary.imported += 1;
      if (action === "new") this.lastSummary.created += 1;
    }
    return {
      summary: this.lastSummary,
      duplicates: Array.from(this.pendingDuplicates.values()).map((item) => this.publicDuplicate(item))
    };
  }
}

module.exports = {
  ExcelImportService,
  detectHeader,
  inferRow,
  parseMoney,
  parsePresentation,
  parseWorkbook,
  similarity,
  splitCodeAndName
};