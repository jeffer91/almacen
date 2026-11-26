/* Nicole Encajes · ventas diarias. Acceso público sin PIN. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const url = String(window.ALMACEN_API_URL || "").replace(/\/$/, "");
  let sales = [], catalog = [], catalogVersion = 0;
  const money = (n) => new Intl.NumberFormat("es-EC", {
    style: "currency", currency: "USD", minimumFractionDigits: 2
  }).format(Number(n) || 0);
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
    const res = await fetch(url, {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ action, ...fields })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) {
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
    });
    $("previewTotal").textContent = money(total);
  }
  function addLine() {
    const row = $("entryRows").insertRow();
    row.dataset.key = crypto.randomUUID();
    row.innerHTML = '<td></td><td><input class="product" maxlength="180" required placeholder="Producto" aria-label="Producto" autocomplete="off"><div class="product-matches" hidden></div><input class="detail" maxlength="100" placeholder="Detalle opcional" aria-label="Detalle"><select class="variant" aria-label="Presentación" hidden></select></td><td><input class="qty" type="number" min="0.001" max="1000000" step="0.001" value="1" required aria-label="Cantidad"></td><td><select class="unit" aria-label="Unidad"><option value="unidad">Unidad</option><option value="metro">Metro</option><option value="rollo">Rollo</option><option value="yarda">Yarda</option><option value="paquete">Paquete</option><option value="otro">Otro</option></select></td><td><input class="price" type="number" min="0" max="1000000" step="0.0001" required placeholder="0.00" aria-label="Precio unitario"><select class="price-mode" aria-label="Tipo de precio" hidden></select></td><td class="line-total">$0,00</td><td><select class="payment" aria-label="Pago"><option value="sin_especificar">Sin especificar</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></td><td><button type="button" class="remove-line">Quitar</button></td>';
    const product=row.querySelector(".product");
    product.addEventListener("input",()=>{row.selectedCard=null;matchProduct(row);suggest(row);});
    product.addEventListener("focus",()=>suggest(row));
    product.addEventListener("keydown",e=>{if(e.key==="Escape"){row.querySelector(".product-matches").hidden=true;}if(e.key==="ArrowDown"){const first=row.querySelector(".product-matches button");if(first){e.preventDefault();first.focus();}}});
    row.addEventListener("focusout",e=>{if(!row.contains(e.relatedTarget))row.querySelector(".product-matches").hidden=true;});
    row.querySelector(".variant").addEventListener("change",()=>chooseVariant(row));
    row.querySelector(".price-mode").addEventListener("change",()=>choosePrice(row));
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
    const card=row.selectedCard||(matches.length===1?matches[0]:null);
    if(row.catalogCard===card)return;
    row.catalogCard=card;row.catalogItem=null;
    const variant=row.querySelector(".variant"),mode=row.querySelector(".price-mode"),price=row.querySelector(".price");
    variant.replaceChildren();mode.replaceChildren();variant.hidden=true;mode.hidden=true;
    price.value="";row.querySelector(".detail").value="";
    if(!card||!card.items.length){updatePreview();return;}
    variant.hidden=false;option(variant,"Elegir presentación","");
    card.items.forEach((i,n)=>option(variant,[i.label,i.supplier].filter(Boolean).join(" · "),String(n)));
    if(card.items.length===1){variant.value="0";chooseVariant(row);}
    else updatePreview();
  }
  function suggest(row) {
    const input=row.querySelector(".product"), box=row.querySelector(".product-matches");
    box.replaceChildren();box.hidden=true;
    if(saving||retryPayload||!input.value.trim()||row.selectedCard)return;
    const matches=window.NICOLE_SALES_CATALOG.rank(catalog,input.value,15);
    if(!matches.length)return;
    for(const c of matches){
      const button=document.createElement("button");button.type="button";
      const title=document.createElement("strong");title.textContent=displayName(c);
      const info=document.createElement("small");
      const prices=c.items.map(i=>i.gross??i.referencePrice??i.meterPrice??i.wholesale).filter(validPrice);
      const detail=c.items[0]?.label||"";
      info.textContent=(c.excel?"Excel · referencia":"Catálogo comercial")+(detail?" · "+detail:"")+(prices.length?" · "+money(Math.min(...prices))+(prices.length>1?" desde":""):" · Sin precio confirmado");
      button.append(title,info);
      button.addEventListener("click",()=>{row.selectedCard=c;input.value=displayName(c);box.hidden=true;matchProduct(row);input.focus();});
      box.append(button);
    }
    box.hidden=false;
  }
  async function excelReferences(){
    const endpoint=new URL("/functions/v1/excel-catalog",url);
    async function query(action,fields={}){
      const res=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...fields}),cache:"no-store"});
      const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||"Excel no disponible");return data;
    }
    const {sheets}=await query("sheets");
    const all=[];
    for(let offset=0;offset<20000;offset+=500){
      const {rows:part}=await query("salesRows",{offset,limit:500});all.push(...part);
      if(part.length<500)break;
    }
    return window.NICOLE_SALES_CATALOG.excelCards(sheets,all);
  }
  function chooseVariant(row) {
    const variant=row.querySelector(".variant"),mode=row.querySelector(".price-mode"),price=row.querySelector(".price");
    const item=variant.value===""?null:row.catalogCard?.items[Number(variant.value)];
    row.catalogItem=item;mode.replaceChildren();price.value="";mode.hidden=!item;
    row.querySelector(".detail").value=item?String(item.label||""):"";
    if(!item){updatePreview();return;}
    option(mode,"Precio manual","");
    for(const [key,label] of [["gross","Normal"],["meterPrice","Por metro"],["wholesale","Mayorista"]]){
      if(validPrice(item[key]))option(mode,label+" · $"+Number(item[key]).toFixed(4).replace(/0{1,2}$/,""),key);
    }
    if(!validPrice(item.gross)&&validPrice(item.referencePrice))option(mode,"Referencia (confirmar unidad) · $"+Number(item.referencePrice),"referencePrice");
    if(validPrice(item.gross))mode.value="gross";
    else if(validPrice(item.meterPrice))mode.value="meterPrice";
    else if(validPrice(item.wholesale))mode.value="wholesale";
    else if(validPrice(item.referencePrice))mode.value="referencePrice";
    choosePrice(row);
  }
  function choosePrice(row) {
    const key=row.querySelector(".price-mode").value,item=row.catalogItem,price=row.querySelector(".price");
    if(!key||!item){price.value="";updatePreview();return;}
    if(key==="referencePrice"&&!confirm("Precio de referencia: confirma que corresponde a la unidad que vendes.")){row.querySelector(".price-mode").value="";price.value="";updatePreview();return;}
    price.value=Number(item[key]).toFixed(4);
    const unit=row.querySelector(".unit");
    if(key==="meterPrice")unit.value="metro";
    else {const u=normalize(item.unit);unit.value=/^(m|metro|metros)$/.test(u)&&Number(item.quantity)===1?"metro":/^(yd|yarda|yardas)$/.test(u)&&Number(item.quantity)===1?"yarda":/rollo/.test(normalize(item.label))?"rollo":/paquete/.test(normalize(item.label))?"paquete":"unidad";}
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
      if(excel.status==="fulfilled")catalog.push(...excel.value);
      const names=[...new Set(catalog.flatMap(c=>[displayName(c),normalize(displayName(c))]))].sort((a,b)=>a.localeCompare(b,"es"));
      const list=$("catalogSuggestions");list.replaceChildren();names.forEach(n=>option(list,n,n));
      $("catalogStatus").textContent=commercialCount+" comerciales · "+(excel.status==="fulfilled"?excel.value.length+" referencias Excel":"Excel no disponible")+(extra.status==="fulfilled"?"":" · opciones adicionales no disponibles");
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
  $("addLine").addEventListener("click",()=>{if(!saving&&!retryPayload)addLine().querySelector(".product").focus();});
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
      for(const line of retryPayload) await api("addSale",line);
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