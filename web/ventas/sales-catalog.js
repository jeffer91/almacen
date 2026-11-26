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
        c.items.push({ ...o, optionId: o.id, referencePrice: base?.referencePrice, cost: o.cost ?? base?.cost ?? null, net: null });
      }
      c.items.sort((a,b) => a.label.localeCompare(b.label,"es") || (a.supplier || "").localeCompare(b.supplier || "","es"));
      c.haystack = V.normalize([c.name, c.brand, c.category, ...c.items.map(i => i.label + " " + (i.unit || "") + " " + (i.supplier || ""))].join(" "));
    }
    state.cards.sort((a,b) => a.name.localeCompare(b.name, "es"));
    return state.cards;
  }

  const canonical = value => V.normalize(value).replace(/\b(?:pon\s*pon(?:es)?|pom\s*pon(?:es)?|pompom(?:s)?)\b/g,"pompon");
  function distance(a,b){
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=next;}
    return prev[b.length];
  }
  function rank(cards,query,limit=12){
    const q=canonical(query), words=q.split(" ").filter(w=>w&&!["de","del","la","el","los","las"].includes(w));
    if(!words.length)return [];
    return cards.map(card=>{
      const name=canonical([card.name,card.brand].join(" ")), hay=canonical([card.name,card.brand,card.haystack].join(" "));
      const tokens=hay.split(" ").filter(Boolean);
      const compact=x=>x.replace(/[^a-z0-9]/g,"");
      const nq=compact(words.join(" ")), nn=compact(name.split(" ").filter(w=>!["de","del","la","el","los","las"].includes(w)).join(" "));
      const requestedNumbers=words.filter(w=>/^\d/.test(w));
      if(requestedNumbers.some(w=>!tokens.some(t=>t===w||t.startsWith(w)&&!/^\d+$/.test(w))))return {card,score:0};
      const fullName=compact(name),fullQuery=compact(q);
      let score=name===q?100:name.startsWith(q)?65:name.includes(q)?45:nn===nq||fullName===fullQuery?80:nn.startsWith(nq)||fullName.startsWith(fullQuery)?60:nn.includes(nq)||fullName.includes(fullQuery)?40:0;
      if(!score){
        let sum=0;
        for(const w of words){
          let best=0;
          for(const t of tokens){
            if(t.startsWith(w))best=Math.max(best,12);
            else if(t.includes(w))best=Math.max(best,9);
            else if(w.length>=3&&!/^\d/.test(w)&&!/^\d/.test(t)){
              const d=Math.min(distance(w,t),distance(w,t.slice(0,w.length)));if(d<= (w.length>=6?2:1))best=Math.max(best,5-d);
            }
          }
          if(!best)return {card,score:0};
          sum+=best;
        }
        score=sum;
      }
      return {card,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||Number(Boolean(a.card.excel))-Number(Boolean(b.card.excel))||a.card.name.localeCompare(b.card.name,"es",{numeric:true})).slice(0,limit).map(x=>x.card);
  }
  function excelCards(sheets,rows){
    const meta=new Map(sheets.map(s=>[s.sheet_name,s]));
    const cards=[];
    for(const row of rows){
      const h=meta.get(row.sheet_name)?.headers||{}, cells=row.cells||{};
      const keys=Object.keys(h).filter(k=>/^(articulo|nombre|numero)( |$)/.test(V.normalize(h[k])));
      const nameKeys=keys.length?keys:["A"];
      for(const [index,k] of nameKeys.entries()){
        const raw=cells[k]??(index===0?row.display_name:"");
        if(typeof raw!=="string"||!raw.trim())continue;
        const next=nameKeys[index+1], cols=Object.keys(h).filter(c=>c.length===1&&c>k&&(!next||c<next));
        const qtyCol=cols.find(c=>/^(cant|mts|metros)/.test(V.normalize(h[c])));
        const qty=qtyCol?String(cells[qtyCol]??"").trim():"";
        const items=[];
        const costCol=cols.find(c=>/^(neto|costo)$/.test(V.normalize(h[c]).replace(/\./g,"")));
        const cost=costCol&&typeof cells[costCol]==="number"&&Number.isFinite(cells[costCol])&&cells[costCol]>=0?cells[costCol]:null;
        const qtyMatch=qty.match(/^(\d+(?:[.,]\d+)?)\s*(u\.?|unid(?:ades)?\.?|m\.?|mts\.?|metros?|yd\.?|yardas?)$/i);
        const packCount=qtyMatch?Number(qtyMatch[1].replace(",",".")):null;
        const packUnit=qtyMatch?V.normalize(qtyMatch[2]):"";
        for(const col of cols){
          const header=String(h[col]), val=cells[col];
          if(!/^(pxm|pieza|docena|unid|rollo|xm)$/.test(header.toLowerCase().replace(/[^a-z]/g,"")))continue;
          if(typeof val!=="number"||!Number.isFinite(val)||val<=0||val>=100000)continue;
          // Dates stored as Excel serials are not commercial prices.
          if(Number.isInteger(val)&&val>=40000&&val<=60000)continue;
          const tariff=header.replace(/[^a-z]/gi,"");
          const main=tariff==="PxM"||tariff==="PXM";
          const unitary=/^(unid|xm)$/i.test(tariff);
          const label=[qty,main?"":header].filter(Boolean).join(" · ")||"Presentación";
          const saleUnit=main&&packCount>1?(/^u|^unid/.test(packUnit)?"paquete":/^(m|mts|metro)/.test(packUnit)?"rollo":"otro"):main&&packCount===1?(/^u/.test(packUnit)?"unidad":/^m/.test(packUnit)?"metro":"yarda"):/^unid$/i.test(tariff)?"unidad":/^xm$/i.test(tariff)?"metro":/^rollo$/i.test(tariff)?"rollo":"otro";
          // El costo neto de la fuente se conserva. No se convierte entre tarifas ambiguas.
          items.push({label,referencePrice:val,cost,comparableCost:main&&packCount!==null?cost:null,saleUnit,sourceTariff:header,sourceRow:row.sheet_row,sourceSheet:row.sheet_name,sourceQuantity:qty});
        }
        if(!items.length)items.push({label:qty||"Presentación",cost,comparableCost:null,sourceQuantity:qty,sourceSheet:row.sheet_name,sourceRow:row.sheet_row});
        cards.push({id:"excel-"+row.sheet_name+"-"+row.sheet_row+"-"+k,name:raw.trim(),brand:"",excel:true,items,haystack:[raw,row.sheet_name,qty].join(" ")});
      }
    }
    return cards;
  }
  function smartCards(records) {
    return records.filter(r=>r.source_kind==="excel").map(r=>{
      const qty=String(r.presentation||"").trim(), qtyMatch=qty.match(/^(\d+(?:[.,]\d+)?)\s*(u\.?|unid(?:ades)?\.?|m\.?|mts\.?|metros?|y\.?|yd\.?|yardas?)$/i);
      const count=qtyMatch?Number(qtyMatch[1].replace(",",".")):null, unit=qtyMatch?V.normalize(qtyMatch[2]):"";
      const cost=r.cost==null?null:Number(r.cost);
      const items=(r.tariffs||[]).map(t=>{
        const raw=String(t.label), tariff=raw.replace(/[^a-z]/gi,""), main=tariff==="PxM"||tariff==="PXM";
        const saleUnit=main&&count>1?(/^u/.test(unit)?"paquete":/^(m|y)/.test(unit)?"rollo":"otro"):main&&count===1?(/^u/.test(unit)?"unidad":/^m/.test(unit)?"metro":"yarda"):/^unid$/i.test(tariff)?"unidad":/^xm$/i.test(tariff)?"metro":/^rollo$/i.test(tariff)?"rollo":/^docena$/i.test(tariff)?"paquete":"otro";
        return {label:[qty,main?"":raw].filter(Boolean).join(" · ")||"Presentación",referencePrice:Number(t.value),cost,comparableCost:main&&count!==null?cost:null,saleUnit,sourceTariff:raw};
      });
      if(!items.length)items.push({label:qty||"Presentación",cost,comparableCost:null});
      return {id:r.source_id,name:r.original_name,brand:"",excel:true,items,haystack:r.search_text,category:r.category,smart:r};
    });
  }
  function organize(cards,records){
    const meta=new Map(records.map(r=>[r.source_id,r]));
    return cards.map(c=>{
      const smart=meta.get(String(c.id))||c.smart;
      if(!smart)return c;
      return {...c,smart,category:smart.category,haystack:[c.haystack,smart.search_text].filter(Boolean).join(" ")};
    });
  }
  scope.NICOLE_SALES_CATALOG = {build,rank,excelCards,canonical,smartCards,organize};
})(window);
