"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const read = (p) => fs.readFileSync(path.join(root,p),"utf8");

test("publica una web independiente para cada integrante", () => {
  for (const person of ["edgar","gloria","jefferson"]) {
    const file = "web/"+person+"/index.html";
    assert.equal(fs.existsSync(path.join(root,file)),true);
    assert.match(read(file),new RegExp('data-profile="'+person+'"'));
  }
  assert.ok(fs.existsSync(path.join(root,".github/workflows/web-deploy.yml")));
  assert.ok(fs.existsSync(path.join(root,"web/app.js")));
  assert.ok(fs.existsSync(path.join(root,"web/config.js")));
});

test("Electron conserva el instalador y utiliza la nueva interfaz compartida", () => {
  const builder = read("electron-builder.yml");
  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.main,"app/main/desktop.js");
  assert.match(packageJson.scripts.start,/electron \\./);
  assert.match(packageJson.scripts["start:legacy"],/ALMACEN_LEGACY=1/);
  assert.match(builder,/files:\\s*\\n\\s*- app\\/\\*\\*\\/\\*/);
  assert.match(builder,/- web\\/\\*\\*\\/\\*/);
  assert.match(builder,/target:\\s*\\n\\s*- target: nsis/);
  assert.match(builder,/arch:\\s*\\n\\s*- x64/);
  assert.match(builder,/createDesktopShortcut: always/);
});

test("Supabase evita escritura directa con llave pública", () => {
  const sql = read("supabase/migrations/20261101_family_catalog.sql");
  assert.match(sql,/enable row level security/);
  assert.match(sql,/revoke all on public/);
  assert.match(sql,/family_set_cost/);
  const edge = read("supabase/functions/catalog-api/index.ts");
  assert.match(edge,/getRole\\(request\\)/);
  assert.match(edge,/role !== "jefferson"/);
  assert.match(edge,/family_prices/);
});
