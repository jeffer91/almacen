"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const V = require("../web/viewer-core.js");
const excel = require("../web/excel.js");

const data = {
  products: [
    { id: "p1", name: "Encaje Chantilly", brand: "Nicole", category: "Encajes", active: true },
    { id: "p2", name: "Cinta satinada", brand: "Rosa", category: "Cintas", active: true },
    { id: "p3", name: "Botón nácar", brand: "", category: "Botones", active: true },
    { id: "p4", name: "Retirado", brand: "", category: "", active: false }
  ],
  presentations: [
    { id: "a", product_id: "p1", label: "Rollo", quantity: 10, unit: "metros", current_cost: 18 },
    { id: "b", product_id: "p1", label: "Metro", quantity: 1, unit: "metros" },
    { id: "c", product_id: "p2", label: "Pieza", quantity: 1, unit: "unidad" }
  ],
  prices: [
    { presentation_id: "a", shop: "jefferson", price: 25.5, updated_at: "2026-11-01" },
    { presentation_id: "b", shop: "jefferson", price: 3, updated_at: "2026-11-02" }
  ],
  iva_rate: 15,
  photos: [{ id: "f1", product_id: "p2", is_primary: true, created_at: "2026-11-01" }]
};

test("la lista familiar oculta productos retirados y ordena presentaciones", () => {
  const cards = V.buildCards(data);
  assert.deepEqual(cards.map((c) => c.id), ["p3", "p2", "p1"]);
  const encaje = cards.find((c) => c.id === "p1");
  assert.deepEqual(encaje.items.map((i) => [i.label, i.net, i.gross, i.cost]), [["Metro", 3, 3.45, null], ["Rollo", 25.5, 29.33, 18]]);
});

test("el buscador ignora tildes, mayúsculas y orden de palabras", () => {
  const cards = V.buildCards(data);
  assert.deepEqual(V.search(cards, "BOTON").map((c) => c.id), ["p3"]);
  assert.deepEqual(V.search(cards, "chantilly encaje").map((c) => c.id), ["p1"]);
  assert.deepEqual(V.search(cards, "metros").map((c) => c.id), ["p1"]);
  assert.deepEqual(V.search(cards, "", "Cintas").map((c) => c.id), ["p2"]);
  assert.equal(V.search(cards, "inexistente").length, 0);
});

test("fotos pendientes: máximo tres y se pueden saltar", () => {
  const cards = V.buildCards(data);
  const first = V.pendingPhotos(cards, [], 3);
  assert.equal(first.total, 2);
  assert.deepEqual(first.list.map((c) => c.id), ["p3", "p1"]);
  assert.deepEqual(V.pendingPhotos(cards, ["p3"], 3).list.map((c) => c.id), ["p1"]);
});

test("el PDF es válido y contiene la lista con tildes", () => {
  const rows = V.rows(V.buildCards(data));
  const bytes = V.buildPdf(rows, "Actualizado: 8/11/2026");
  const text = Buffer.from(bytes).toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /%%EOF$/);
  assert.match(text, /Encaje Chantilly/);
  assert.match(text, /\$25\.50/);
  assert.match(text, /\$29\.33/);
  assert.match(text, /\$18\.00/);
  assert.match(text, /Sin IVA/);
  assert.match(text, /Bot\\363n n\\341car/);
  const xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(xref, xref + 4), "xref");
});

test("el Excel de precios incluye costo y precios sin/con IVA, sin proveedores", async () => {
  const blob = excel.buildPriceList(V.rows(V.buildCards(data)));
  const text = Buffer.from(await blob.arrayBuffer()).toString("utf8");
  assert.match(text, /Precio/);
  assert.match(text, /Encaje Chantilly/);
  assert.match(text, /Costo/);
  assert.match(text, /Precio con IVA/);
  assert.match(text, /<v>29\.33<\/v>/);
  assert.doesNotMatch(text, /Proveedor/);
});

test("la web familiar no carga la app de escritura y los links viejos redirigen", () => {
  const web = path.join(__dirname, "..", "web");
  const index = fs.readFileSync(path.join(web, "index.html"), "utf8");
  assert.match(index, /viewer\.js/);
  assert.doesNotMatch(index, /app\.js/);
  for (const old of ["edgar", "gloria"]) {
    assert.match(fs.readFileSync(path.join(web, old, "index.html"), "utf8"), /url=\.\.\//);
  }
  const viewer = fs.readFileSync(path.join(web, "viewer.js"), "utf8");
  assert.doesNotMatch(viewer, /x-almacen-key|x-almacen-admin|setPrice|addProduct|setCost/);
});

test("app de administración: Guardar no cierra la ventana y hay gestión de fotos", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");
  assert.match(app, /classList\.contains\("modal-shade"\) && event\.target !== target/);
  assert.match(app, /headers\["x-almacen-key"\] = token/);
  assert.match(app, /request\("login"/);
  assert.doesNotMatch(app, /x-almacen-admin|activation-form/);
  for (const act of ["photo-primary", "photo-delete", "batch-confirm", "prices-export", "logout"]) assert.ok(app.includes(act), act);
  const api = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "catalog-api", "index.ts"), "utf8");
  assert.match(api, /action === "deletePhoto"/);
  assert.match(api, /storage\.from\("family-photos"\)\.remove/);
  assert.match(api, /return fail\("Ingresa tu PIN en la app de administración", 401\)/);
  assert.doesNotMatch(api, /x-almacen-admin/);
  assert.match(api, /failed >= 5/);
  assert.doesNotMatch(api + app, /5626/);
});
