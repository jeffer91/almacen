"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../web"),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("WhatsApp normaliza móviles de Ecuador y números internacionales explícitos",()=>{
 const w={};vm.runInNewContext(read("ventas/sales-communication.js"),{window:w});
 for(const [input,expected] of [["0991234567","593991234567"],["991234567","593991234567"],["+593 99 123 4567","593991234567"],["593991234567","593991234567"],["022123456",""],["12345678",""],["+1 202 555 0123","12025550123"]])assert.equal(w.NICOLE_SALE_COMM.phone(input),expected);
});
test("Ventas integra los clientes, las acciones por compra y la facturación sin exposición del costo",()=>{
 const js=read("ventas/sales.js"),comm=read("ventas/sales-communication.js");
 new vm.Script(js);new vm.Script(comm);new vm.Script(read("edgar/facturacion/invoices.js"));
 for(const p of ["ventas/index.html","edgar/ventas/index.html"]){
  const html=read(p);
  for(const id of ["saleCustomerSearch","saleCustomerDialog","saveWhatsapp","saveInvoice","saleReceiptImage","saleFiscalForm"])assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/>Facturas<\/a>/);
 }
 assert.match(js,/edgar_sale_save/);assert.match(js,/edgar_sale_statuses/);
 assert.match(comm,/edgar_sale_detail/);assert.match(comm,/edgar_sale_invoice_draft/);
 assert.match(comm,/Detalle comercial sin validez tributaria/);
 const image=comm.slice(comm.indexOf("async function image("),comm.indexOf("function invoiceLink"));
 assert.doesNotMatch(image,/\.cost\b|\.provider\b|\.profit\b/);
 assert.match(image,/image\/png/);
});

test("Ventas usa un único buscador de cliente e IVA fijo del 15%",()=>{
 const sales=read("ventas/sales.js"),comm=read("ventas/sales-communication.js");
 for(const p of ["ventas/index.html","edgar/ventas/index.html"]){
  const html=read(p);
  assert.match(html,/id="saleCustomerSearch"/);
  assert.doesNotMatch(html,/customerAlias|Cliente \/ referencia/);
 }
 assert.doesNotMatch(sales+comm,/customerAlias/);
 assert.match(sales,/retryCustomer=selectedCustomer\.id/);
 assert.match(comm,/saleCustomerSearch"\)\.value=c\?\.name/);
 assert.match(comm,/tr\.insertCell\(\)\.textContent="15 %"/);
 assert.match(comm,/id:tr\.dataset\.id,rate:15/);
});
