/* PIN comercial validado en Supabase; nunca se guarda el PIN en el navegador. */
"use strict";
(() => {
 const key="nicole-edgar-session-v1", main=document.getElementById("edgar-protected"), gate=document.getElementById("edgar-login"), form=document.getElementById("edgar-pin-form"), pin=document.getElementById("edgar-pin"), status=document.getElementById("edgar-login-status"), submit=document.getElementById("edgar-enter");
 const api=String(window.ALMACEN_API_URL||"").trim();
 let token="", opened=false, checking=false;
 const validToken=t=>/^[a-f0-9]{64}$/.test(t||"");
 function read(){try{return localStorage.getItem(key)||""}catch{return ""}}
 function save(t){try{localStorage.setItem(key,t)}catch{}}
 function clear(){try{localStorage.removeItem(key)}catch{}}
 function message(s){status.textContent=s}
 async function rpc(name,data){
  if(!api||!window.ALMACEN_PUBLIC_KEY)throw Error("El acceso no está configurado.");
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{
   const response=await fetch(new URL("/rest/v1/rpc/"+name,api),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"Content-Type":"application/json"},body:JSON.stringify(data),cache:"no-store",signal:ctrl.signal});
   if(!response.ok)throw Error("No fue posible verificar el acceso. Intenta nuevamente.");
   return await response.json();
  }finally{clearTimeout(timer)}
 }
 function lock(s){main.hidden=true;gate.hidden=false;form.hidden=false;message(s);pin.focus()}
 async function loadModules(){
  for(const path of (main.dataset.scripts||"").split("|").filter(Boolean)){
   await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=path;script.onload=resolve;script.onerror=()=>reject(Error("No se pudo cargar "+path));document.body.appendChild(script)});
  }
 }
 async function open(t){
  token=t;gate.hidden=true;main.hidden=false;
  if(opened)return;
  opened=true;
  window.NICOLE_EDGAR_SESSION=Object.freeze({getToken:()=>token,validate:()=>rpc("edgar_pin_validate",{p_token:token})});
  const nav=main.querySelector(".edgar-nav-inner");
  if(nav){const btn=document.createElement("button");btn.type="button";btn.className="edgar-logout";btn.textContent="Cerrar sesión";btn.addEventListener("click",async()=>{btn.disabled=true;try{await rpc("edgar_pin_logout",{p_token:token});clear();location.reload()}catch{btn.disabled=false;alert("No se pudo cerrar la sesión en el servidor. Intenta nuevamente.")}});nav.appendChild(btn)}
  try{await loadModules()}catch(e){const p=document.createElement("p");p.className="edgar-auth-error";p.setAttribute("role","alert");p.textContent="No se pudo cargar este módulo. Recarga la página o usa el menú superior.";main.appendChild(p)}
 }
 async function restore(){
  if(checking)return;checking=true;
  const stored=read();
  try{
   if(validToken(stored)&&await rpc("edgar_pin_validate",{p_token:stored})===true){await open(stored);return}
   clear();lock("");
  }catch{lock("No se pudo verificar el acceso guardado. Revisa la conexión e inténtalo nuevamente.")}
  finally{checking=false}
 }
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(checking)return;
  checking=true;submit.disabled=true;message("Verificando…");
  try{
   const result=await rpc("edgar_pin_login",{p_pin:pin.value.trim()});pin.value="";
   if(!result?.ok||!validToken(result.token)){message(result?.error||"PIN incorrecto.");pin.focus();return}
   save(result.token);await open(result.token);
  }catch{message("No se pudo conectar. Revisa la conexión e intenta de nuevo.")}
  finally{checking=false;submit.disabled=false}
 });
 window.addEventListener("storage",e=>{if(e.key===key&&opened&&e.newValue!==token)location.reload()});
 restore();
})();
