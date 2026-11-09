"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../web/admin-core.js");

const data = {
  products: [{ id: "p1", name: "Encaje Chantilly", brand: "Nicole", category: "Encajes", active: true }],
  presentations: [
    { id: "v1", product_id: "p1", label: "Metro", quantity: 1, unit: "metros", sku: "ENC-01", current_cost: 2 },
    { id: "v2", product_id: "p1", label: "Rollo", quantity: 25, unit: "metros", sku: null, current_cost: null }
  ],
  prices: [{ presentation_id: "v1", shop: "jefferson", price: 4 }],
  suppliers: []
};

test("IVA: con y sin IVA son exactos ida y vuelta", () => {
  assert.equal(A.withIva(10, 15), 11.5);
  assert.equal(A.withoutIva(10, 15), 8.6957);
  assert.equal(A.withIva(A.withoutIva(10, 15), 15), 10);
  assert.equal(A.withIva(null, 15), null);
  assert.equal(A.margin(4, 2), 50);
  assert.equal(A.margin(null, 2), null);
});

test("la carga clasifica nuevo, actualiza (por código o por nombre) y error", () => {
  const { rows, counts } = A.validateRows([
    { codigo: "ENC-01", producto: "Encaje Chantilly", marca: "Nicole", presentacion: "Metro", precio_sin_iva: "4.5" },
    { producto: "encaje chantilly", marca: "NICOLE", presentacion: "rollo", precio_con_iva: "11.50" },
    { producto: "Cinta raso", presentacion: "Pieza", cantidad: "", costo: "0.80" },
    { producto: "", presentacion: "Pieza" },
    { producto: "Hilo", presentacion: "Cono", precio_sin_iva: "10", precio_con_iva: "12" }
  ], data, 15);
  assert.deepEqual(rows.map((r) => r.status), ["actualiza", "actualiza", "nuevo", "error", "error"]);
  assert.deepEqual(counts, { total: 5, nuevo: 1, actualiza: 2, error: 2 });
  assert.equal(rows[1].payload.precio, 10);
  assert.equal(rows[2].payload.cantidad, 1);
  assert.equal(rows[2].payload.unidad, "unidad");
  assert.match(rows[4].errors[0], /no coinciden/);
});

test("la carga detecta códigos y filas repetidas dentro del mismo archivo", () => {
  const { rows } = A.validateRows([
    { codigo: "X1", producto: "A", presentacion: "Pieza" },
    { codigo: "x1", producto: "B", presentacion: "Pieza" },
    { producto: "A", presentacion: "pieza" }
  ], data, 15);
  assert.match(rows[1].errors.join(), /Código repetido/);
  assert.match(rows[2].errors.join(), /repetidos/);
});

test("tabla de precios globales con costo, sin IVA, con IVA y margen", () => {
  const rows = A.priceRows(data, 15);
  const metro = rows.find((r) => r.id === "v1");
  assert.deepEqual([metro.sku, metro.cost, metro.net, metro.gross, metro.margin], ["ENC-01", 2, 4, 4.6, 50]);
  assert.equal(rows.find((r) => r.id === "v2").net, null);
});

test("la migración no contiene el PIN y crea bloqueo, sesiones e importación por código", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261108_admin_phase1.sql"), "utf8");
  assert.doesNotMatch(sql, /5626/);
  for (const piece of ["family_admin_auth", "family_admin_sessions", "locked_until", "family_import_catalog_v2", "sku"]) assert.ok(sql.includes(piece), piece);
});
