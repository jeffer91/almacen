"use strict";
(function(scope){
const V = scope.NICOLE_VIEW;
  function hasAmount(card) {
    return card.items.some(item =>
      [item.gross, item.referencePrice, item.cost, item.wholesale, item.meterPrice].some(Number.isFinite)
    );
  }
  function build(data, options = {options:[],assigned:{}}) {
    let sheetRows = []; const state = {};
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
    return state.cards;
  }

scope.NICOLE_SALES_CATALOG = {build};
})(window);
