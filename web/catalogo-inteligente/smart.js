"use strict";
(()=>{
 const $=id=>document.getElementById(id), core=window.NICOLE_SALES_CATALOG, url=window.ALMACEN_API_URL;
 let records=[],page=0,current=null,loading=false;const limit=50;
 const money=n=>n==null?"—":new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD",maximumFractionDigits:4}).format(Number(n));
 function opt(el,label,value){const o=document.createElement("option");o.textContent=label;o.value=value;el.append(o);}
 async function request(endpoint,action,fields={},token=""){const headers={"content-type":"application/json"};if(token)headers["x-almacen-key"]=token;const r=await fetch(endpoint,{method:"POST",headers,cache:"no-store",body:JSON.stringify({action,...fields})});const d=await r.json();if(!r.ok||!d.ok){if(token&&(r.status===401||r.status===403))window.NICOLE_ADMIN.clear();throw Error(d.error||"Consulta fallida");}return d;}
 async function load(){
 if(loading)return;loading=true;$("status").textContent="Actualizando…";
 try{const all=[];for(let offset=0;offset<20000;offset+=500){const d=await request(new URL("/functions/v1/excel-catalog",url),"smartRows",{offset});all.push(...d.rows);if(d.rows.length<500)break;}
 records=all;const old=$("family").value;$("family").replaceChildren();opt($("family"),"Todas las familias","");[...new Set(records.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,"es")).forEach(x=>opt($("family"),x,x));if([...$("family").options].some(o=>o.value===old))$("family").value=old;draw();
 }catch(e){$("status").textContent=e.message;}finally{loading=false;}
 }
 function draw(){
 let list=records.filter(r=>(!$("family").value||r.category===$("family").value)&&(!$("review").value||($("review").value==="conflict"?r.conflict:r.needs_review||r.conflict)));
 const query=$("q").value.trim();if(query){const cards=list.map(r=>({name:r.original_name,haystack:r.search_text,smart:r}));list=core.rank(cards,query,records.length).map(x=>x.smart);}
 else list.sort((a,b)=>a.category.localeCompare(b.category,"es")||a.canonical_name.localeCompare(b.canonical_name,"es",{numeric:true}));
 page=Math.max(0,Math.min(page,Math.ceil(list.length/limit)-1));$("rows").replaceChildren();
 for(const r of list.slice(page*limit,(page+1)*limit)){const tr=$("rows").insertRow();for(const v of [r.original_name,r.category,r.variety,r.provider,r.presentation||"—",money(r.cost),(r.tariffs||[]).map(t=>money(t.value)).join(" / ")||"—",r.conflict?"Conflicto":r.needs_review?"Revisar":"Clasificado"]){tr.insertCell().textContent=v;}
 const b=document.createElement("button");b.type="button";b.textContent="Corregir";b.addEventListener("click",()=>edit(r));tr.insertCell().append(b);}
 $("status").textContent=list.length+" resultados · "+records.filter(r=>r.conflict).length+" registros con conflictos en el catálogo";$("page").textContent=(page+1)+" / "+Math.max(1,Math.ceil(list.length/limit));$("prev").disabled=page===0;$("next").disabled=(page+1)*limit>=list.length;
 }
 async function edit(r){try{const token=await window.NICOLE_ADMIN.getToken();const {categories}=await request(url,"smartCategories",{},token);current=r;$("category").replaceChildren();for(const c of [...new Set([...categories,r.category])].sort((a,b)=>a.localeCompare(b,"es")))opt($("category"),c,c);$("category").value=r.category;$("original").textContent=r.original_name;$("name").value=r.canonical_name;$("variety").value=r.variety;$("provider").value=r.provider;$("message").textContent="";$("editor").showModal();}catch(e){$("status").textContent=e.message;}}
 $("edit").addEventListener("submit",async e=>{e.preventDefault();if(!current)return;$("save").disabled=true;try{const token=await window.NICOLE_ADMIN.getToken();await request(url,"smartCorrect",{source_id:current.source_id,canonical_name:$("name").value,category:$("category").value,variety:$("variety").value,provider:$("provider").value},token);$("editor").close();await load();}catch(e){$("message").textContent=e.message;}finally{$("save").disabled=false;}});
 $("cancel").onclick=()=>$("editor").close();$("reload").onclick=load;$("prev").onclick=()=>{page--;draw();};$("next").onclick=()=>{page++;draw();};for(const id of ["q","family","review"])$(id).addEventListener(id==="q"?"input":"change",()=>{page=0;draw();});load();
})();