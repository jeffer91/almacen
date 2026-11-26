/* Nicole Encajes · ventas diarias. Sesión comercial validada. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const url = String(window.ALMACEN_API_URL || "").replace(/\/$/, "");
  let sales = [], catalog = [], catalogVersion = 0;
  const money = (n) => new Intl.NumberFormat("es-EC", {
    style: "currency", currency: "USD", minimumFractionDigits: 2
  }).format(Number(n) || 0);
  const unitMoney = n => new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(n));
  const inputPrice = n => Number(n).toFixed(4).replace(/(\.\d{2})0+$/,"$1");
  const localDate = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const get = (part) => parts.find((p) => p.type === part).value;
    return get("year") + "-" + get("month") + "-" + get("day");
  };
  async function api(action, fields = {}) {
    if (!url) throw new Error("La aplicación no está conectada a Supabase");
    const headers = { "content-type": "application/json" };
    if(action!=="catalog"){const token=window.NICOLE_EDGAR_SESSION?.getToken();if(!token)throw Error("Inicia sesión en el panel comercial");headers["x-almacen-key"]=token;}
    const res = await fetch(url, {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ action, ...fields })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
      if(res.status===401&&action!=="catalog")throw Error("Sesión vencida. Recarga la página e inicia sesión nuevamente.");
      throw new Error(body.error || "No se pudo contactar a Supabase");
    }
    return body;
  }
  function setMessage(id, message, success = false) {
    const el = $(id);
    el.textContent = message || "";
    el.className = success ? "good" : "error";
  }
  let batch = crypto.randomUUID(), saving = false, retryPayload = null;
  const rows = () => [...$("entryRows").rows];
  function updatePreview() {
    let total = 0;
    rows().forEach((row,i) => {
      row.cells[0].textContent = i+1;
      const amount = Math.round((Number(row.querySelector(".qty").value)*Number(row.querySelector(".price").value)+Number.EPSILON)*100)/100;
      row.querySelector(".line-total").textContent = money(amount);
      total += amount || 0;
      const price=row.querySelector(".price"), warning=row.querySelector(".cost-warning");
      const below=price.value!==""&&validPrice(row.comparableCost)&&Number(price.value)<Number(row.comparableCost);
      row.classList.toggle("below-cost",below);warning.hidden=!below;
      warning.textContent=below?"Menor al costo neto":"";
    });
    $("previewTotal").textContent = money(total);
  }
  function addLine() {
    const row = $("entryRows").insertRow();
    row.dataset.key = crypto.randomUUID();
    row.innerHTML = '<td></td><td><input class="product" maxlength="180" required placeholder="Producto" aria-label="Producto" autocomplete="off"><div class="product-matches" hidden></div><input class="detail" maxlength="100" placeholder="Detalle opcional" aria-label="Detalle"><select class="variant" aria-label="Presentación" hidden></select></td><td><input class="qty" type="number" min="0.001" max="1000000" step="0.001" value="1" required aria-label="Cantidad"></td><td><select class="unit" aria-label="Unidad"><option value="unidad">Unidad</option><option value="metro">Metro</option><option value="rollo">Rollo</option><option value="yarda">Yarda</option><option value="paquete">Paquete</option><option value="otro">Otro</option></select></td><td class="cost-cell"><span class="cost-value">—</span><small class="cost-basis" hidden></small></td><td><input class="price" type="number" min="0" max="1000000" step="0.0001" required placeholder="0.00" aria-label="Precio unitario"><select class="price-mode" aria-label="Tipo de precio" hidden></select><small class="cost-warning" role="status" hidden></small></td><td class="line-total">$0,00</td><td><select class="payment" aria-label="Pago"><option value="sin_especificar">Sin especificar</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></td><td><button type="button" class="remove-line">Quitar</button></td>';
    const product=row.querySelector(".product");
    product.addEventListener("input",()=>{row.selectedCard=null;matchProduct(row);suggest(row);});
    product.addEventListener("focus",()=>suggest(row));
    product.addEventListener("keydown",e=>{if(e.key==="Escape"){row.querySelector(".product-matches").hidden=true;}if(e.key==="ArrowDown"){const first=row.querySelector(".product-matches button");if(first){e.preventDefault();first.focus();}}});
    row.addEventListener("focusout",e=>{if(!row.contains(e.relatedTarget))row.querySelector(".product-matches").hidden=true;});
    row.querySelector(".variant").addEventListener("change",()=>chooseVariant(row));
    row.querySelector(".price-mode").addEventListener("change",()=>choosePrice(row));
    row.querySelector(".unit").addEventListener("change",()=>{const expected=row.expectedUnit;const changed=expected&&expected!==row.querySelector(".unit").value;row.comparableCost=changed?null:row.baseComparableCost;if(changed){row.querySelector(".price").value="";row.querySelector(".price-mode").value="";setMessage("saleMessage","Cambiaste la unidad. Ingresa el precio correspondiente a esa unidad.");}renderCost(row);updatePreview();});
    row.querySelector(".remove-line").addEventListener("click",()=>{if(saving||retryPayload)return;row.remove();if(!rows().length)addLine();updatePreview();});
    updatePreview();
    return row;
  }
  function groupInfo(sale) {
    const match = /^\[venta:([a-f0-9-]{36})\] (.*)$/.exec(sale.notes || "");
    return match ? {key:match[1],label:match[2]} : {key:"legacy",label:"Registros anteriores"};
  }
  function renderSales() {
    $("count").textContent = String(sales.length);
    $("total").textContent = money(sales.reduce((sum, row) => sum + Number(row.total || 0), 0));
    $("empty").hidden = true;
    $("history").replaceChildren();
    const table = document.createElement("table");
    table.className = "invoice-table";
    const head = table.createTHead().insertRow();
    for (const label of ["N.º", "Producto / detalle", "Cantidad", "Unidad", "Precio unitario", "Importe", "Pago", "Acción"]) {
      const th = document.createElement("th");
      th.scope = "col"; th.textContent = label; head.append(th);
    }
    const body = table.createTBody();
    if (!sales.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 8; cell.className = "empty-row"; cell.textContent = "Sin ventas registradas"; }
    const groups = new Map();
    for (const sale of sales) { const g=groupInfo(sale); if(!groups.has(g.key))groups.set(g.key,{label:g.label,items:[]}); groups.get(g.key).items.push(sale); }
    for(const group of groups.values()){
      const heading=body.insertRow().insertCell();heading.colSpan=8;heading.className="group-heading";heading.textContent=group.label+" · "+money(group.items.reduce((n,x)=>n+Number(x.total||0),0));
      group.items.forEach((sale, index) => {
      const row = body.insertRow();
      row.insertCell().textContent = String(index + 1);
      const info = row.insertCell();
      const name = document.createElement("strong"); name.textContent = sale.product_name; info.append(name);
      for (const detail of [sale.presentation_label, groupInfo(sale).key === "legacy" ? sale.notes : ""]) {
        if (detail) { const small = document.createElement("small"); small.textContent = detail; info.append(small); }
      }
      row.insertCell().textContent = Number(sale.quantity).toLocaleString("es-EC", { maximumFractionDigits: 3 });
      row.insertCell().textContent = sale.unit;
      row.insertCell().textContent = new Intl.NumberFormat("es-EC", {style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(sale.unit_price));
      row.insertCell().textContent = money(sale.total);
      row.insertCell().textContent = sale.payment_method === "sin_especificar" ? "—" : sale.payment_method;
      const remove = document.createElement("button");
      remove.type = "button"; remove.textContent = "Anular";
      remove.setAttribute("aria-label", "Anular venta de " + sale.product_name);
      remove.addEventListener("click", () => voidSale(sale));
      row.insertCell().append(remove);
      });
    }
    const foot = table.createTFoot().insertRow();
    const label = foot.insertCell(); label.colSpan = 5; label.textContent = "TOTAL REGISTRADO";
    const amount = foot.insertCell(); amount.colSpan = 3; amount.textContent = money(sales.reduce((sum, row) => sum + Number(row.total || 0), 0));
    $("history").append(table);
  }
  async function loadSales() {
    const day = $("saleDate").value;
    setMessage("listError", "");
    $("reload").disabled = true;
    try {
      const data = await api("listSales", { sale_date: day });
      if ($("saleDate").value !== day) return;
      sales = data.sales || [];
      $("truncated").hidden = !data.truncated;
      renderSales();
    } catch (error) {
      setMessage("listError", error.message);
    } finally {
      $("reload").disabled = false;
    }
  }
  const normalize = x => window.NICOLE_VIEW.normalize(x);
  const displayName = c => [c.name,c.brand].filter(Boolean).join(" · ");
  const validPrice = n => n !== null && n !== undefined && n !== "" && Number.isFinite(Number(n)) && Number(n)>=0;
  function option(select,label,value) { const o = document.createElement("option");o.textContent=label;o.value=value;select.append(o);return o; }
  function matchProduct(row) {
    const q=normalize(row.querySelector(".product").value);
    const matches=catalog.filter(c=>normalize(displayName(c))===q || normalize(c.name)===q);
    const card=row.selectedCard||(matches.length===1&&!matches[0].smart?.conflict&&!matches[0].smart?.needs_review?matches[0]:null);
    if(row.catalogCard===card)return;
    row.catalogCard=card;row.catalogItem=null;
    const variant=row.querySelector(".variant"),mode=row.querySelector(".price-mode"),price=row.querySelector(".price");
    variant.replaceChildren();mode.replaceChildren();variant.hidden=true;mode.hidden=true;
    price.value="";row.querySelector(".detail").value="";row.querySelector(".detail").hidden=false;row.querySelector(".detail").readOnly=false;setCost(row,null,null,null);
    if(!card||!card.items.length){updatePreview();return;}
    row.querySelector(".detail").hidden=true;
    variant.hidden=false;option(variant,"Elegir presentación","");
    card.items.forEach((i,n)=>option(variant,[i.label,i.supplier].filter(Boolean).join(" · "),String(n)));
    if(card.items.length===1){variant.value="0";chooseVariant(row);variant.hidden=true;row.querySelector(".detail").hidden=false;row.querySelector(".detail").readOnly=true;}
    else updatePreview();
  }
  function suggest(row) {
    const input=row.querySelector(".product"), box=row.querySelector(".product-matches"), C=window.NICOLE_SALES_CATALOG;
    box.replaceChildren();box.hidden=true;
    if(saving||retryPayload||!input.value.trim()||row.selectedCard)return;
    let matches=C.rank(catalog,input.value,300);
    if(!matches.length)return;
    const q=C.canonical(input.value), categoryKey=x=>C.canonical(x).replace(/(?:es|s)$/,"");
    const exactFamily=[...new Set(matches.map(c=>c.smart?.category||c.category).filter(Boolean))].find(x=>categoryKey(x)===categoryKey(q));
    if(exactFamily)matches=matches.filter(c=>(c.smart?.category||c.category)===exactFamily);
    const controls=document.createElement("div");controls.className="smart-filters";
    const results=document.createElement("div");results.className="smart-results";
    const infoLine=document.createElement("small");infoLine.className="smart-count";
    const facets=[
      ["Familia",c=>c.smart?.category||c.category||"Otros"],
      ["Variedad",c=>c.smart?.variety||"Sin clasificar"],
      ["Proveedor",c=>c.smart?.provider||c.items[0]?.supplier||"Sin especificar"]
    ];
    const filters=facets.map(([label,get])=>{
      const select=document.createElement("select");select.setAttribute("aria-label",label);option(select,"Todos · "+label,"");
      [...new Set(matches.map(get))].sort((a,b)=>a.localeCompare(b,"es")).forEach(v=>option(select,v,v));
      controls.append(select);return {select,get};
    });
    if(exactFamily)filters[0].select.value=exactFamily;
    const sort=document.createElement("select");sort.setAttribute("aria-label","Ordenar productos");
    for(const [value,label] of [["size","Medida / nombre"],["price","Menor precio"],["cost","Menor costo"],["match","Coincidencia"]])option(sort,label,value);
    controls.append(sort);
    const amount=(c,kind)=>{const values=c.items.map(i=>kind==="cost"?i.cost:i.gross??i.referencePrice??i.meterPrice??i.wholesale).filter(validPrice).map(Number);return values.length?Math.min(...values):Infinity;};
    function draw(){
      let filtered=matches.filter(c=>filters.every(({select,get})=>!select.value||get(c)===select.value));
      if(sort.value==="size")filtered.sort((a,b)=>Number(a.smart?.size_value??Infinity)-Number(b.smart?.size_value??Infinity)||a.name.localeCompare(b.name,"es",{numeric:true}));
      if(sort.value==="price"||sort.value==="cost")filtered.sort((a,b)=>amount(a,sort.value)-amount(b,sort.value)||a.name.localeCompare(b.name,"es",{numeric:true}));
      results.replaceChildren();infoLine.textContent=filtered.length+" coincidencias"+(filtered.length>100?" · mostrando 100":"");
      for(const c of filtered.slice(0,100)){
        const button=document.createElement("button");button.type="button";
        const title=document.createElement("strong");title.textContent=displayName(c);
        const info=document.createElement("small"), smart=c.smart;
        const price=amount(c,"price"),cost=amount(c,"cost");
        info.textContent=[smart?.variety,smart?.provider&&smart.provider!=="Sin especificar"?smart.provider:"",c.items[0]?.label,Number.isFinite(price)?unitMoney(price):"Sin precio",Number.isFinite(cost)?"Costo "+unitMoney(cost):"Sin costo"].filter(Boolean).join(" · ");
        button.append(title,info);
        if(smart?.conflict||smart?.needs_review){const warning=document.createElement("small");warning.className="smart-warning";warning.textContent=smart.conflict?"Varias tarifas: comprobar antes de vender":"Datos por verificar";button.append(warning);}
        button.addEventListener("click",()=>{if((c.smart?.conflict||c.smart?.needs_review)&&!confirm("Los datos de este producto necesitan revisión. Verifica el costo, el precio y la unidad antes de vender. ¿Continuar?"))return;row.selectedCard=c;input.value=displayName(c);box.hidden=true;matchProduct(row);input.focus();});
        results.append(button);
      }
    }
    filters.forEach(({select})=>select.addEventListener("change",draw));sort.addEventListener("change",draw);
    box.append(controls,infoLine,results);draw();box.hidden=false;
  }
  async function excelReferences(){
    const endpoint=new URL("/functions/v1/excel-catalog",url);
    async function query(action,fields={}){
      const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...fields}),cache:"no-store"});
      const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||"Catálogo no disponible");return data;
    }
    try{
      const records=[];
      for(let offset=0;offset<20000;offset+=500){
        const {rows:part}=await query("smartRows",{offset});records.push(...part);if(part.length<500)break;
      }
      if(!records.length)throw Error("Catálogo inteligente vacío");
      return {cards:window.NICOLE_SALES_CATALOG.smartCards(records),records,smart:true};
    }catch(error){
      const {sheets}=await query("sheets");const all=[];
      for(let offset=0;offset<20000;offset+=500){const {rows:part}=await query("salesRows",{offset,limit:500});all.push(...part);if(part.length<500)break;}
      return {cards:window.NICOLE_SALES_CATALOG.excelCards(sheets,all),records:[],smart:false};
    }
  }
  function chooseVariant(row) {
    const variant=row.querySelector(".variant"),mode=row.querySelector(".price-mode"),price=row.querySelector(".price");
    const item=variant.value===""?null:row.catalogCard?.items[Number(variant.value)];
    row.catalogItem=item;mode.replaceChildren();price.value="";mode.hidden=!item;
    row.querySelector(".detail").value=item?String(item.label||""):"";
    if(!item){setCost(row,null,null,null);updatePreview();return;}
    option(mode,"Precio manual","");
    for(const [key,label] of [["gross","Normal"],["meterPrice","Por metro"],["wholesale","Mayorista"]]){
      if(validPrice(item[key]))option(mode,label,key);
    }
    if(!validPrice(item.gross)&&validPrice(item.referencePrice))option(mode,"Precio de lista","referencePrice");
    if(validPrice(item.gross))mode.value="gross";
    else if(validPrice(item.meterPrice))mode.value="meterPrice";
    else if(validPrice(item.wholesale))mode.value="wholesale";
    else if(validPrice(item.referencePrice))mode.value="referencePrice";
    mode.hidden=mode.options.length<=2;
    choosePrice(row);
  }
  function renderCost(row){
    const value=row.querySelector(".cost-value"),basis=row.querySelector(".cost-basis");
    value.textContent=validPrice(row.displayCost)?unitMoney(row.displayCost):"—";
    const uncertain=validPrice(row.displayCost)&&!validPrice(row.comparableCost);
    basis.hidden=!uncertain;basis.textContent=uncertain?"Base distinta o por confirmar":"";
  }
  function setCost(row,cost,comparable,unit){row.displayCost=cost;row.baseComparableCost=comparable;row.comparableCost=comparable;row.expectedUnit=unit;renderCost(row);}
  function choosePrice(row) {
    const key=row.querySelector(".price-mode").value,item=row.catalogItem,price=row.querySelector(".price");
    if(!item){price.value="";setCost(row,null,null,null);updatePreview();return;}
    if(key)price.value=inputPrice(item[key]);else price.value="";
    const unit=row.querySelector(".unit"), u=normalize(item.unit), label=normalize(item.label);
    if(item.saleUnit)unit.value=item.saleUnit;
    else if(key==="meterPrice")unit.value="metro";
    else if(/rollo/.test(label))unit.value="rollo";
    else if(/paquete|docena/.test(label)||(/^(u|unidad|unidades)$/.test(u)&&Number(item.quantity)>1))unit.value="paquete";
    else if(/^(m|metro|metros)$/.test(u))unit.value=Number(item.quantity)>1?"rollo":"metro";
    else if(/^(yd|yarda|yardas)$/.test(u))unit.value=Number(item.quantity)>1?"rollo":"yarda";
    else unit.value="unidad";
    let comparable=item.cost;
    if(row.catalogCard?.excel)comparable=item.comparableCost;
    else if(key==="meterPrice")comparable=item.costMeter??null;
    else if(key==="wholesale"||key==="referencePrice")comparable=null;
    const shown=validPrice(comparable)?comparable:item.cost;
    setCost(row,shown,comparable,unit.value);
    if(row.catalogCard?.excel&&(!item.saleUnit||item.saleUnit==="otro")){price.value="";row.querySelector(".price-mode").value="";setMessage("saleMessage","Unidad de tarifa por confirmar. Selecciona la unidad e ingresa el precio correcto.");}
    updatePreview();
  }
  async function loadProductNames() {
    const version=++catalogVersion;
    $("catalogStatus").textContent="Actualizando catálogo…";
    try {
      const [main,extra,excel]=await Promise.allSettled([api("catalog"),fetch(new URL("/rest/v1/rpc/family_option_list",url),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"content-type":"application/json"},body:JSON.stringify({device:""}),cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("Opciones no disponibles");const v=await r.json();if(!Array.isArray(v.options)||!v.assigned)throw Error("Opciones inválidas");return v;}),excelReferences()]);
      if(version!==catalogVersion)return;
      if(main.status!=="fulfilled")throw main.reason;
      catalog=window.NICOLE_SALES_CATALOG.build(main.value,extra.status==="fulfilled"?extra.value:undefined);
      const commercialCount=catalog.length;
      if(excel.status==="fulfilled"){catalog.push(...excel.value.cards);catalog=window.NICOLE_SALES_CATALOG.organize(catalog,excel.value.records);}
      const names=[...new Set(catalog.flatMap(c=>[displayName(c),normalize(displayName(c))]))].sort((a,b)=>a.localeCompare(b,"es"));
      const list=$("catalogSuggestions");list.replaceChildren();names.forEach(n=>option(list,n,n));
      $("catalogStatus").textContent=commercialCount+" comerciales · "+(excel.status==="fulfilled"?excel.value.cards.length+" productos adicionales"+(excel.value.smart?" · catálogo inteligente":" · modo de respaldo"):"Catálogo adicional no disponible")+(extra.status==="fulfilled"?"":" · opciones adicionales no disponibles");
      if(!saving&&!retryPayload)rows().forEach(row=>{if(row.querySelector(".product").value&&!row.querySelector(".price").value){matchProduct(row);if(document.activeElement===row.querySelector(".product"))suggest(row);}});
    } catch(error) {if(version===catalogVersion)$("catalogStatus").textContent="Catálogo no disponible: "+error.message+" · puedes registrar precios manualmente";}
  }
  async function voidSale(sale) {
    if (!confirm("¿Anular la venta de " + sale.product_name + " por " + money(sale.total) + "? La operación quedará en el historial de auditoría.")) return;
    try {
      await api("voidSale", { id: sale.id });
      await loadSales();
      setMessage("saleMessage", "Venta anulada correctamente.", true);
    } catch (error) {
      setMessage("listError", error.message);
    }
  }
  function exportCsv() {
    const csvCell = (v) => {
      let s = String(v ?? "");
      if (/^[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = [
      ["Fecha", "Cliente / referencia", "Grupo", "Producto", "Presentación", "Cantidad", "Unidad", "Precio unitario", "Total", "Forma de pago", "Observaciones"],
      ...sales.map((s) => [s.sale_date, groupInfo(s).label, groupInfo(s).key, s.product_name, s.presentation_label, s.quantity,
        s.unit, s.unit_price, s.total, s.payment_method, s.notes])
    ];
    const data = "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    const objectUrl = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "Nicole_Encajes_Ventas_" + $("saleDate").value + ".csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  $("saleDate").value = localDate();
  $("saleForm").addEventListener("input", updatePreview);
  $("addLine").addEventListener("click",()=>{if(!saving&&!retryPayload){if(rows().length>=100){setMessage("saleMessage","Máximo 100 productos por venta.");return;}addLine().querySelector(".product").focus();}});
  function lockDraft(lock) {
    for(const field of $("saleForm").querySelectorAll("input,select,button")) field.disabled=lock;
    $("saleDate").disabled=lock;
    $("saveSale").disabled=saving;
  }
  $("saleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if(saving)return;
    if(!retryPayload){
      const alias=$("customerAlias").value.trim();
      if(!alias){setMessage("saleMessage","Indica una referencia de cliente.");return;}
      if(rows().some(row=>row.catalogCard&&!row.catalogItem)){setMessage("saleMessage","Selecciona la presentación de cada producto.");return;}
      if(rows().some(row=>!validPrice(row.comparableCost))&&!confirm("Hay productos sin costo comparable. Verifica sus precios y unidades. ¿Guardar de todos modos?"))return;
      if(rows().some(row=>row.classList.contains("below-cost"))&&!confirm("Hay productos con precio de venta menor al costo neto registrado. ¿Guardar de todos modos?"))return;
      retryPayload=rows().map(row=>({
        sale_date:$("saleDate").value,product_name:row.querySelector(".product").value.trim(),
        presentation_label:row.querySelector(".detail").value.trim(),quantity:Number(row.querySelector(".qty").value),
        unit:row.querySelector(".unit").value,unit_price:Number(row.querySelector(".price").value),
        payment_method:row.querySelector(".payment").value,notes:"[venta:"+batch+"] "+alias,request_key:row.dataset.key
      }));
      if(retryPayload.some(x=>!x.product_name)){retryPayload=null;setMessage("saleMessage","Completa todos los productos.");return;}
    }
    saving=true;lockDraft(true);setMessage("saleMessage","Guardando venta…",true);
    try{
      await api("addSalesBatch",{rows:retryPayload});
      retryPayload=null;batch=crypto.randomUUID();$("customerAlias").value="";$("entryRows").replaceChildren();addLine();
      setMessage("saleMessage","Venta del cliente registrada.",true);
      await loadSales();
    }catch(error){
      setMessage("saleMessage","No se completó el guardado. Pulsa guardar de nuevo para reintentar sin duplicar: "+error.message);
      await loadSales();
    }finally{saving=false;lockDraft(Boolean(retryPayload));}
  });
  $("saleDate").addEventListener("change",()=>{sales=[];renderSales();loadSales();});
  addLine();
  $("reload").addEventListener("click", loadSales);
  $("refreshCatalog").addEventListener("click",loadProductNames);
  $("exportCsv").addEventListener("click", exportCsv);
  renderSales();
  Promise.all([loadSales(), loadProductNames()]);
  setInterval(()=>{if(!document.hidden&&!saving&&!retryPayload)loadProductNames();},120000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!saving&&!retryPayload)loadProductNames();});
  updatePreview();
})();