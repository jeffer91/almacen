"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("tres enlaces web independientes y despliegue GitHub Pages", () => {
  for (const person of ["edgar", "gloria", "jefferson"]) {
    const file = "web/" + person + "/index.html";
    assert.equal(fs.existsSync(path.join(root, file)), true);
    assert.ok(read(file).includes('data-profile="' + person + '"'));
  }
  assert.ok(fs.existsSync(path.join(root, ".github/workflows/web-deploy.yml")));
  assert.ok(fs.existsSync(path.join(root, "web/app.js")));
  assert.ok(fs.existsSync(path.join(root, "web/config.js")));
});

test("Electron conserva el instalador y usa la nueva web", () => {
  const builder = read("electron-builder.yml");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.main, "app/main/desktop.js");
  assert.equal(pkg.scripts.start, "electron .");
  assert.ok(pkg.scripts["start:legacy"].includes("ALMACEN_LEGACY=1"));
  assert.ok(builder.includes("  - app/**/*"));
  assert.ok(builder.includes("  - web/**/*"));
  assert.ok(builder.includes("target: nsis"));
  assert.ok(builder.includes("        - x64"));
  assert.ok(builder.includes("createDesktopShortcut: always"));
});

test("Supabase exige comprobación de permisos en servidor", () => {
  const sql = read("supabase/migrations/20261101_family_catalog.sql");
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public"));
  assert.ok(sql.includes("family_set_cost"));
  const edge = read("supabase/functions/catalog-api/index.ts");
  assert.ok(edge.includes("getRole(request)"));
  assert.ok(edge.includes('role !== "jefferson"'));
  assert.ok(edge.includes("family_prices"));
});
