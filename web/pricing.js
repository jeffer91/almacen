/* Reglas compartidas de precios por almacén e historial de costos. */
"use strict";
(function(globalScope){
  function resolvePrice(prices, presentationId, shop){
    const list = Array.isArray(prices) ? prices : [];
    const own = list.find(p => p.presentation_id === presentationId && p.shop === shop);
    if(own) return {price:Number(own.price), inherited:false, from:shop};
    const latest = list.filter(p => p.presentation_id === presentationId)
      .sort((a,b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    return latest ? {price:Number(latest.price), inherited:true, from:latest.shop}
      : {price:null, inherited:true, from:null};
  }
  function summarizeCosts(costs, presentationId){
    const list = (Array.isArray(costs) ? costs : [])
      .filter(c => c.presentation_id === presentationId)
      .sort((a,b) => String(b.recorded_at).localeCompare(String(a.recorded_at)));
    if(!list.length) return {entries:[], latest:null, lowest:null, highest:null};
    return {
      entries:list,
      latest:list[0],
      lowest:list.reduce((a,b) => Number(a.cost)<=Number(b.cost)?a:b),
      highest:list.reduce((a,b) => Number(a.cost)>=Number(b.cost)?a:b)
    };
  }
  const api = Object.freeze({resolvePrice,summarizeCosts});
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  if(globalScope) globalScope.ALMACEN_RULES = api;
})(typeof window !== "undefined" ? window : null);
