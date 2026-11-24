"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const read = (p) => readFileSync(join(__dirname, "..", p), "utf8");

test("El registro de ventas es independiente del catálogo público", () => {
  const html = read("web/ventas/index.html");
  const js = read("web/ventas/sales.js");
  assert.doesNotMatch(html, /id="loginForm"/);
  assert.match(html, /id="saleForm"/);
  assert.match(html, /id="saleDate"/);
  assert.doesNotMatch(js, /api\("login"/);
  assert.match(js, /api\("listSales"/);
  assert.match(js, /api\("addSale"/);
  assert.match(js, /api\("voidSale"/);
  assert.doesNotMatch(js, /"x-almacen-key"/);
  assert.doesNotMatch(js, /localStorage\.|sessionStorage\./);
});

test("La API limita las operaciones públicas a una lista explícita", () => {
  const ts = read("supabase/functions/catalog-api/index.ts");
  assert.match(ts, /const publicWeb = !authenticatedRole && new Set\(\["listSales", "addSale", "voidSale", "exportSalesBackup", "syncSnapshot", "importExcel", "importPricesExcel"\]\)\.has\(action\)/);
  for (const action of ["listSales", "addSale", "voidSale"]) {
    const start = ts.indexOf('if (action === "' + action + '")');
    assert.ok(start >= 0, action + " debe existir");
    assert.match(ts.slice(start, start + 170), /role !== "jefferson"/);
  }
});

test("La tabla de ventas tiene control de acceso y total calculado", () => {
  const sql = read("supabase/migrations/20261120_daily_sales.sql");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all .* from public, anon, authenticated/i);
  assert.match(sql, /total numeric\(16,2\) generated always as/i);
  assert.match(sql, /request_key uuid unique/i);
});

test("El catálogo público contiene acceso a ventas", () => {
  assert.match(read("web/viewer.js"), /href="\.\/ventas\/"/);
  const deploy = read(".github/workflows/web-deploy.yml");
  assert.match(deploy, /cp -R web\/\. site\//);
  assert.doesNotMatch(deploy, /rm -rf site\/ventas/);
});
