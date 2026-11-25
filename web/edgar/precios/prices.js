/* Edgar: consulta independiente, sin acciones de escritura ni credencial de edición. */
"use strict";
(() => {
  const V = window.NICOLE_VIEW;
  const root = document.getElementById("app");
  const apiUrl = String(window.ALMACEN_API_URL || "").trim().replace(/\/$/, "");
  const PAGE = 40;
  const CACHE = "edgar-precios-cache-v1", OPT_CACHE = "edgar-precios-options-v1";
  let options = { options: [], assigned: {}, suppliers: null }, sheetRows = [];
  let reading = false, suggesting = false;
  const state = { data:null, cards:[], online:false, loading:true, error:"", warning:"", query:"", category:"", limit:PAGE };
  const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const get = k => {try{return JSON.parse(localStorage.getItem(k)||"null")}catch{return null}};
  const put = (k,v) => {try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
  async function request(url,headers,body){
    const abort=new AbortController(), timer=setTimeout(()=>abort.abort(),15000);
    try {
      const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),cache:"no-store",signal:abort.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.error||data.message||"No se pudo consultar");
      return data;
    } finally{clearTimeout(timer)}
  }
  async function catalog(){
    if(!apiUrl)throw Error("La lista aún no está conectada");
    const data=await request(apiUrl,{"content-type":"application/json"},{action:"catalog"});
    if(!data.ok||!Array.isArray(data.products))throw Error(data.error||"Catálogo no disponible");
    return data;
  }
  async function variants(){
    if(!apiUrl)throw Error("La lista aún no está conectada");
    const data=await request(new URL("/rest/v1/rpc/family_option_list",apiUrl),{apikey:window.ALMACEN_PUBLIC_KEY,"content-type":"application/json"},{device:""});
    if(!Array.isArray(data.options)||!data.assigned||typeof data.assigned!=="object")throw Error("Presentaciones adicionales no disponibles");
    return {...data,suppliers:null};
  }
  function hasAmount(card) {
    return card.items.some(item =>
      [item.gross, item.referencePrice, item.cost, item.wholesale, item.meterPrice].some(Number.isFinite)
    );
  }
  function setData(data) {
    if(Array.isArray(data.legacy_references))sheetRows=data.legacy_references;
    state.data = data;
    state.cards = V.buildCards(data).filter(hasAmount);
    const existing = new Map(state.cards.filter(c => !c.brand).map(c => [c.name.trim().toLowerCase(), c]));
    const groups = new Map();
    for (const row of sheetRows) {
      const key = row.name.trim().toLowerCase();
      if (!key) continue;
      const current = existing.get(key);
      if (current?.items.some(item => item.label.trim().toLowerCase() === row.label.trim().toLowerCase())) continue;
      if (current) groups.set(key, current);
      if (!groups.has(key)) groups.set(key, {id: "sheet-" + groups.size, sheet: true, name: row.name, category: row.category, brand: "", photos: [], items: [], haystack: V.normalize(key)});
      const c = groups.get(key);
      c.items.push({label: row.label, gross: row.amount, cost: row.cost ?? null, referencePrice: row.referencePrice ?? null, net: null});
      c.haystack += " " + V.normalize(row.label + " " + row.category);
    }
    state.cards.push(...Array.from(groups.values()).filter(c => c.sheet && hasAmount(c)));
    // También permite ver opciones registradas para productos aún no presentes en el catálogo base.
    const existingKeys = new Map(state.cards.map(c => [V.normalize(c.name) + "|" + V.normalize(c.brand), c]));
    for (const option of options.options) {
      const key = V.normalize(option.product) + "|" + V.normalize(option.brand);
      if (!existingKeys.has(key)) {
        const c = { id: "option-" + option.id, name: option.product, brand: option.brand || "",
          category: option.category || "Otros", photos: [], items: [], haystack: "" };
        state.cards.push(c);
        existingKeys.set(key, c);
      }
    }
    for (const c of state.cards) {
      const matches = options.options.filter(o => V.normalize(o.product) === V.normalize(c.name) && V.normalize(o.brand) === V.normalize(c.brand));
      const originals = c.items;
      c.items = originals.filter(i => !matches.some(o => o.source_label && V.normalize(o.source_label) === V.normalize(i.label)));
      for (const i of c.items) i.supplier = options.assigned[i.id] || "";
      for (const o of matches) {
        const base = originals.find(i => o.source_label && V.normalize(i.label) === V.normalize(o.source_label));
        c.items.push({ ...o, optionId: o.id, referencePrice: base?.referencePrice, net: null });
      }
      c.items.sort((a,b) => a.label.localeCompare(b.label,"es") || (a.supplier || "").localeCompare(b.supplier || "","es"));
      c.haystack = V.normalize([c.name, c.brand, c.category, ...c.items.map(i => i.label + " " + (i.unit || "") + " " + (i.supplier || ""))].join(" "));
    }
    state.cards.sort((a,b) => a.name.localeCompare(b.name, "es"));
  }

  async function load(){
    if(reading)return;
    reading=true;state.error="";state.warning="";
    if(!state.data)render();
    try{
      const [main,extra]=await Promise.allSettled([catalog(),variants()]);
      if(extra.status==="fulfilled"){options=extra.value;put(OPT_CACHE,options)}
      else {options=get(OPT_CACHE)||options;state.warning="No se pudieron actualizar las presentaciones adicionales. Se muestran los datos oficiales disponibles y las opciones previamente guardadas, si existen."}
      if(main.status==="fulfilled"){
        state.online=true;
        setData(main.value);
        const {photos,...rest}=main.value;
        put(CACHE,{...rest,photos:[]});
      } else {
        state.online=false;state.error=String(main.reason?.message||main.reason||"Sin conexión");
        const saved=state.data||get(CACHE);
        if(saved?.products)setData(saved);
      }
    }catch(e){state.online=false;state.error=String(e.message||e)}
    finally{state.loading=false;reading=false;render()}
  }
  function render(){
    const active=document.activeElement?.id;
    const focused=document.getElementById("q");
    const caret=focused?.selectionStart;
    const results=V.search(state.cards,state.query,state.category);
    const cats=V.categories(state.cards);
    const ready=state.cards.length>0;
    root.innerHTML=header(ready)+'<main class="v-main">'+body(results,cats)+'</main>';
    if(active==="q"){const q=document.getElementById("q");q?.focus();if(q&&caret!=null)q.setSelectionRange(caret,caret)}
    if(active==="category-select")document.getElementById(active)?.focus();
  }
  function header(ready){
    return '<header class="v-top"><div class="v-brand"><img src="./assets/nicole-icon.svg" alt="" width="40" height="40"><div><strong>Nicole Encajes</strong><span>Edgar · Consulta de precios</span></div></div><div class="v-actions"><button class="v-mini" data-act="reload">Actualizar</button><button class="v-mini" data-act="pdf" '+(ready?'':'disabled')+'>PDF</button><button class="v-mini" data-act="xlsx" '+(ready?'':'disabled')+'>Excel</button></div></header>';
  }
  function body(results,cats){
    if(state.loading&&!state.data)return '<p class="v-empty" role="status">Cargando precios…</p>';
    if(!state.data)return '<section class="v-empty"><h2>No se pudo cargar la lista</h2><p>'+esc(state.error)+'</p><button class="v-btn" data-act="reload">Intentar de nuevo</button></section>';
    const notice=(!state.online?'<p class="v-offline" role="status">Sin conexión: mostrando la última lista guardada. <button class="v-link" data-act="reload">Reintentar</button></p>':'')+(state.warning?'<p class="v-offline" role="status">'+esc(state.warning)+'</p>':'');
    if(!state.cards.length)return notice+'<p class="v-empty">No hay productos con precios o costos registrados.</p>';
    return notice+'<div class="v-layout"><div class="v-results"><label class="v-search"><span aria-hidden="true">⌕</span><input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Buscar producto o marca" value="'+esc(state.query)+'" aria-label="Buscar producto">'+(state.query?'<button class="v-clear" data-act="clear" aria-label="Borrar búsqueda">✕</button>':'')+'</label>'+
      (suggesting&&state.query.trim()&&results.length?'<div class="v-suggestions" aria-label="Sugerencias">'+results.slice(0,8).map(c=>'<button class="v-chip" data-act="suggest" data-name="'+esc(c.name)+'">'+esc(c.name)+'</button>').join("")+'</div>':'')+
      '<p class="v-count">'+results.length+' de '+state.cards.length+' productos</p>'+
      (results.length?table(results.slice(0,state.limit)):'<p class="v-empty">No encontramos ese producto.</p>')+
      (results.length>state.limit?'<button class="v-btn v-more" data-act="more">Ver más productos</button>':'')+
      '</div><aside class="v-categories"><strong>Categorías</strong><nav aria-label="Categorías">'+["",...cats].map(c=>'<button class="v-chip '+(state.category===c?'on':'')+'" aria-pressed="'+(state.category===c)+'" data-act="cat" data-cat="'+esc(c)+'">'+esc(c||"Todos")+'</button>').join("")+'</nav><select aria-label="Filtrar por categoría" id="category-select">'+["",...cats].map(c=>'<option value="'+esc(c)+'" '+(c===state.category?'selected':'')+'>'+esc(c||"Todos")+'</option>').join("")+'</select></aside></div>';
  }
  function table(cards){
    const rows=cards.flatMap(c=>c.items.map(item=>{
      const reference=item.gross==null&&item.referencePrice!=null;
      const price=item.gross??item.referencePrice;
      const qty=item.quantity==null?(/^[0-9]+(?:[.,][0-9]+)?\s+.+$/.test(item.label)?item.label:"—"):[item.quantity,item.unit].filter(Boolean).join(" ");
      return '<tr><th scope="row">'+esc(c.name)+(c.brand?'<small>'+esc(c.brand)+'</small>':'')+'</th><td>'+esc(item.label)+'</td><td>'+esc(item.supplier||"—")+'</td><td>'+esc(qty)+'</td><td class="money">'+(item.cost==null?"—":V.money(item.cost))+(Number.isFinite(item.costMeter)?'<br><small>Costo/m: '+item.costMeter.toFixed(4)+'</small>':'')+(item.wholesale!=null?'<br><small>PXM: '+V.money(item.wholesale)+'</small>':'')+(Number.isFinite(item.meterPrice)?'<br><small>Precio/m: '+item.meterPrice.toFixed(4)+'</small>':'')+'</td><td class="money sale">'+(price==null?"—":V.money(price))+(reference?'<small>Referencia · unidad por confirmar</small>':'')+(item.net!=null?'<small>Sin IVA: '+V.money(item.net)+'</small>':'')+'</td></tr>';
    })).join("");
    return '<div class="table-scroll" role="region" aria-label="Tabla de precios" tabindex="0"><table class="catalog-table"><thead><tr>'+["Producto","Presentación","Proveedor","Cantidad","Costo de compra","Precio de venta"].map(h=>'<th scope="col">'+h+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function exportRows(){return V.rows(V.search(state.cards,state.query,state.category))}
  root.addEventListener("change",e=>{if(e.target.id==="category-select"){state.category=e.target.value;state.limit=PAGE;render()}});
  root.addEventListener("input",e=>{if(e.target.id==="q"){suggesting=true;state.query=e.target.value;state.limit=PAGE;render()}});
  root.addEventListener("click",e=>{
    const el=e.target.closest("[data-act]");if(!el)return;
    const stamp=new Date().toISOString().slice(0,10);
    switch(el.dataset.act){
      case "reload":load();break;
      case "suggest":suggesting=false;state.query=el.dataset.name;state.limit=PAGE;render();document.getElementById("q")?.focus();break;
      case "clear":suggesting=false;state.query="";state.limit=PAGE;render();document.getElementById("q")?.focus();break;
      case "cat":state.category=el.dataset.cat||"";state.limit=PAGE;render();break;
      case "more":state.limit+=PAGE;render();break;
      case "pdf":download(new Blob([V.buildPdf(exportRows(),"Actualizado: "+new Date().toLocaleDateString("es-EC"))],{type:"application/pdf"}),"Nicole_Encajes_Precios_"+stamp+".pdf");break;
      case "xlsx":download(window.NICOLE_EXCEL.buildPriceList(exportRows()),"Nicole_Encajes_Precios_"+stamp+".xlsx");break;
    }
  });
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
  window.setInterval(()=>{if(!document.hidden)load()},60000);
  load();
})();
