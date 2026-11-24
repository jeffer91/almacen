"use strict";
(function(scope){
const norm=v=>String(v??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
const shift=(day,n)=>{const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
function previous(from,to){return {from:shift(from,-(Math.round((Date.parse(to)-Date.parse(from))/86400000)+1)),to:shift(from,-1)}}
function analyze(rows,{from="",to="",unit="",search=""}={}){
const filtered=rows.filter(r=>(!from||r.sale_date>=from)&&(!to||r.sale_date<=to)&&(!unit||norm(r.unit)===unit)&&(!search||norm(r.product_name+" "+(r.presentation_label||"")).includes(norm(search))));
const active=filtered.filter(r=>!r.voided_at),products=new Map(),days=new Map(),payments=new Map(),units=new Map();let revenue=0;
for(const r of active){const amount=Math.round(Number(r.total||0)*100),q=Number(r.quantity)||0,u=norm(r.unit)||"sin unidad",name=String(r.product_name||"Sin nombre").trim(),key=norm(name);
revenue+=amount;let p=products.get(key);if(!p){p={name,revenue:0,records:0,units:Object.create(null)};products.set(key,p)}p.revenue+=amount;p.records++;p.units[u]=(p.units[u]||0)+q;
units.set(u,(units.get(u)||0)+q);let d=days.get(r.sale_date)||{date:r.sale_date,revenue:0,records:0};d.revenue+=amount;d.records++;days.set(r.sale_date,d);
const m=r.payment_method||"sin_especificar";payments.set(m,(payments.get(m)||0)+amount);
}
return {revenue,records:active.length,unique:products.size,average:active.length?Math.round(revenue/active.length):0,voided:filtered.length-active.length,products:[...products.values()].sort((a,b)=>b.revenue-a.revenue||b.records-a.records),days:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),payments:[...payments].sort((a,b)=>b[1]-a[1]),units:[...units].sort((a,b)=>a[0].localeCompare(b[0]))};
}
function csv(rows){return "\ufeff"+rows.map(row=>row.map(v=>{let s=String(v??"");if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(";")).join("\r\n")}
const api={analyze,shift,previous,csv};if(typeof module!=="undefined"&&module.exports)module.exports=api;if(scope)scope.NICOLE_ANALYTICS=api;
})(typeof window!=="undefined"?window:null);
