/* Nicole Encajes — consulta de Excel comercial visible guardado en Supabase. */
"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const apiOrigin = new URL(String(window.ALMACEN_API_URL)).origin;
  const excelApi = `${apiOrigin}/functions/v1/excel-catalog`;
  const ROWS_PER_PAGE = 70;
  const FETCH_LIMIT = 500;
  const state = { sheets: [], rows: [], selected: "", query: "", page: 0 };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const format = (value) => value === null || value === undefined || value === "" ? "" :
    typeof value === "number" ? new Intl.NumberFormat("es-EC", { maximumFractionDigits: 6 }).format(value) : String(value);
  const status = (message) => { $("status").textContent = message; };
  const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
  async function excelQuery(action, fields = {}) {
    const response = await fetch(excelApi, {
      method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...fields })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw Error(data.error || "No se pudo consultar el catálogo.");
    return data;
  }
  async function load() {
    status("Cargando hojas y columnas originales…");
    $("sheet").disabled = true;
    $("search").disabled = true;
    try {
      const sheets = (await excelQuery("sheets")).sheets;
      if (!sheets.length) throw Error("No se encontraron hojas comerciales importadas.");
      const rows = [];
      for (let offset = 0; ; offset += FETCH_LIMIT) {
        const part = (await excelQuery("rows", { limit: FETCH_LIMIT, offset })).rows;
        rows.push(...part);
        if (part.length < FETCH_LIMIT) break;
      }
      state.sheets = sheets;
      state.rows = rows;
      const previous = state.selected;
      state.selected = sheets.find(x => x.sheet_name === previous)?.sheet_name || sheets[0].sheet_name;
      $("sheet").innerHTML = sheets.map(s => `<option value="${escapeHtml(s.sheet_name)}">${escapeHtml(s.sheet_name)} (${s.row_count})</option>`).join("");
      $("sheet").value = state.selected;
      $("sheet").disabled = false;
      $("search").disabled = false;
      state.page = 0;
      render();
      status(`${rows.length.toLocaleString("es-EC")} filas de ${sheets.length} hojas comerciales visibles, cargadas desde Supabase. Solo lectura.`);
    } catch (err) {
      status("No se pudo consultar el catálogo: " + String(err.message || err));
      $("data-table").querySelector("tbody").innerHTML = '<tr><td>No hay datos disponibles. Pulsa «Actualizar datos».</td></tr>';
    }
  }
  function filtered() {
    const term = state.query.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return state.rows.filter(row => {
      if (row.sheet_name !== state.selected) return false;
      if (!term) return true;
      const text = [row.display_name, ...Object.values(row.cells || {})].join(" ")
        .toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return text.includes(term);
    }).sort((a,b) => a.sheet_row - b.sheet_row);
  }
  function excelColumn(i) {
    let column = ""; i += 1;
    while (i > 0) { column = String.fromCharCode(65 + ((i - 1) % 26)) + column; i = Math.floor((i - 1) / 26); }
    return column;
  }
  function render() {
    const meta = state.sheets.find(x => x.sheet_name === state.selected);
    if (!meta) return;
    const matches = filtered();
    const pages = Math.max(1,Math.ceil(matches.length / ROWS_PER_PAGE));
    state.page = Math.min(state.page,pages-1);
    const pageRows = matches.slice(state.page * ROWS_PER_PAGE,(state.page+1)*ROWS_PER_PAGE);
    const columns = Array.from({ length: meta.max_column }, (_,i) => excelColumn(i));
    $("sheet-title").textContent = meta.sheet_name + (meta.title && meta.title !== meta.sheet_name ? " · " + meta.title : "");
    $("count").textContent = `${matches.length} filas encontradas · Encabezados originales de la fila ${meta.header_row}`;
    $("data-table").querySelector("thead").innerHTML = `<tr><th scope="col">Fila</th>${columns.map(c => `<th scope="col"><span class="letter">Columna ${escapeHtml(c)}</span>${escapeHtml(meta.headers?.[c] ?? "Sin encabezado")}</th>`).join("")}</tr>`;
    $("data-table").querySelector("tbody").innerHTML = pageRows.length ? pageRows.map(row =>
      `<tr data-row="${row.sheet_row}" tabindex="0" aria-label="Ver información completa de fila ${row.sheet_row}"><td>${row.sheet_row}</td>${columns.map(c => {
        const value = format(row.cells?.[c]); return `<td class="${value ? "" : "empty"}" title="${escapeHtml(value)}">${value ? escapeHtml(value) : "—"}</td>`;
      }).join("")}</tr>`).join("") : `<tr><td colspan="${columns.length + 1}">No hay coincidencias.</td></tr>`;
    $("page").textContent = `Página ${state.page + 1} de ${pages}`;
    $("prev").disabled = state.page === 0;
    $("next").disabled = state.page >= pages-1;
  }
  function detail(rowNumber) {
    const row = state.rows.find(x => x.sheet_name === state.selected && x.sheet_row === rowNumber);
    const sheet = state.sheets.find(x => x.sheet_name === state.selected);
    if (!row || !sheet) return;
    $("detail-title").textContent = row.display_name || `Fila ${row.sheet_row}`;
    $("detail-meta").textContent = `Hoja: ${row.sheet_name} · Fila original ${row.sheet_row} · Bloque de carga ${row.batch_no}`;
    $("detail-values").innerHTML = Object.entries(row.cells || {}).map(([letter,v]) =>
      `<dl class="detail-pair"><dt>${escapeHtml(letter)} · ${escapeHtml(sheet.headers?.[letter] ?? "Sin encabezado")}</dt><dd>${escapeHtml(format(v))}</dd></dl>`).join("");
    $("details").showModal();
  }
  $("sheet").addEventListener("change",e => { state.selected = e.target.value;state.page = 0;render(); });
  $("search").addEventListener("input",e => { state.query = e.target.value;state.page = 0;render(); });
  $("reload").addEventListener("click",load);
  $("prev").addEventListener("click",() => {if(state.page>0){state.page--;render();}});
  $("next").addEventListener("click",() => {state.page++;render();});
  $("close-detail").addEventListener("click",() => $("details").close());
  $("data-table").querySelector("tbody").addEventListener("click",e => { const tr=e.target.closest("tr[data-row]");if(tr)detail(Number(tr.dataset.row)); });
  $("data-table").querySelector("tbody").addEventListener("keydown",e => {if(e.key!=="Enter"&&e.key!==" ")return;const tr=e.target.closest("tr[data-row]");if(tr){e.preventDefault();detail(Number(tr.dataset.row));}});
  load();
})();