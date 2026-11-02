/* Nicole Encajes · Excel .xlsx sin dependencias externas, compatible con GitHub Pages/Electron. */
"use strict";
(function (scope) {
  const HEADERS = [
    "Producto","Presentación","Cantidad","Unidad","Marca","Categoría",
    "Proveedor","Costo","Precio Edgar","Precio Gloria","Precio Jefferson"
  ];
  const FIELDS = [
    "producto","presentacion","cantidad","unidad","marca","categoria",
    "proveedor","costo","precio_edgar","precio_gloria","precio_jefferson"
  ];
  const e = (value) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");
  const numberCols = new Set([2,7,8,9,10]);
  const chunk = (list) => {
    let bytes = 0; for (const x of list) bytes += x.byteLength;
    const result = new Uint8Array(bytes);
    let p = 0;for (const x of list){result.set(x,p);p += x.byteLength}
    return result;
  };
  function crc32(bytes) {
    let crc = -1;
    for(const byte of bytes){
      crc ^= byte;
      for(let n=0;n<8;n++) crc=(crc>>>1) ^ ((crc&1)?0xedb88320:0);
    }
    return (crc ^ -1) >>> 0;
  }
  function zip(files){
    const records=[],center=[];
    let offset=0;
    for(const [path,value] of Object.entries(files)){
      const name=encoder.encode(path),body=encoder.encode(value),crc=crc32(body);
      const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);
      v.setUint16(8,0,true);v.setUint32(14,crc,true);
      v.setUint32(18,body.length,true);v.setUint32(22,body.length,true);
      v.setUint16(26,name.length,true);header.set(name,30);
      records.push(header,body);
      const cd=new Uint8Array(46+name.length),c=new DataView(cd.buffer);
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);
      c.setUint16(8,0x800,true);c.setUint32(16,crc,true);
      c.setUint32(20,body.length,true);c.setUint32(24,body.length,true);
      c.setUint16(28,name.length,true);c.setUint32(42,offset,true);
      cd.set(name,46);center.push(cd);
      offset += header.length+body.length;
    }
    const directory=chunk(center);
    const end=new Uint8Array(22),z=new DataView(end.buffer);
    z.setUint32(0,0x06054b50,true);
    z.setUint16(8,center.length,true);z.setUint16(10,center.length,true);
    z.setUint32(12,directory.length,true);z.setUint32(16,offset,true);
    return new Blob([...records,directory,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  function cell(x,col,row,style="") {
    if(x===null||x===undefined||x==="")return "";
    const a=String.fromCharCode(65+col)+(row+1);
    const text=String(x);
    if(numberCols.has(col) && typeof x==="number") return '<c r="'+a+'"'+style+'><v>'+x+'</v></c>';
    return '<c r="'+a+'" t="inlineStr"'+style+'><is><t>'+e(text)+'</t></is></c>';
  }
  function sheetXml(rows, columns, options={}){
    const maxColumn=String.fromCharCode(64+columns.length), maxRow=Math.max(2,rows.length);
    const colDefs=columns.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join("");
    const sheetRows=rows.map((r,i)=>{
      return '<row r="'+(i+1)+'"'+(i===0?' ht="29" customHeight="1"':'')+'>'+
        r.map((v,j)=>cell(v,j,i,i===0?' s="1"':numberCols.has(j)?' s="2"':'')).join("")+'</row>';
    }).join("");
    const validation=options.dropdown?
      '<dataValidations count="2"><dataValidation type="list" showErrorMessage="1" errorTitle="Presentación" error="Selecciona una presentación de la lista" sqref="B2:B501"><formula1>"Pieza,Rollo,Gruesa,Caja,Kilo,Metro,Yarda,Docena,Paquete,Otro"</formula1></dataValidation>'+
      '<dataValidation type="list" sqref="D2:D501"><formula1>"unidad,piezas,rollos,metros,yardas,kilos,gramos,docenas,cajas"</formula1></dataValidation></dataValidations>':"";
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
      '<dimension ref="A1:'+maxColumn+maxRow+'"/><sheetViews><sheetView workbookViewId="0">'+
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
      '<sheetFormatPr defaultRowHeight="20"/><cols>'+colDefs+'</cols><sheetData>'+sheetRows+'</sheetData>'+
      (options.filter?'<autoFilter ref="A1:'+maxColumn+'501"/>':'')+validation+'</worksheet>';
  }
  function buildTemplate(){
    const how=[
      ["PASO","INSTRUCCIONES"],
      ["1","Completa la hoja PRODUCTOS; una fila corresponde a cada presentación."],
      ["2","Obligatorios: Producto, Presentación, Cantidad y Unidad."],
      ["3","Costo y proveedor son comunes a los almacenes; se cargan solo desde Jefferson."],
      ["4","Los precios Edgar, Gloria y Jefferson son independientes; déjalos vacíos para heredar."],
      ["5","En PRODUCTOS no hay ejemplos: puedes comenzar a escribir en la fila 2."],
      ["6","Para un mismo producto, repite su nombre con distintas presentaciones."],
      ["7","Un valor cero es distinto de una celda vacía."],
      ["8","Previsualiza todas las filas antes de confirmar la carga."],
    ];
    const files={
      "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
      "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      "xl/workbook.xml":'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PRODUCTOS" sheetId="1" r:id="rId1"/><sheet name="INSTRUCCIONES" sheetId="2" r:id="rId2"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      "xl/styles.xml":'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5433B8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" numFmtId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" numFmtId="0" xfId="0" applyFill="1" applyFont="1"/><xf fontId="0" fillId="0" borderId="0" numFmtId="2" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml":sheetXml([HEADERS],[26,20,12,15,18,19,25,15,18,18,20],{filter:true,dropdown:true}),
      "xl/worksheets/sheet2.xml":sheetXml(how,[16,100])
    };
    return zip(files);
  }
  function downloadTemplate(){
    const blob=buildTemplate(),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="Nicole_Encajes_Plantilla_Productos.xlsx";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  async function unzip(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer),all={};
    let offset=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
      if(view.getUint32(i,true)===0x06054b50){offset=i;break}
    }
    if(offset<0)throw Error("El archivo no es un Excel .xlsx válido");
    const total=view.getUint16(offset+10,true),dir=view.getUint32(offset+16,true);
    if(total>400||dir>=bytes.length)throw Error("Excel demasiado grande");
    let p=dir;
    for(let i=0;i<total;i++){
      if(view.getUint32(p,true)!==0x02014b50)throw Error("Estructura ZIP incorrecta");
      const flags=view.getUint16(p+8,true),method=view.getUint16(p+10,true);
      const comp=view.getUint32(p+20,true),uncomp=view.getUint32(p+24,true);
      const nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true);
      const local=view.getUint32(p+42,true),name=decoder.decode(bytes.slice(p+46,p+46+nameLen));
      p+=46+nameLen+extraLen+commentLen;
      if(!/^(xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels))$/.test(name))continue;
      if(uncomp>12*1024*1024||comp>6*1024*1024)throw Error("Una hoja del Excel supera el límite permitido");
      if(view.getUint32(local,true)!==0x04034b50)throw Error("Entrada de ZIP inválida");
      const dataOffset=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
      if(dataOffset+comp>bytes.length)throw Error("Archivo incompleto");
      let content=bytes.slice(dataOffset,dataOffset+comp);
      if(method===8){
        if(typeof DecompressionStream==="undefined")throw Error("Este navegador no admite lectura Excel. Actualízalo o usa Chrome.");
        const stream=new Blob([content]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        content=new Uint8Array(await new Response(stream).arrayBuffer());
      } else if(method!==0)throw Error("Método ZIP incompatible");
      if(content.length>12*1024*1024)throw Error("La hoja supera el límite permitido");
      all[name]=decoder.decode(content);
    }
    return all;
  }
  function xml(text){
    const root=new DOMParser().parseFromString(text,"application/xml");
    if(root.querySelector("parsererror"))throw Error("Contenido XML del Excel inválido");
    return root;
  }
  function localName(node){return node.localName||node.nodeName.split(":").pop();}
  function elems(node,name){return [...node.getElementsByTagName("*")].filter(n=>localName(n)===name)}
  function child(node,name){return [...node.children].find(n=>localName(n)===name)}
  function value(node){return node?.textContent||""}
  function colNum(ref){
    const letters=String(ref).match(/^[A-Z]+/i)?.[0]||"";
    let sum=0;for(const c of letters.toUpperCase())sum=sum*26+c.charCodeAt(0)-64;
    return sum-1;
  }
  async function parse(file){
    if(!file||! /\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw Error("Selecciona un Excel .xlsx de máximo 5 MB");
    const parts=await unzip(await file.arrayBuffer());
    let sheetPath="xl/worksheets/sheet1.xml";
    if(parts["xl/workbook.xml"]&&parts["xl/_rels/workbook.xml.rels"]){
      const workbook=xml(parts["xl/workbook.xml"]),relationships=xml(parts["xl/_rels/workbook.xml.rels"]);
      const sheets=elems(workbook,"sheet");
      const wanted=sheets.find(s=>s.getAttribute("name")?.toUpperCase()==="PRODUCTOS")||sheets[0];
      const id=wanted?.getAttribute("r:id")||wanted?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships","id");
      const rel=elems(relationships,"Relationship").find(x=>x.getAttribute("Id")===id);
      if(rel){const target=rel.getAttribute("Target")||"";sheetPath=target.startsWith("/")?target.slice(1):"xl/"+target.replace(/^\.\//,"");}
    }
    const sheet=parts[sheetPath]||parts["xl/worksheets/sheet1.xml"];
    if(!sheet)throw Error("No se encontró la hoja PRODUCTOS");
    const ss=parts["xl/sharedStrings.xml"]?elems(xml(parts["xl/sharedStrings.xml"]),"si").map(item=>elems(item,"t").map(value).join("")):[];
    const rows=elems(xml(sheet),"row").map(row=>{
      const cells=[];
      for(const c of [...row.children].filter(x=>localName(x)==="c")){
        const i=colNum(c.getAttribute("r"));if(i<0||i>100)continue;
        const type=c.getAttribute("t"),cellValue=child(c,"v");
        const raw= type==="inlineStr"?elems(c,"t").map(value).join(""):value(cellValue);
        cells[i]=type==="s"?ss[Number(raw)]??"":type==="n"||(!type&&raw&&Number.isFinite(Number(raw)))?Number(raw):raw;
      }
      return cells;
    });
    if(!rows.length)throw Error("La hoja está vacía");
    const normalized=(s)=>String(s??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const header=rows[0].map(normalized);
    const expected=HEADERS.map(normalized);
    if(expected.some((h,i)=>header[i]!==h))throw Error("La plantilla no tiene las 11 columnas esperadas. Descarga la plantilla actual.");
    const data=rows.slice(1).filter(r=>r.some(x=>x!==null&&x!==undefined&&String(x).trim()!==""));
    if(data.length>500)throw Error("Máximo 500 presentaciones por archivo. Divide el Excel en varios archivos.");
    const seen=new Set(),good=[],errors=[];
    data.forEach((cells,i)=>{
      const row={}; FIELDS.forEach((name,j)=>row[name]=cells[j]===undefined?null:cells[j]);
      const line=i+2;
      for(const name of ["producto","presentacion","unidad","marca","categoria","proveedor"]){
        row[name]=String(row[name]??"").trim();
      }
      if(!row.producto||!row.presentacion||!row.unidad)errors.push("Fila "+line+": faltan producto, presentación o unidad");
      const quantity=Number(row.cantidad);
      if(row.cantidad==null||row.cantidad===""||!Number.isFinite(quantity)||quantity<=0)errors.push("Fila "+line+": cantidad incorrecta");
      else row.cantidad=quantity;
      for(const field of ["costo","precio_edgar","precio_gloria","precio_jefferson"]){
        if(row[field]===null||row[field]===""){row[field]=null;continue}
        const amount=Number(row[field]);
        if(!Number.isFinite(amount)||amount<0||amount>999999999||
          (field!=="costo"&&Math.abs(Math.round(amount*100)-amount*100)>1e-7))
          errors.push("Fila "+line+": "+field.replaceAll("_"," ")+" inválido");
        else row[field]=amount;
      }
      const key=[row.producto,row.marca,row.presentacion].map(normalized).join("|");
      if(seen.has(key))errors.push("Fila "+line+": presentación duplicada en el mismo Excel");
      seen.add(key);
      good.push({...row,_fila:line});
    });
    return {rows:good,errors};
  }
  const api={HEADERS,FIELDS,downloadTemplate,buildTemplate,parse};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(scope)scope.NICOLE_EXCEL=api;
})(typeof window!=="undefined"?window:null);
