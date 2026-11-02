"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {resolvePrice,summarizeCosts}=require("../web/pricing.js");
test("precio propio se mantiene aunque otro almacén actualice",()=>{
 const prices=[
  {presentation_id:"p",shop:"edgar",price:2.50,updated_at:"2026-01-01"},
  {presentation_id:"p",shop:"jefferson",price:2.75,updated_at:"2026-02-01"}
 ];
 assert.deepEqual(resolvePrice(prices,"p","edgar"),{price:2.5,inherited:false,from:"edgar"});
 assert.deepEqual(resolvePrice(prices,"p","gloria"),{price:2.75,inherited:true,from:"jefferson"});
});
test("sin precio propio se hereda el último registrado y un precio cero es válido",()=>{
 const prices=[
  {presentation_id:"p",shop:"gloria",price:0,updated_at:"2026-01-01"},
  {presentation_id:"p",shop:"edgar",price:1.2,updated_at:"2026-01-03"}
 ];
 assert.deepEqual(resolvePrice(prices,"p","jefferson"),{price:1.2,inherited:true,from:"edgar"});
 assert.deepEqual(resolvePrice(prices,"p","gloria"),{price:0,inherited:false,from:"gloria"});
 assert.equal(resolvePrice([],"p","edgar").price,null);
});
test("costo común resume máximo, mínimo y último por presentación",()=>{
 const entries=[
  {presentation_id:"p",cost:3,recorded_at:"2026-01-01"},
  {presentation_id:"p",cost:8,recorded_at:"2026-02-01"},
  {presentation_id:"p",cost:4,recorded_at:"2026-03-01"},
  {presentation_id:"otra",cost:50,recorded_at:"2026-05-01"}
 ];
 const s=summarizeCosts(entries,"p");
 assert.equal(s.latest.cost,4);
 assert.equal(s.lowest.cost,3);
 assert.equal(s.highest.cost,8);
 assert.equal(s.entries.length,3);
});
