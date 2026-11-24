"use strict";
(function(scope){
const norm=v=>String(v??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
const amount=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))&&Number(v)>=0;
const group=(v,label)=>norm(v)||label;
function summarize(data,{category="",search="",quality=""}={}){
const products=(data.products||[]).filter(p=>p.active!==false),ids=new Set(products.map(p=>p.id)),pres=new Map(),photos=new Map(),prices=new Set(),skus=new Map();
for(const r of data.prices||[])if(r.shop==="jefferson"&&amount(r.price))prices.add(r.presentation_id);
for(const r of data.presentations||[]){if(!ids.has(r.product_id))continue;if(!pres.has(r.product_id))pres.set(r.product_id,[]);pres.get(r.product_id).push(r);const key=norm(r.sku);if(key)skus.set(key,(skus.get(key)||0)+1)}
for(const r of data.photos||[])if(ids.has(r.product_id))photos.set(r.product_id,(photos.get(r.product_id)||0)+1);
const records=products.map(p=>{
const presentations=pres.get(p.id)||[],n=presentations.length,priced=presentations.filter(r=>prices.has(r.id)).length,costed=presentations.filter(r=>amount(r.current_cost)).length,sku=presentations.filter(r=>norm(r.sku)).length,duplicates=presentations.filter(r=>norm(r.sku)&&(skus.get(norm(r.sku))||0)>1).length,photoCount=photos.get(p.id)||0;
return {id:p.id,name:p.name||"Sin nombre",brand:String(p.brand||"").trim(),category:String(p.category||"").trim()||"Sin categoría",categoryKey:group(p.category,"__uncategorized__"),missingCategory:!norm(p.category),presentations:n,priced,costed,sku,duplicates,photos:photoCount,updated:p.updated_at||"",complete:n>0&&priced===n&&costed===n&&photoCount>0&&!!norm(p.category)}
});
const matches=r=>(!category||r.categoryKey===category)&&(!search||norm([r.name,r.brand,r.category].join(" ")).includes(norm(search)))&&(!quality||({noPhoto:!r.photos,noPrice:!r.presentations||r.priced<r.presentations,noCost:!r.presentations||r.costed<r.presentations,noPresentation:!r.presentations,noCategory:r.missingCategory,noSku:!r.presentations||r.sku<r.presentations,duplicateSku:r.duplicates>0,incomplete:!r.complete,complete:r.complete})[quality]);
const selected=records.filter(matches);
function totals(items){return {products:items.length,presentations:items.reduce((s,r)=>s+r.presentations,0),photos:items.reduce((s,r)=>s+r.photos,0),withPhoto:items.filter(r=>r.photos>0).length,withoutPhoto:items.filter(r=>!r.photos).length,priced:items.reduce((s,r)=>s+r.priced,0),costed:items.reduce((s,r)=>s+r.costed,0),withFullPrice:items.filter(r=>r.presentations&&r.priced===r.presentations).length,withFullCost:items.filter(r=>r.presentations&&r.costed===r.presentations).length,missingPrice:items.filter(r=>!r.presentations||r.priced<r.presentations).length,missingCost:items.filter(r=>!r.presentations||r.costed<r.presentations).length,missingPresentation:items.filter(r=>!r.presentations).length,missingCategory:items.filter(r=>r.missingCategory).length,missingSku:items.filter(r=>!r.presentations||r.sku<r.presentations).length,duplicateSku:items.filter(r=>r.duplicates>0).length,complete:items.filter(r=>r.complete).length,brands:new Set(items.map(r=>norm(r.brand)).filter(Boolean)).size}}
const categories=new Map(),allCategories=new Map(),brands=new Map();
for(const r of records){if(!allCategories.has(r.categoryKey))allCategories.set(r.categoryKey,r.category)}
for(const r of selected){if(!categories.has(r.categoryKey))categories.set(r.categoryKey,{name:allCategories.get(r.categoryKey),items:[]});categories.get(r.categoryKey).items.push(r);if(r.brand){const k=norm(r.brand);if(!brands.has(k))brands.set(k,{name:r.brand,count:0});brands.get(k).count++}}
const byCategory=[...categories].map(([key,x])=>({key,name:x.name,...totals(x.items)})).sort((a,b)=>b.products-a.products||a.name.localeCompare(b.name,"es"));
return {totals:totals(selected),all:totals(records),categoryCount:allCategories.size-(allCategories.has("__uncategorized__")?1:0),options:[...allCategories].sort((a,b)=>a[1].localeCompare(b[1],"es")),categories:byCategory,brands:[...brands.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,"es")),records:selected.sort((a,b)=>a.name.localeCompare(b.name,"es")),allRecords:records};
}
function salesByCategory(sales,records){const names=new Map(),groups=new Map();for(const r of records){let k=norm(r.name);if(!names.has(k))names.set(k,new Set());names.get(k).add(r.category)}
for(const r of sales||[]){if(r.voided_at)continue;const cats=names.get(norm(r.product_name));const name=!cats?"Sin coincidencia en catálogo":cats.size!==1?"Categoría ambigua":[...cats][0];let g=groups.get(name)||{name,records:0,revenue:0};g.records++;g.revenue+=Math.round(Number(r.total||0)*100);groups.set(name,g)}return [...groups.values()].sort((a,b)=>b.revenue-a.revenue)}
const api={summarize,salesByCategory};if(typeof module!=="undefined"&&module.exports)module.exports=api;if(scope)scope.NICOLE_CATALOG_ANALYTICS=api;
})(typeof window!=="undefined"?window:null);
