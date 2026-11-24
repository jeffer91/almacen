/* Nicole Encajes · sincronizador seguro (lógica pura, sin DOM). */
"use strict";
(function(root) {
  const HEADERS = [
    "Código (SKU)", "Producto", "Marca", "Categoría", "Presentación",
    "Cantidad", "Unidad", "Proveedor", "Costo compra USD",
    "Precio CON IVA USD", "Precio SIN IVA USD", "Aplicar (SI/NO)"
  ];
  const normalize = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function parseDelimited(source, delimiter) {
    const text = String(source || "").replace(/^\uFEFF/, "");
    const rows = [], row = []; let current = "", quoted = false;
    for (let i=0; i<text.length; i++) {
      const ch=text[i];
      if (quoted) {
        if (ch==='"' && text[i+1]==='"') {current+='"';i++;}
        else if (ch==='"') quoted=false;
        else current+=ch;
      } else if (ch==='"' && current==="") quoted=true;
      else if (ch===delimiter) {row.push(current);current="";}
      else if (ch==="\n" || ch==="\r") {
        if(ch==="\r" && text[i+1]==="\n") i++;
        row.push(current);current="";
        if(row.some(x=>String(x).trim()!=="")) rows.push(row.slice());
        row.length=0;
      } else current+=ch;
    }
    if(quoted) throw Error("Comillas sin cerrar en el texto pegado");
    row.push(current);
    if(row.some(x=>String(x).trim()!=="")) rows.push(row.slice());
    return rows;
  }
  function amount(raw, {blank=true,zero=true}={}) {
    const text=String(raw??"").trim();
    if(!text) return blank?null:NaN;
    let t=text.replace(/[\s$]/g,"");
    if(t.includes(".") && t.includes(",")) {
      if(t.lastIndexOf(",")>t.lastIndexOf(".")) t=t.replace(/\./g,"").replace(",",".");
      else t=t.replace(/,/g,"");
    } else if(t.includes(",")) t=t.replace(",",".");
    if(!/^\d+(\.\d{1,4})?$/.test(t)) return NaN;
    const n=Number(t);
    return Number.isFinite(n)&&n<=999999999&&(zero||n>0)?n:NaN;
  }
  const round2 = n=>Math.round((n+Number.EPSILON)*100)/100;
  const round4 = n=>Math.round((n+Number.EPSILON)*10000)/10000;
  function parsePending(text, iva=15) {
    if(typeof text!=="string" || text.length>2000000) throw Error("La tabla es demasiado grande");
    const firstLine=text.split(/\r?\n/,1)[0]||"";
    const delim=firstLine.includes("\t")?"\t":firstLine.includes(";")?";":",";
    const parsed=parseDelimited(text,delim);
    if(!parsed.length) throw Error("Pega primero la tabla CAMBIOS_PENDIENTES, incluidos sus encabezados");
    if(HEADERS.some((h,i)=>normalize(parsed[0][i])!==normalize(h)))
      throw Error("Los encabezados no coinciden con CAMBIOS_PENDIENTES. Copia desde la columna A hasta L, incluyendo la fila 1.");
    const rate=Number(iva), errors=[], rows=[];let ignored=0;
    if(!Number.isFinite(rate)||rate<0||rate>50) throw Error("IVA inválido en Supabase");
    if(parsed.length>1001) throw Error("Máximo 1.000 filas por vista previa (500 por importación)");
    for(let i=1;i<parsed.length;i++) {
      const v=parsed[i], num=i+1, flag=normalize(v[11]);
      if(flag==="no"||!flag){ignored++;continue;}
      if(flag!=="si"){errors.push("Fila "+num+": Aplicar debe ser SI o NO");continue;}
      const [codigo,producto,marca,categoria,presentacion,cantidad,unidad,proveedor,costo,bruto,neto]=
        Array.from({length:11},(_,j)=>String(v[j]??"").trim());
      const qty=amount(cantidad,{blank:false,zero:false}), cost=amount(costo);
      const gross=amount(bruto), net=amount(neto);
      let bad="";
      if(!codigo||codigo.length>40) bad="código SKU obligatorio (máx. 40 caracteres)";
      else if(!producto||producto.length>180) bad="nombre de producto obligatorio (máx. 180)";
      else if(!presentacion||presentacion.length>80) bad="presentación obligatoria (máx. 80)";
      else if(!unidad||unidad.length>40) bad="unidad obligatoria (máx. 40)";
      else if(marca.length>100||categoria.length>100||proveedor.length>160) bad="texto demasiado largo";
      else if(!Number.isFinite(qty)) bad="cantidad inválida";
      else if(Number.isNaN(cost)||Number.isNaN(net)||Number.isNaN(gross)) bad="costo o precio inválido";
      else if(bruto&&neto&&Math.abs(round2(net*(1+rate/100))-gross)>0.01) bad="el precio con IVA no coincide con el precio sin IVA";
      if(bad){errors.push("Fila "+num+": "+bad);continue;}
      const precio=net!==null?round4(net):gross!==null?round4(gross/(1+rate/100)):null;
      rows.push({
        sourceRow:num, codigo,producto,marca,categoria,presentacion,cantidad:qty,
        unidad,proveedor,costo:cost,precio,gross:gross!==null?gross:precio!==null?round2(precio*(1+rate/100)):null
      });
    }
    const seen=new Set(),seenPresentation=new Set();
    for(const r of rows) {
      const k=normalize(r.codigo);
      if(seen.has(k)) errors.push("SKU repetido en filas aprobadas: "+r.codigo);
      seen.add(k);
      const identity=[r.producto,r.marca,r.presentacion].map(normalize).join("|");
      if(seenPresentation.has(identity))
        errors.push("Presentación repetida entre filas aprobadas: "+r.producto+" / "+r.presentacion);
      seenPresentation.add(identity);
    }
    if(rows.length>500) errors.push("Máximo 500 filas aprobadas por lote. Divide la importación.");
    return {rows,ignored,errors,totalSource:parsed.length-1};
  }
  function planRows(parsed, data) {
    const products=data?.products||[], presentations=data?.presentations||[],prices=data?.prices||[];
    const plan=[], errors=[...parsed.errors];
    const findProduct=(name,brand)=>products.find(x=>normalize(x.name)===normalize(name)&&normalize(x.brand)===normalize(brand));
    for(const r of parsed.rows) {
      const existing=presentations.find(x=>normalize(x.sku)===normalize(r.codigo) && x.sku);
      const related=existing?products.find(x=>x.id===existing.product_id):findProduct(r.producto,r.marca);
      if(existing && (!related||normalize(related.name)!==normalize(r.producto)||normalize(related.brand)!==normalize(r.marca))) {
        errors.push("Fila "+r.sourceRow+": el SKU ya pertenece a otro producto en Supabase");continue;
      }
      const similar=!existing&&related?presentations.find(x=>x.product_id===related.id && normalize(x.label)===normalize(r.presentacion)):null;
      if(similar && similar.sku && normalize(similar.sku)!==normalize(r.codigo)) {
        errors.push("Fila "+r.sourceRow+": esta presentación existe con otro SKU");continue;
      }
      const old=existing||similar;
      const oldPrice=old?prices.find(x=>x.presentation_id===old.id&&x.shop==="jefferson"):null;
      const changed=!!(old &&
        (normalize(old.label)!==normalize(r.presentacion) ||
        (!old.sku && !!r.codigo) ||
        Number(old.quantity)!==r.cantidad || normalize(old.unit)!==normalize(r.unidad) ||
        (r.categoria && normalize(related?.category)!==normalize(r.categoria)) ||
        (r.costo!==null && (old.current_cost===null||old.current_cost===undefined||Number(old.current_cost)!==r.costo)) ||
        (r.precio!==null && (!oldPrice||Math.abs(Number(oldPrice.price)-r.precio)>0.00005))));
      plan.push({ ...r, operation:old?(changed?"ACTUALIZAR":"SIN CAMBIOS"):"CREAR",
        oldGross:oldPrice?round2(Number(oldPrice.price)*(1+Number(data?.settings?.iva_rate??15)/100)):null,
        oldPrice:oldPrice?Number(oldPrice.price):null });
    }
    return {plan,errors,ignored:parsed.ignored,totalSource:parsed.totalSource};
  }
  function importRows(plan) {
    return plan.filter(x=>x.operation!=="SIN CAMBIOS").map(x=>({
      codigo:x.codigo,producto:x.producto,marca:x.marca,categoria:x.categoria,
      presentacion:x.presentacion,cantidad:String(x.cantidad),unidad:x.unidad,
      proveedor:x.proveedor,costo:x.costo===null?"":String(x.costo),
      precio:x.precio===null?"":x.precio.toFixed(4)
    }));
  }
  function signature(data) {
    const take=(arr,fields)=>JSON.stringify((arr||[]).map(x=>fields.map(k=>x[k]??null))
      .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    return [take(data.products,["id","name","brand","category","active","updated_at"]),
      take(data.presentations,["id","product_id","label","quantity","unit","sku","current_cost","wholesale_price","meter_price","updated_at"]),
      take(data.prices,["presentation_id","shop","price","updated_at"]),Number(data.settings?.iva_rate??15)].join("|");
  }
  function safe(v) {
    const s=String(v??"").replace(/[\t\r\n]+/g," ");
    return /^[=+@-]/.test(s)?("'"+s):s;
  }
  function tsv(rows) {return rows.map(row=>row.map(safe).join("\t")).join("\r\n");}
  function backupProducts(data,date) {
    const result=[["Supabase ID","SKU","Producto","Marca","Categoría","Presentación","Cantidad","Unidad","Costo USD","Precio sin IVA USD","Activo","Actualizado en Supabase","Fecha de respaldo","Fuente"]];
    const pres=data?.presentations||[],prices=data?.prices||[];
    for(const p of data?.products||[]) {
      const items=pres.filter(x=>x.product_id===p.id);
      if(!items.length) items.push(null);
      for(const item of items) {
        const price=item?prices.find(x=>x.presentation_id===item.id&&x.shop==="jefferson"):null;
        result.push([p.id,item?.sku||"",p.name,p.brand,p.category,item?.label||"",item?.quantity??"",item?.unit||"",
          item?.current_cost??"",price?.price??"",p.active===false?"NO":"SI",item?.updated_at||p.updated_at||"",date,"Supabase"]);
      }
    }
    return result;
  }
  function backupSales(sales,date) {
    const rows=[["Supabase ID","Fecha","Producto","Presentación","Cantidad","Unidad","Precio unitario USD","Total USD","Pago","Observaciones","Estado","Registrado UTC","Respaldo"]];
    for(const s of sales||[]) rows.push([s.id,s.sale_date,s.product_name,s.presentation_label,s.quantity,s.unit,
      s.unit_price,s.total,s.payment_method,s.notes,s.voided_at?"Anulada":"Vigente",s.created_at,date]);
    return rows;
  }
  const exported={HEADERS,normalize,parseDelimited,amount,parsePending,planRows,importRows,signature,tsv,backupProducts,backupSales};
  if(typeof module!=="undefined"&&module.exports) module.exports=exported;
  if(root) root.NICOLE_SYNC=exported;
})(typeof window!=="undefined"?window:null);
