/* Sesión administrativa en memoria. Nunca guardar el PIN ni el token en almacenamiento local. */
"use strict";
(()=>{
 let token="",pending=null;
 async function getToken(){
  if(token)return token;
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
    const dialog=document.createElement("dialog"),form=document.createElement("form");
    form.method="dialog";const title=document.createElement("h2");title.textContent="Autorizar operación";
    const label=document.createElement("label");label.textContent="PIN de administración";
    const input=document.createElement("input");input.type="password";input.inputMode="numeric";input.autocomplete="off";input.required=true;input.pattern="[0-9]{4,8}";input.maxLength=8;label.append(input);
    const msg=document.createElement("p");msg.setAttribute("role","status");
    const submit=document.createElement("button");submit.type="submit";submit.textContent="Autorizar";
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancelar";
    form.append(title,label,msg,submit,cancel);dialog.append(form);document.body.append(dialog);
    function cleanup(){input.value="";dialog.close();dialog.remove()}
    cancel.onclick=()=>{cleanup();reject(Error("Operación cancelada"))};
    dialog.addEventListener("cancel",e=>{e.preventDefault();cleanup();reject(Error("Operación cancelada"))});
    form.addEventListener("submit",async e=>{
      e.preventDefault();submit.disabled=true;msg.textContent="Verificando…";
      try{const pin=input.value;input.value="";
        const r=await fetch(window.ALMACEN_API_URL,{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",body:JSON.stringify({action:"login",pin})});
        const p=await r.json();if(!r.ok||!p.ok||typeof p.token!=="string")throw Error(p.error||"No fue posible autorizar");
        token=p.token;cleanup();resolve(token);
      }catch(e){msg.textContent=e.message;submit.disabled=false;input.focus()}
    });
    dialog.showModal();input.focus();
  }).finally(()=>{pending=null});
  return pending;
 }
 window.NICOLE_ADMIN={getToken,clear(){token=""}};
})();
