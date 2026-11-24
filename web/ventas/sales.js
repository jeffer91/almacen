/* Nicole Encajes · ventas diarias. Acceso público sin PIN. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const url = String(window.ALMACEN_API_URL || "").replace(/\/$/, "");
  let sales = [];
  let pendingKey = null;
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
  function updatePreview() {
    const qty = Number($("quantity").value), price = Number($("unitPrice").value);
    $("previewTotal").textContent = money(Number.isFinite(qty * price) ? Math.round(qty * price * 100) / 100 : 0);
  }
  function renderSales() {
    $("count").textContent = String(sales.length);
    $("total").textContent = money(sales.reduce((sum, row) => sum + Number(row.total || 0), 0));
    $("empty").hidden = sales.length > 0;
    $("history").replaceChildren();
    for (const sale of sales) {
      const entry = document.createElement("div");
      entry.className = "sale";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = sale.product_name;
      const details = document.createElement("small");
      const qty = Number(sale.quantity).toLocaleString("es-EC", { maximumFractionDigits: 3 });
      details.textContent = qty + " " + sale.unit +
        (sale.presentation_label ? " · " + sale.presentation_label : "") +
        " · " + money(sale.unit_price) + " c/u" +
        (sale.payment_method === "sin_especificar" ? "" : " · " + sale.payment_method);
      info.append(title, details);
      if (sale.notes) {
        const note = document.createElement("small");
        note.textContent = sale.notes;
        info.append(note);
      }
      const right = document.createElement("div");
      right.className = "right";
      const amt = document.createElement("span");
      amt.className = "amount";
      amt.textContent = money(sale.total);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Anular";
      remove.setAttribute("aria-label", "Anular venta de " + sale.product_name);
      remove.addEventListener("click", () => voidSale(sale));
      right.append(amt, remove);
      entry.append(info, right);
      $("history").append(entry);
    }
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
      ["Fecha", "Producto", "Presentación", "Cantidad", "Unidad", "Precio unitario", "Total", "Forma de pago", "Observaciones"],
      ...sales.map((s) => [s.sale_date, s.product_name, s.presentation_label, s.quantity,
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
  $("saleForm").addEventListener("input", () => { pendingKey = null; updatePreview(); });
  $("saleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!pendingKey) pendingKey = crypto.randomUUID();
    $("saveSale").disabled = true;
    setMessage("saleMessage", "");
    try {
      await api("addSale", {
        sale_date: $("saleDate").value,
        product_name: $("product").value.trim(),
        presentation_label: $("presentation").value.trim(),
        quantity: Number($("quantity").value),
        unit: $("unit").value,
        unit_price: Number($("unitPrice").value),
        payment_method: $("payment").value,
        notes: $("notes").value.trim(),
        request_key: pendingKey
      });
      pendingKey = null;
      $("saleForm").reset();
      updatePreview();
      setMessage("saleMessage", "Venta registrada correctamente.", true);
      await loadSales();
      $("product").focus();
    } catch (error) {
      setMessage("saleMessage", error.message);
    } finally {
      $("saveSale").disabled = false;
    }
  });
  $("saleDate").addEventListener("change", () => { pendingKey = null; loadSales(); });
  $("reload").addEventListener("click", loadSales);
  $("exportCsv").addEventListener("click", exportCsv);
  Promise.all([loadSales(), loadProductNames()]);
  updatePreview();
})();