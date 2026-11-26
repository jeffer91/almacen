"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"../web"),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("La firma electrónica conserva los controles fiscales aunque la interfaz sea sencilla",()=>{
 const html=read("edgar/facturacion/index.html"),js=read("edgar/facturacion/invoices.js");
 for(const id of ["i-certificate","i-certificate-password","i-upload-certificate"])assert.match(html,new RegExp('id="'+id+'"[^>]* disabled'));
 assert.match(html,/Guardar y validar firma/);assert.doesNotMatch(html,/i-release-checks/);
 assert.match(html,/administrador\/diagnostico/);assert.match(js,/edgar_invoice_readiness/);
 assert.match(js,/r\.production_enabled===true&&r\.signer_ready===true&&r\.sri_ready===true&&r\.certificate_current===true/);
 assert.match(js,/Emisión aún no habilitada/);assert.doesNotMatch(js,/i-upload-certificate.*disabled\s*=\s*false/);
 assert.match(js,/No se pudo verificar la facturación/);
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const m of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.has(m[1]),m[1]);
});
test("Caja compacta conserva acciones y advertencias tributarias en ambas rutas",()=>{
 for(const p of ["ventas/index.html","edgar/ventas/index.html"]){const html=read(p);for(const id of ["saleForm","addLine","refreshCatalog","catalogStatus","saveSale","saveWhatsapp","saveInvoice","saleFiscalRows","saleFiscalConfirm"])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<details class="sale-tools">/);assert.match(html,/<details class="sale-fiscal-details">/);
 assert.match(html,/Borrador sin validez tributaria/);assert.match(html,/id="saleFiscalConfirm" required/);
 assert.equal(html.match(/<thead><tr>(.*?)<\/tr><\/thead>/)[1].match(/<th>/g).length,12);
 }
 assert.match(read("ventas/sales.js"),/edgar_sale_save/);
 assert.match(read("ventas/sales-communication.js"),/edgar_sale_invoice_draft/);
});
test("Administración avanzada se separa de los seis módulos comerciales",()=>{
 const html=read("edgar/index.html"),products=read("edgar/productos/products.js");
 assert.equal((html.match(/class="edgar-card"/g)||[]).length,6);
 assert.match(html,/Administración avanzada/);assert.match(products,/<details class="edgar-product-tools">/);
 for(const act of ["new-product","sync-sheet","pdf","xlsx"])assert.ok(products.includes('data-act="'+act+'"'));
 assert.match(products,/NICOLE_EDGAR_SESSION\?\.getToken\(\)/);
});