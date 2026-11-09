"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("un solo link familiar en GitHub Pages y la app de Jefferson solo en Electron", () => {
  assert.ok(read("web/index.html").includes('data-profile="familia"'));
  assert.ok(read("web/jefferson/index.html").includes('data-profile="jefferson"'));
  for (const old of ["edgar", "gloria"]) assert.ok(read("web/" + old + "/index.html").includes("url=../"));
  const deploy = read(".github/workflows/web-deploy.yml");
  assert.ok(deploy.includes("rm -rf site/jefferson site/app.js site/admin-core.js"));
  assert.ok(fs.existsSync(path.join(root, "web/app.js")));
  assert.ok(fs.existsSync(path.join(root, "web/config.js")));
});

test("Electron conserva el instalador y usa la nueva web", () => {
  const builder = read("electron-builder.yml");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.main, "app/main/desktop.js");
  assert.equal(pkg.scripts.start, "electron .");
  assert.equal(pkg.scripts["start:legacy"], undefined);
  assert.ok(!fs.existsSync(path.join(root, "app/main/main.js")));
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
