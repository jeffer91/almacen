"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const read = (p) => readFileSync(join(__dirname, "..", p), "utf8");

test("Ambas rutas de ventas exigen sesión comercial", () => {
  const js = read("web/ventas/sales.js");
  for(const path of ["web/ventas/index.html","web/edgar/ventas/index.html"]){
    const html=read(path);
    assert.match(html,/id="edgar-protected" hidden/);
    assert.match(html,/id="edgar-pin-form"/);
    assert.match(html,/id="saleForm"/);
    assert.match(html,/id="saleDate"/);
  }
  assert.match(js,/NICOLE_EDGAR_SESSION/);
  assert.match(js,/"x-almacen-key"/);
  assert.match(js,/api\("listSales"/);
  assert.match(js,/comm\.rpc\("edgar_sale_save"/);
  assert.match(js,/api\("voidSale"/);
});
test("La API valida la sesión antes de cualquier operación de ventas", () => {
  const ts=read("supabase/functions/catalog-api/index.ts");
  assert.match(ts,/const salesAction = new Set\(\["listSales","addSale","addSalesBatch","voidSale","exportSalesBackup"\]\)/);
  assert.match(ts,/db\.rpc\("edgar_pin_validate"/);
  assert.match(ts,/if\(salesAction&&authenticatedRole!=="jefferson"&&!edgarSales\)return fail/);
  assert.match(ts,/const publicWeb = !authenticatedRole && action==="syncSnapshot"/);
  assert.match(ts,/db\.rpc\("family_add_sales_batch"/);
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
