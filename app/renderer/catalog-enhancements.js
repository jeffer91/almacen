/* Carga las mejoras comerciales existentes y el flujo sencillo sin mezclar las dos interfaces. */
"use strict";

(() => {
  if (window.__almacenEnhancementsLoader) return;
  window.__almacenEnhancementsLoader = true;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.getAttribute("src") === src);
      if (existing) return resolve();
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}.`)), { once: true });
      document.body.append(script);
    });
  }

  function applyRoleCompatibility() {
    const current = window.AlmacenShell?.getProfile?.() || null;
    const operator = Boolean(current && current.role !== "administrator");
    const workspace = document.getElementById("simple-catalog-workspace");
    const original = [
      document.querySelector("#catalog-screen .catalog-search-bar"),
      document.getElementById("catalog-message"),
      document.querySelector("#catalog-screen .catalog-layout"),
      document.getElementById("catalog-new-button")
    ];

    workspace?.classList.toggle("simple-hidden-original", !operator);
    original.forEach((element) => element?.classList.toggle("simple-hidden-original", operator));
    document.getElementById("catalog-home-button")?.classList.toggle("simple-hidden-original", operator);

    if (operator) {
      const title = document.getElementById("catalog-view-title");
      const subtitle = document.getElementById("catalog-view-subtitle");
      if (title) title.textContent = "Productos";
      if (subtitle) subtitle.textContent = "Busca y actualiza los datos del almacén de forma rápida.";
    }
  }

  async function initialize() {
    await loadScript("./commercial-enhancements.js");
    await loadScript("./simple-workflow.js");
    applyRoleCompatibility();
    document.addEventListener("almacen:screen-changed", () => {
      window.setTimeout(applyRoleCompatibility, 0);
    });
  }

  initialize().catch((error) => console.error("No se pudieron cargar las mejoras del catálogo:", error));
})();
