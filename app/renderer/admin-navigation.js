/* =========================================================
Nombre completo: admin-navigation.js
Ruta o ubicación: /app/renderer/admin-navigation.js
Función o funciones:
- Convertir Administración en una interfaz con menú lateral.
- Mostrar una sola sección administrativa a la vez.
- Mantener indicadores rápidos de base, sincronización, diagnóstico y respaldos.
- Resumir errores técnicos de Firebase sin ocultar su detalle.
- Adaptar la navegación a pantallas pequeñas.
Con qué se conecta:
- app/renderer/index.html
- app/renderer/app.js
- app/renderer/diagnostics.js
- app/renderer/backups.js
========================================================= */

"use strict";

const ADMIN_SECTIONS = Object.freeze([
  { id: "summary", label: "Resumen", icon: "⌂", title: "Resumen general", description: "Estado rápido del equipo y de los servicios principales." },
  { id: "equipment", label: "Equipo", icon: "▣", title: "Equipo y perfil", description: "Identidad de esta computadora y preferencias de uso." },
  { id: "database", label: "Base local", icon: "◉", title: "Base local SQLite", description: "Integridad, esquema y tamaño de la información guardada en este equipo." },
  { id: "connections", label: "Conexiones", icon: "⚙", title: "Conexiones externas", description: "Configuración de Firebase, Supabase y Google Sheets." },
  { id: "sync", label: "Sincronización", icon: "↻", title: "Sincronización Firebase", description: "Envío y recepción de cambios entre las computadoras." },
  { id: "diagnostics", label: "Diagnóstico", icon: "✓", title: "Diagnóstico general", description: "Comprobación de la aplicación, la base y las pantallas." },
  { id: "backups", label: "Respaldos", icon: "▤", title: "Respaldos locales", description: "Copias verificables de la base SQLite de esta computadora." }
]);

function summarizeSyncError(message) {
  const raw = String(message || "").trim();
  if (!raw) return null;

  if (/CONSUMER_SUSPENDED|has been suspended|consumer.+suspended/i.test(raw)) {
    return {
      title: "Proyecto Firebase suspendido",
      message: "Google suspendió el proyecto almacen-59227. La app seguirá funcionando con la base local, pero no podrá compartir cambios hasta reactivar o reemplazar ese proyecto.",
      technical: raw
    };
  }

  if (/PERMISSION_DENIED|permission denied|\b403\b/i.test(raw)) {
    return {
      title: "Firebase rechazó el acceso",
      message: "La base local funciona, pero Firebase no permite sincronizar. Revisa el proyecto y sus reglas de acceso.",
      technical: raw
    };
  }

  if (/Failed to fetch|network|ENOTFOUND|ECONNREFUSED|sin conexión/i.test(raw)) {
    return {
      title: "Sin conexión con Firebase",
      message: "No se pudo contactar con Firebase. Los datos permanecen guardados en esta computadora y podrán sincronizarse después.",
      technical: raw
    };
  }

  if (raw.length > 220 || raw.includes("{\"error\"") || raw.includes('"error":')) {
    return {
      title: "Error de sincronización",
      message: "Firebase devolvió un error técnico. La base local continúa disponible.",
      technical: raw
    };
  }

  return null;
}

