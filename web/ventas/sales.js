/* Nicole Encajes · ventas diarias. Acceso público sin PIN. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const url = String(window.ALMACEN_API_URL || "").replace(/\/$/, "");
  let sales = [];
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
      const amount = Math.round(Number(row.querySelector(".qty").value)*Number(row.querySelector(".price").value)*100)/100;
      row.querySelector(".line-total").textContent = money(amount);
      total += amount || 0;
    });
    $("previewTotal").textContent = money(total);
  }
  function addLine() {
    const row = $("entryRows").insertRow();
    row.dataset.key = crypto.randomUUID();
    row.innerHTML = '<td></td><td><input class="product" list="catalogSuggestions" maxlength="180" required placeholder="Producto" aria-label="Producto"><input class="detail" maxlength="100" placeholder="Detalle opcional" aria-label="Detalle"></td><td><input class="qty" type="number" min="0.001" max="1000000" step="0.001" value="1" required aria-label="Cantidad"></td><td><select class="unit" aria-label="Unidad"><option value="unidad">Unidad</option><option value="metro">Metro</option><option value="rollo">Rollo</option><option value="yarda">Yarda</option><option value="paquete">Paquete</option><option value="otro">Otro</option></select></td><td><input class="price" type="number" min="0" max="1000000" step="0.01" required placeholder="0.00" aria-label="Precio unitario"></td><td class="line-total">$0,00</td><td><select class="payment" aria-label="Pago"><option value="sin_especificar">Sin especificar</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></td><td><button type="button" class="remove-line">Quitar</button></td>';
    row.querySelector(".remove-line").addEventListener("click",()=>{if(saving||retryPayload)return;row.remove();if(!rows().length)addLine();updatePreview();});
    updatePreview();
    return row;
  }
  function groupInfo(sale) {
    const match = /^\\[venta:([a-f0-9-]{36})\\] (.*)$/.exec(sale.notes || "");
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
  async function loadProductNames() {
    try {
      const data = await api("catalog");
      const names = new Set((data.products || []).map((p) => p.name).filter(Boolean));
      const opts = [...names].sort((a, b) => a.localeCompare(b, "es"));
      $("catalogSuggestions").replaceChildren(...opts.map((name) => {
        const option = document.createElement("option");
        option.value = name;
        return option;
      }));
    } catch { /* siempre se permite escribir el producto manualmente */ }
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
  $("exportCsv").addEventListener("click", exportCsv);
  renderSales();
  Promise.all([loadSales(), loadProductNames()]);
  updatePreview();
})();