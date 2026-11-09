"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildTemplate, HEADERS, FIELDS } = require("../web/excel.js");

test("plantilla Excel .xlsx con código, costo y precio sin/con IVA",async()=>{
  assert.equal(HEADERS.length,11);
  assert.equal(FIELDS.length,11);
  const bytes=new Uint8Array(await buildTemplate().arrayBuffer());
  const view=new DataView(bytes.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);
  let p=0, files={};
  while(p+30<bytes.length&&view.getUint32(p,true)===0x04034b50){
    const comp=view.getUint32(p+18,true);
    const nameLen=view.getUint16(p+26,true),extraLen=view.getUint16(p+28,true);
    const name=new TextDecoder().decode(bytes.slice(p+30,p+30+nameLen));
    const start=p+30+nameLen+extraLen;
    files[name]=new TextDecoder().decode(bytes.slice(start,start+comp));
    p=start+comp;
  }
  const required=["[Content_Types].xml","xl/workbook.xml","xl/styles.xml",
    "xl/worksheets/sheet1.xml","xl/worksheets/sheet2.xml"];
  for(const file of required) assert.ok(files[file],file);
  assert.ok(files["xl/workbook.xml"].includes('name="PRODUCTOS"'));
  const sheet=files["xl/worksheets/sheet1.xml"];
  const xmlText=(t)=>t.replace(/&/g,"&amp;");
  for(const label of HEADERS) assert.ok(sheet.includes(xmlText(label)),label);
  assert.match(sheet,/<dataValidations count="2">/);
  assert.ok(files["xl/worksheets/sheet2.xml"].includes("INSTRUCCIONES"));
  assert.ok(files["xl/worksheets/sheet2.xml"].includes("Llena la hoja PRODUCTOS"));
  assert.deepEqual(HEADERS.slice(0,2),["Código","Producto"]);
  assert.deepEqual(HEADERS.slice(-2),["Precio sin IVA","Precio con IVA"]);
});

test("la plantilla está vacía de productos para no cargar ejemplos por accidente",async()=>{
  const bytes=new Uint8Array(await buildTemplate().arrayBuffer());
  const view=new DataView(bytes.buffer);
  let p=0,xml="";
  while(p+30<bytes.length&&view.getUint32(p,true)===0x04034b50){
    const n=view.getUint16(p+26,true),extra=view.getUint16(p+28,true);
    const name=new TextDecoder().decode(bytes.slice(p+30,p+30+n));
    const begin=p+30+n+extra, size=view.getUint32(p+18,true);
    if(name==="xl/worksheets/sheet1.xml")
      xml=new TextDecoder().decode(bytes.slice(begin,begin+size));
    p=begin+size;
  }
  assert.ok(xml.includes('<row r="1"'));
  assert.ok(!xml.includes('<row r="2"'));
});