function initializeAdminNavigation(window, document) {
  const screen = document.getElementById("admin-screen");
  if (!screen || screen.dataset.navigationReady === "true") return;

  const pageHeader = screen.querySelector(".admin-page-header");
  const sessionBanner = screen.querySelector(".admin-session-banner");
  const originalGrid = screen.querySelector(".admin-grid");
  const connectionsPanel = document.getElementById("connections-panel");
  const diagnosticsPanel = document.getElementById("diagnostics-panel");
  const backupsPanel = document.getElementById("backups-panel");
  const backButton = document.getElementById("admin-back-button");
  const logoutButton = document.getElementById("admin-logout-button");

  if (!pageHeader || !sessionBanner || !originalGrid || !connectionsPanel || !diagnosticsPanel || !backupsPanel || !backButton || !logoutButton) return;

  const originalCards = Array.from(originalGrid.children);
  const [deviceCard, profileCard, versionCard, preferencesCard, databaseCard, syncCard] = originalCards;
  if (!deviceCard || !profileCard || !versionCard || !preferencesCard || !databaseCard || !syncCard) return;

  screen.dataset.navigationReady = "true";
  screen.classList.add("admin-navigation-ready");
  screen.setAttribute("aria-labelledby", "admin-navigation-title");

  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === "string") element.textContent = text;
    return element;
  };

  const layout = create("div", "admin-layout");
  const sidebar = create("aside", "admin-sidebar");
  sidebar.setAttribute("aria-label", "Menú de Administración");
  const workspace = create("div", "admin-workspace");
  const backdrop = create("button", "admin-sidebar-backdrop");
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Cerrar menú de Administración");

  const sidebarBrand = create("div", "admin-sidebar-brand");
  const sidebarMark = create("span", "admin-sidebar-mark", "AF");
  sidebarMark.setAttribute("aria-hidden", "true");
  const sidebarBrandText = create("div", "admin-sidebar-brand-text");
  sidebarBrandText.append(create("strong", "", "Administración"), create("span", "", "Centro de control"));
  sidebarBrand.append(sidebarMark, sidebarBrandText);

  const sidebarProfile = create("div", "admin-sidebar-profile");
  const sidebarProfileLabel = create("span", "", "Sesión activa");
  const sidebarProfileName = create("strong", "", "Jefferson");
  const sidebarProfileChannel = create("span", "", "Tienda virtual");
  sidebarProfile.append(sidebarProfileLabel, sidebarProfileName, sidebarProfileChannel);

  const navigation = create("nav", "admin-sidebar-nav");
  const navButtons = new Map();
  const navDots = new Map();

  ADMIN_SECTIONS.forEach((section) => {
    const button = create("button", "admin-nav-button");
    button.type = "button";
    button.dataset.adminTarget = section.id;
    const icon = create("span", "admin-nav-icon", section.icon);
    icon.setAttribute("aria-hidden", "true");
    const label = create("span", "admin-nav-label", section.label);
    button.append(icon, label);
    if (["database", "connections", "sync", "diagnostics", "backups"].includes(section.id)) {
      const dot = create("span", "admin-nav-status admin-nav-status-neutral");
      dot.setAttribute("aria-hidden", "true");
      button.append(dot);
      navDots.set(section.id, dot);
    }
    navigation.append(button);
    navButtons.set(section.id, button);
  });

  const sidebarFooter = create("div", "admin-sidebar-footer");
  backButton.classList.add("admin-sidebar-action");
  logoutButton.classList.add("admin-sidebar-action");
  backButton.textContent = "Volver al inicio";
  logoutButton.textContent = "Cerrar administración";
  sidebarFooter.append(backButton, logoutButton);
  sidebar.append(sidebarBrand, sidebarProfile, navigation, sidebarFooter);

  const compactHeader = create("header", "admin-content-header");
  const menuToggle = create("button", "admin-menu-toggle");
  menuToggle.type = "button";
  menuToggle.setAttribute("aria-label", "Abrir menú de Administración");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.textContent = "☰";
  const headingText = create("div", "admin-content-heading");
  const headingEyebrow = create("p", "eyebrow", "Centro de control");
  const headingTitle = create("h1", "", "Resumen general");
  headingTitle.id = "admin-navigation-title";
  headingTitle.tabIndex = -1;
  const headingDescription = create("p", "lead", "Estado rápido del equipo y de los servicios principales.");
  headingText.append(headingEyebrow, headingTitle, headingDescription);
  compactHeader.append(menuToggle, headingText);

  const sectionsContainer = create("div", "admin-sections");
  const sectionElements = new Map();

  const createSection = (definition) => {
    const section = create("section", "admin-section");
    section.dataset.adminSection = definition.id;
    section.setAttribute("aria-labelledby", `admin-section-title-${definition.id}`);
    const header = create("div", "admin-section-heading");
    const text = create("div");
    const eyebrow = create("p", "admin-card-label", definition.label);
    const title = create("h2", "", definition.title);
    title.id = `admin-section-title-${definition.id}`;
    const description = create("p", "", definition.description);
    text.append(eyebrow, title, description);
    header.append(text);
    section.append(header);
    sectionElements.set(definition.id, section);
    sectionsContainer.append(section);
    return section;
  };

  const summarySection = createSection(ADMIN_SECTIONS[0]);
  const equipmentSection = createSection(ADMIN_SECTIONS[1]);
  const databaseSection = createSection(ADMIN_SECTIONS[2]);
  const connectionsSection = createSection(ADMIN_SECTIONS[3]);
  const syncSection = createSection(ADMIN_SECTIONS[4]);
  const diagnosticsSection = createSection(ADMIN_SECTIONS[5]);
  const backupsSection = createSection(ADMIN_SECTIONS[6]);

  summarySection.append(sessionBanner);

  const summaryFacts = create("div", "admin-summary-facts");
  const factDefinitions = [
    { label: "Equipo", source: "admin-device-name", fallback: "Equipo actual" },
    { label: "Perfil", source: "admin-profile-name", fallback: "Jefferson" },
    { label: "Versión", source: "admin-app-version", fallback: "—" }
  ];
  const factValues = new Map();
  factDefinitions.forEach((fact) => {
    const card = create("article", "admin-summary-fact");
    const label = create("span", "", fact.label);
    const value = create("strong", "", fact.fallback);
    card.append(label, value);
    summaryFacts.append(card);
    factValues.set(fact.source, value);
  });
  summarySection.append(summaryFacts);

  const statusOverview = create("div", "admin-status-overview");
  const overviewDefinitions = [
    { id: "database", label: "Base local", badgeId: "admin-database-badge" },
    { id: "connections", label: "Conexiones", badgeId: "connections-badge" },
    { id: "sync", label: "Sincronización", badgeId: "sync-badge" },
    { id: "diagnostics", label: "Diagnóstico", badgeId: "diagnostics-overall-badge" },
    { id: "backups", label: "Respaldos", badgeId: "backups-badge" }
  ];
  const overviewValues = new Map();
  overviewDefinitions.forEach((item) => {
    const button = create("button", "admin-status-item");
    button.type = "button";
    button.dataset.adminTarget = item.id;
    const label = create("span", "", item.label);
    const value = create("strong", "", "Pendiente");
    const arrow = create("span", "admin-status-arrow", "›");
    arrow.setAttribute("aria-hidden", "true");
    button.append(label, value, arrow);
    statusOverview.append(button);
    overviewValues.set(item.badgeId, value);
  });
  summarySection.append(statusOverview);

  const equipmentGrid = create("div", "admin-equipment-grid");
  equipmentGrid.append(deviceCard, profileCard, versionCard, preferencesCard);
  equipmentSection.append(equipmentGrid);
  databaseSection.append(databaseCard);
  connectionsSection.append(connectionsPanel);
  syncSection.append(syncCard);
  diagnosticsSection.append(diagnosticsPanel);
  backupsSection.append(backupsPanel);

  const technicalDetails = create("details", "admin-technical-details");
  technicalDetails.hidden = true;
  const technicalSummary = create("summary", "", "Ver detalle técnico");
  const technicalText = create("pre", "");
  technicalDetails.append(technicalSummary, technicalText);
  syncCard.append(technicalDetails);

  pageHeader.remove();
  originalGrid.remove();
  workspace.append(compactHeader, sectionsContainer);
  layout.append(sidebar, workspace);
  screen.replaceChildren(layout, backdrop);

  let activeSection = "summary";

  function closeMobileMenu() {
    document.body.classList.remove("admin-nav-open");
    menuToggle.setAttribute("aria-expanded", "false");
  }

  function activateSection(id, { focus = false } = {}) {
    const definition = ADMIN_SECTIONS.find((item) => item.id === id) || ADMIN_SECTIONS[0];
    activeSection = definition.id;
    sectionElements.forEach((section, sectionId) => {
      section.hidden = sectionId !== activeSection;
    });
    navButtons.forEach((button, sectionId) => {
      const selected = sectionId === activeSection;
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    headingTitle.textContent = definition.title;
    headingDescription.textContent = definition.description;
    closeMobileMenu();
    if (focus) headingTitle.focus?.();
    document.dispatchEvent(new CustomEvent("almacen:admin-section-changed", { detail: { id: activeSection } }));
  }

  function statusClassFromElement(element) {
    const className = element?.className || "";
    const parentStatus = element?.closest?.("[data-status]")?.dataset?.status;
    if (/error/.test(className) || parentStatus === "error") return "error";
    if (/healthy/.test(className) || parentStatus === "healthy") return "healthy";
    if (/warning/.test(className) || parentStatus === "warning") return "warning";
    return "neutral";
  }

  function updateStatusIndicator(sectionId, badgeId) {
    const badge = document.getElementById(badgeId);
    const value = overviewValues.get(badgeId);
    const dot = navDots.get(sectionId);
    if (!badge || !value || !dot) return;
    const status = statusClassFromElement(badge);
    value.textContent = badge.textContent?.trim() || "Pendiente";
    value.dataset.status = status;
    dot.className = `admin-nav-status admin-nav-status-${status}`;
  }

  function mirrorFact(sourceId) {
    const source = document.getElementById(sourceId);
    const target = factValues.get(sourceId);
    if (!source || !target) return;
    target.textContent = source.textContent?.trim() || "—";
  }

  let processingSyncError = false;
  function renderFriendlySyncError() {
    if (processingSyncError) return;
    const description = document.getElementById("sync-description");
    const status = document.getElementById("sync-status");
    if (!description || !status) return;
    const summary = summarizeSyncError(description.textContent);
    if (!summary) {
      if (!description.dataset.technicalError) technicalDetails.hidden = true;
      return;
    }

    processingSyncError = true;
    description.dataset.technicalError = summary.technical;
    technicalText.textContent = summary.technical;
    technicalDetails.hidden = false;
    status.textContent = summary.title;
    description.textContent = summary.message;
    window.queueMicrotask(() => { processingSyncError = false; });
  }

  function refreshMirrors() {
    factDefinitions.forEach((fact) => mirrorFact(fact.source));
    overviewDefinitions.forEach((item) => updateStatusIndicator(item.id, item.badgeId));
    const profileName = document.getElementById("admin-profile-name")?.textContent?.trim();
    const profileChannel = document.getElementById("admin-profile-channel")?.textContent?.trim();
    if (profileName) sidebarProfileName.textContent = profileName;
    if (profileChannel) sidebarProfileChannel.textContent = profileChannel;
    renderFriendlySyncError();
  }

  const observedIds = [
    ...factDefinitions.map((fact) => fact.source),
    ...overviewDefinitions.map((item) => item.badgeId),
    "admin-profile-channel",
    "sync-description",
    "sync-status"
  ];

  observedIds.forEach((id) => {
    const target = document.getElementById(id);
    if (!target) return;
    new MutationObserver(refreshMirrors).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  });

  screen.querySelectorAll("[data-admin-target]").forEach((button) => {
    button.addEventListener("click", () => activateSection(button.dataset.adminTarget));
  });
  menuToggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("admin-nav-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  backdrop.addEventListener("click", closeMobileMenu);
  window.addEventListener("resize", () => {
    if (window.innerWidth > 920) closeMobileMenu();
  });

  document.addEventListener("almacen:screen-changed", (event) => {
    const isAdmin = event.detail?.name === "admin";
    document.body.classList.toggle("admin-view-active", isAdmin);
    if (isAdmin) {
      activateSection("summary");
      refreshMirrors();
    } else {
      closeMobileMenu();
    }
  });

  if (window.AlmacenShell?.getCurrentScreen?.() === "admin") {
    document.body.classList.add("admin-view-active");
  }

  activateSection("summary");
  refreshMirrors();

  window.AlmacenAdminNavigation = Object.freeze({
    open: (id) => activateSection(id),
    getActiveSection: () => activeSection,
    refresh: refreshMirrors
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ADMIN_SECTIONS, summarizeSyncError };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initializeAdminNavigation(window, document);
}
