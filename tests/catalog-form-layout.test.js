"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("el formulario de producto no genera desplazamiento horizontal", () => {
  const css = read("app/renderer/styles/catalog-enhancements.css");

  assert.match(css, /\.catalog-dialog\s*\{[\s\S]*?width:\s*min\(900px,\s*calc\(100vw\s*-\s*32px\)\)/);
  assert.match(css, /\.catalog-dialog \.catalog-form\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.catalog-dialog \.catalog-form\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /\.catalog-dialog \.catalog-form-grid > \*\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.catalog-field-with-action\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
});

test("el formulario pasa a una sola columna en ventanas pequeñas", () => {
  const css = read("app/renderer/styles/catalog-enhancements.css");

  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.catalog-dialog \.catalog-form-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.catalog-field-with-action\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("las acciones del formulario permanecen visibles al desplazarse", () => {
  const css = read("app/renderer/styles/catalog-enhancements.css");

  assert.match(css, /\.catalog-dialog \.catalog-form > \.dialog-actions\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(css, /\.catalog-dialog \.catalog-form > \.dialog-actions\s*\{[\s\S]*?bottom:\s*0/);
});
