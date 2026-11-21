/* Nicole Encajes: respaldo verificable Supabase → Google Sheets, sin incluir el catálogo web estático como oficial. */
"use strict";
(function(scope){
  const HEADERS = ["Tipo registro","ID registro Supabase","ID producto Supabase","SKU","Producto","Marca","Categoría",
    "Presentación","Proveedor","Cantidad","Unidad","Costo USD","Precio SIN IVA USD","Precio CON IVA USD",
    "Presentación original","Revisión","Actualizado en Supabase","Fecha respaldo"];
  const key = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g," ").trim();
  const fixed = (n,precision) => n === null || n === undefined || n === "" || !Number.isFinite(Number(n))
    ? "" : Number(n).toFixed(precision);
  function backupRows(data,optionData,date) {
    const products = (data?.products || []).filter(p=>p.active!==false);
    const presentations = data?.presentations || [];
    const prices = data?.prices || [];
    const existingOptions=optionData?.options||[];
    const supplierName = optionData?.assigned || {};
    const iva=Number(data?.iva_rate ?? 15);
    const rate=Number.isFinite(iva) && iva>=0 && iva<=100 ? 1+iva/100 : 1.15;
    const productMap=new Map(products.map(p=>[p.id,p]));
    const productByName=new Map(products.map(p=>[key(p.name)+"|"+key(p.brand),p]));
    const rows=[HEADERS.slice()];
    for(const p of products) {
      const owned=presentations.filter(x=>x.product_id===p.id);
      if(!owned.length) {
        rows.push(["PRODUCTO",p.id,p.id,"",p.name,p.brand||"",p.category||"","","","","","","","","","","",date]);
        continue;
      }
      for(const item of owned) {
        const price=prices.find(x=>x.presentation_id===item.id && x.shop==="jefferson");
        const net=price?Number(price.price):null;
        rows.push(["PRESENTACIÓN",item.id,p.id,item.sku||"",p.name,p.brand||"",p.category||"",
          item.label,supplierName[item.id]||"",item.quantity??"",item.unit||"",fixed(item.current_cost,4),
          net===null?"":fixed(net,4),net===null?"":fixed(net*rate,2),"","",item.updated_at||p.updated_at||"",date]);
      }
    }
    for(const o of existingOptions) {
      const p=productByName.get(key(o.product)+"|"+key(o.brand));
      const gross=o.gross===null||o.gross===undefined?null:Number(o.gross);
      const net=gross===null?null:gross/rate;
      rows.push(["OPCIÓN EDGAR",o.id,p?.id||"","",o.product,o.brand||"",p?.category||"",
        o.label,o.supplier||"",o.quantity??"",o.unit||"",fixed(o.cost,4),
        net===null?"":fixed(net,4),fixed(gross,2),o.source_label||"",o.revision||1,"",date]);
    }
    return rows;
  }
  function cell(value) {
    const s=String(value??"").replace(/[\t\r\n]+/g," ");
    return /^[=+@-]/.test(s) ? "'"+s : s;
  }
  function asTSV(rows) {return rows.map(row=>row.map(cell).join("\t")).join("\r\n");}
  const api=Object.freeze({HEADERS,backupRows,asTSV});
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(scope)scope.NICOLE_SHEETS_BACKUP=api;
})(typeof window!=="undefined"?window:null);
