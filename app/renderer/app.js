/* =========================================================
Nombre completo: app.js
Ruta o ubicación: /app/renderer/app.js
Función o funciones:
- Gestionar configuración inicial, inicio y Administración.
- Activar los cuatro botones principales del catálogo.
- Mostrar base local y sincronización.
- Mantener la sesión administrativa protegida.
Con qué se conecta:
- app/preload/preload.js
- app/renderer/catalog.js
- app/renderer/preferences.js
- app/renderer/diagnostics.js
- app/renderer/backups.js
========================================================= */

"use strict";

(function initializeRenderer(window, document) {
  const state = {
    profiles: [],
    selectedProfileId: null,
    currentProfile: null,
    currentScreen: "loading",
    adminMode: "login",
    adminUnlocked: false,
    lastAdminTouchAt: 0,
    databaseSummary: null
  };

  const elements = {
    loadingScreen: document.getElementById("loading-screen"),
    setupScreen: document.getElementById("setup-screen"),
    homeScreen: document.getElementById("home-screen"),
    catalogScreen: document.getElementById("catalog-screen"),
    adminScreen: document.getElementById("admin-screen"),
    profileList: document.getElementById("profile-list"),
    appVersion: document.getElementById("app-version"),
    welcomeTitle: document.getElementById("welcome-title"),
    channelName: document.getElementById("channel-name"),
    localDbDot: document.getElementById("local-db-dot"),
    localDbTitle: document.getElementById("local-db-title"),
    localDbMessage: document.getElementById("local-db-message"),
    adminButton: document.getElementById("admin-button"),
    profileDialog: document.getElementById("confirmation-dialog"),
    profileDialogTitle: document.getElementById("dialog-title"),
    profileDialogMessage: document.getElementById("dialog-message"),
    confirmProfile: document.getElementById("confirm-profile"),
    adminDialog: document.getElementById("admin-dialog"),
    adminForm: document.getElementById("admin-form"),
    adminDialogEyebrow: document.getElementById("admin-dialog-eyebrow"),
    adminDialogTitle: document.getElementById("admin-dialog-title"),
    adminDialogMessage: document.getElementById("admin-dialog-message"),
    adminPasswordFields: document.getElementById("admin-password-fields"),
    adminPassword: document.getElementById("admin-password"),
    adminConfirmationField: document.getElementById("admin-confirmation-field"),
    adminConfirmation: document.getElementById("admin-confirmation"),
    showAdminPassword: document.getElementById("show-admin-password"),
    adminSecurityNote: document.getElementById("admin-security-note"),
    adminFormError: document.getElementById("admin-form-error"),
    adminCancelButton: document.getElementById("admin-cancel-button"),
    adminSubmitButton: document.getElementById("admin-submit-button"),
    adminBackButton: document.getElementById("admin-back-button"),
    adminLogoutButton: document.getElementById("admin-logout-button"),
    adminSessionText: document.getElementById("admin-session-text"),
    adminDeviceName: document.getElementById("admin-device-name"),
    adminDevicePlatform: document.getElementById("admin-device-platform"),
    adminProfileName: document.getElementById("admin-profile-name"),
    adminProfileChannel: document.getElementById("admin-profile-channel"),
    adminAppVersion: document.getElementById("admin-app-version"),
    adminDatabaseCard: document.getElementById("admin-database-card"),
    adminDatabaseStatus: document.getElementById("admin-database-status"),
    adminDatabaseBadge: document.getElementById("admin-database-badge"),
    adminDatabaseDetails: document.getElementById("admin-database-details"),
    adminDatabaseSchema: document.getElementById("admin-database-schema"),
    adminDatabaseTables: document.getElementById("admin-database-tables"),
    adminDatabaseSize: document.getElementById("admin-database-size"),
    adminDatabaseLastCheck: document.getElementById("admin-database-last-check"),
    adminDatabaseTestButton: document.getElementById("admin-database-test-button"),
    syncCard: document.getElementById("sync-card"),
    syncStatus: document.getElementById("sync-status"),
    syncBadge: document.getElementById("sync-badge"),
    syncDescription: document.getElementById("sync-description"),
    syncPending: document.getElementById("sync-pending"),
    syncPushed: document.getElementById("sync-pushed"),
    syncPulled: document.getElementById("sync-pulled"),
    syncLastSuccess: document.getElementById("sync-last-success"),
    syncRunButton: document.getElementById("sync-run-button"),
    toast: document.getElementById("toast")
  };

  function screens() {
    return [
      elements.loadingScreen,
      elements.setupScreen,
      elements.homeScreen,
      elements.catalogScreen,
      elements.adminScreen
    ];
  }

  function showScreen(screen, name) {
    screens().forEach((item) => item?.classList.toggle("hidden", item !== screen));
    state.currentScreen = name;
    document.dispatchEvent(new CustomEvent("almacen:screen-changed", { detail: { name } }));
  }

  function showToast(message, duration = 3400) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => elements.toast.classList.add("hidden"), duration);
  }

  function setAdminError(message) {
    elements.adminFormError.textContent = message || "";
    elements.adminFormError.classList.toggle("hidden", !message);
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return "—";
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function platformName(platform) {
    return { win32: "Windows", darwin: "macOS", linux: "Linux" }[platform] || platform || "Sistema no identificado";
  }

  function databaseVisualStatus(database) {
    if (database?.healthy) return { title: "Base local funcionando", message: `Esquema ${database.schemaVersion}. Datos guardados en esta computadora.`, badge: "Correcta", className: "healthy" };
    if (database?.status === "warning") return { title: "Base local con advertencias", message: "La información está disponible, pero debe revisarse el diagnóstico.", badge: "Advertencia", className: "warning" };
    if (database?.status === "error" || database?.startupError) return { title: "Problema con la base local", message: database.startupError?.message || "No se pudo comprobar la base local.", badge: "Error", className: "error" };
    return { title: "Base local pendiente", message: "Todavía no se ha completado la comprobación.", badge: "Pendiente", className: "neutral" };
  }

  function renderHomeDatabaseStatus(database) {
    state.databaseSummary = database || null;
    const visual = databaseVisualStatus(database);
    elements.localDbTitle.textContent = visual.title;
    elements.localDbMessage.textContent = visual.message;
    elements.localDbDot.className = `status-dot status-dot-${visual.className}`;
  }

  function renderAdminDatabase(database) {
    const diagnostic = database?.diagnostic || null;
    const visual = databaseVisualStatus(database);
    const tableCount = Array.isArray(diagnostic?.tables) ? diagnostic.tables.length : null;
    elements.adminDatabaseStatus.textContent = visual.title;
    elements.adminDatabaseDetails.textContent = database?.startupError?.message || (diagnostic?.healthy ? `Integridad correcta y modo ${String(diagnostic.journalMode || "WAL").toUpperCase()}.` : visual.message);
    elements.adminDatabaseSchema.textContent = database?.schemaVersion ? `v${database.schemaVersion}` : "—";
    elements.adminDatabaseTables.textContent = tableCount === null ? "—" : String(tableCount);
    elements.adminDatabaseSize.textContent = formatBytes(diagnostic?.fileSizeBytes);
    elements.adminDatabaseLastCheck.textContent = formatDateTime(diagnostic?.checkedAt || database?.lastCheckAt);
    elements.adminDatabaseBadge.textContent = visual.badge;
    elements.adminDatabaseBadge.className = `admin-state-badge admin-state-${visual.className}`;
    elements.adminDatabaseCard.dataset.status = visual.className;
    elements.adminDatabaseTestButton.disabled = !database?.initialized;
  }

  function renderSync(sync) {
    const running = Boolean(sync?.running || sync?.status === "running");
    const healthy = Boolean(sync?.lastSuccessAt && sync?.status !== "error");
    const error = sync?.status === "error";
    const className = error ? "error" : running ? "neutral" : healthy ? "healthy" : "warning";
    elements.syncStatus.textContent = error ? "Con error" : running ? "Sincronizando" : healthy ? "Conectada" : "Sin sincronización";
    elements.syncBadge.textContent = error ? "Error" : running ? "Trabajando" : healthy ? "Lista" : "Pendiente";
    elements.syncBadge.className = `admin-state-badge admin-state-${className}`;
    elements.syncCard.dataset.status = className;
    elements.syncDescription.textContent = error
      ? sync.lastError || "No se pudo conectar con Firebase."
      : healthy
        ? `Proyecto ${sync.projectId}. Los datos locales siguen siendo la base principal.`
        : "La app trabaja localmente. Usa Sincronizar ahora para compartir cambios.";
    elements.syncPending.textContent = String(sync?.pendingRecords || 0);
    elements.syncPushed.textContent = String(sync?.pushedRecords || 0);
    elements.syncPulled.textContent = String(sync?.pulledRecords || 0);
    elements.syncLastSuccess.textContent = formatDateTime(sync?.lastSuccessAt);
    elements.syncRunButton.disabled = running || !sync?.configured;
    elements.syncRunButton.textContent = running ? "Sincronizando…" : "Sincronizar ahora";
  }

  function renderProfiles() {
    elements.profileList.replaceChildren();
    state.profiles.forEach((profile) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-card";
      button.innerHTML = `<span class="profile-avatar" aria-hidden="true">${profile.displayName.slice(0, 1).toUpperCase()}</span><span class="profile-content"><strong>${profile.displayName}</strong><span>${profile.channelName}</span></span>`;
      button.addEventListener("click", () => {
        state.selectedProfileId = profile.id;
        elements.profileDialogTitle.textContent = `¿Guardar el perfil de ${profile.displayName}?`;
        elements.profileDialogMessage.textContent = `Esta computadora quedará asignada a ${profile.displayName} — ${profile.channelName}.`;
        elements.profileDialog.showModal();
      });
      elements.profileList.append(button);
    });
  }

  function renderHome(profile = state.currentProfile) {
    if (!profile) return;
    state.currentProfile = profile;
    elements.welcomeTitle.textContent = `Hola, ${profile.displayName}`;
    elements.channelName.textContent = profile.channelName;
    elements.adminButton.textContent = state.adminUnlocked ? "Administración abierta" : "Administración";
    showScreen(elements.homeScreen, "home");
  }

  async function refreshDatabaseSummary() {
    try {
      const response = await window.almacen.getDatabaseSummary();
      renderHomeDatabaseStatus(response.database || null);
      return response.database || null;
    } catch (error) {
      renderHomeDatabaseStatus({ status: "error", startupError: { message: "No se pudo leer el estado de la base local." } });
      return null;
    }
  }

  async function confirmSelectedProfile(event) {
    event.preventDefault();
    if (!state.selectedProfileId) return elements.profileDialog.close();
    elements.confirmProfile.disabled = true;
    elements.confirmProfile.textContent = "Guardando…";
    try {
      const profile = await window.almacen.saveProfile(state.selectedProfileId);
      elements.profileDialog.close();
      state.currentProfile = profile;
      await refreshDatabaseSummary();
      renderHome(profile);
      showToast("Perfil guardado correctamente.");
    } catch (error) {
      showToast("No se pudo guardar el perfil.", 5000);
    } finally {
      elements.confirmProfile.disabled = false;
      elements.confirmProfile.textContent = "Sí, guardar";
    }
  }

  function resetAdminForm() {
    elements.adminForm.reset();
    elements.adminPassword.type = "password";
    elements.adminConfirmation.type = "password";
    setAdminError("");
  }

  function configureAdminDialog(mode, status = {}) {
    state.adminMode = mode;
    resetAdminForm();
    const unavailable = ["unavailable", "locked", "damaged"].includes(mode);
    elements.adminPasswordFields.classList.toggle("hidden", unavailable);
    elements.adminConfirmationField.classList.toggle("hidden", mode !== "setup");
    elements.adminSecurityNote.classList.toggle("hidden", !unavailable && mode !== "setup");
    elements.adminSubmitButton.classList.toggle("hidden", unavailable);
    elements.adminCancelButton.textContent = unavailable ? "Cerrar" : "Volver";

    if (mode === "setup") {
      elements.adminDialogEyebrow.textContent = "Primera configuración administrativa";
      elements.adminDialogTitle.textContent = "Crear contraseña de Jefferson";
      elements.adminDialogMessage.textContent = "Esta contraseña protegerá el Centro de control.";
      elements.adminConfirmation.required = true;
      elements.adminSubmitButton.textContent = "Crear y entrar";
      elements.adminSecurityNote.textContent = "Usa al menos 8 caracteres.";
      elements.adminSecurityNote.classList.remove("hidden");
      return;
    }

    elements.adminConfirmation.required = false;
    if (mode === "login") {
      elements.adminDialogEyebrow.textContent = "Acceso protegido";
      elements.adminDialogTitle.textContent = "Ingresar a Administración";
      elements.adminDialogMessage.textContent = "Escribe la contraseña de Jefferson.";
      elements.adminSubmitButton.textContent = "Ingresar";
      return;
    }

    if (mode === "locked") {
      elements.adminDialogEyebrow.textContent = "Acceso bloqueado";
      elements.adminDialogTitle.textContent = "Espera antes de volver a intentar";
      elements.adminDialogMessage.textContent = "Se ingresaron varias contraseñas incorrectas.";
      elements.adminSecurityNote.textContent = status.lockedUntil ? `Podrás intentar después de ${formatDateTime(status.lockedUntil)}.` : "Intenta nuevamente en unos minutos.";
      return;
    }

    if (mode === "damaged") {
      elements.adminDialogEyebrow.textContent = "Configuración dañada";
      elements.adminDialogTitle.textContent = "No se puede abrir Administración";
      elements.adminDialogMessage.textContent = "La configuración local necesita revisión.";
      elements.adminSecurityNote.textContent = status.authDataErrorMessage || "Jefferson deberá reparar la configuración.";
      return;
    }

    elements.adminDialogEyebrow.textContent = "Configuración pendiente";
    elements.adminDialogTitle.textContent = "Administración aún no configurada";
    elements.adminDialogMessage.textContent = "La contraseña inicial solo se crea desde la computadora de Jefferson.";
    elements.adminSecurityNote.textContent = "Después podrá sincronizarse el estado con los otros equipos.";
  }

  async function openAdminAccess() {
    if (!state.currentProfile) return showToast("Primero elige quién utilizará esta computadora.");
    try {
      const response = await window.almacen.getAdminStatus();
      const status = response.status || {};
      state.adminUnlocked = Boolean(status.unlocked);
      if (status.authDataError) configureAdminDialog("damaged", status);
      else if (status.unlocked) return openAdminDashboard();
      else if (status.locked) configureAdminDialog("locked", status);
      else if (!status.configured) configureAdminDialog(status.canInitialize ? "setup" : "unavailable", status);
      else configureAdminDialog("login", status);
      elements.adminDialog.showModal();
      if (["setup", "login"].includes(state.adminMode)) elements.adminPassword.focus();
    } catch (error) {
      showToast("No se pudo abrir Administración.", 5000);
    }
  }

  async function submitAdminForm(event) {
    event.preventDefault();
    setAdminError("");
    if (!["setup", "login"].includes(state.adminMode)) return;
    const normalLabel = state.adminMode === "setup" ? "Crear y entrar" : "Ingresar";
    elements.adminSubmitButton.disabled = true;
    elements.adminSubmitButton.textContent = "Verificando…";
    try {
      const response = state.adminMode === "setup"
        ? await window.almacen.setupAdminPassword(elements.adminPassword.value, elements.adminConfirmation.value)
        : await window.almacen.loginAdmin(elements.adminPassword.value);
      if (!response.ok) {
        if (response.status?.locked) configureAdminDialog("locked", response.status);
        else setAdminError(response.message || "No se pudo ingresar.");
        return;
      }
      state.adminUnlocked = true;
      elements.adminDialog.close();
      await openAdminDashboard();
    } catch (error) {
      setAdminError("No se pudo verificar el acceso.");
    } finally {
      elements.adminSubmitButton.disabled = false;
      elements.adminSubmitButton.textContent = normalLabel;
    }
  }

  async function openAdminDashboard() {
    try {
      const response = await window.almacen.getAdminDashboard();
      if (!response.ok) {
        state.adminUnlocked = false;
        renderHome();
        return showToast(response.message || "La sesión administrativa terminó.", 5000);
      }
      const dashboard = response.dashboard;
      const profile = dashboard.profile || state.currentProfile;
      state.adminUnlocked = true;
      state.lastAdminTouchAt = Date.now();
      elements.adminDeviceName.textContent = dashboard.deviceName || "Equipo actual";
      elements.adminDevicePlatform.textContent = platformName(dashboard.platform);
      elements.adminProfileName.textContent = profile?.displayName || "Sin perfil";
      elements.adminProfileChannel.textContent = profile?.channelName || "Sin canal";
      elements.adminAppVersion.textContent = dashboard.appVersion || "—";
      elements.adminSessionText.textContent = dashboard.session?.expiresAt ? `Activa hasta ${formatDateTime(dashboard.session.expiresAt)} si no hay actividad.` : "Se cerrará después de 15 minutos sin actividad.";
      elements.adminButton.textContent = "Administración abierta";
      renderAdminDatabase(dashboard.database || null);
      renderHomeDatabaseStatus(dashboard.database || null);
      renderSync(dashboard.synchronization || {});
      showScreen(elements.adminScreen, "admin");
    } catch (error) {
      state.adminUnlocked = false;
      renderHome();
      showToast("No se pudo cargar Administración.", 5000);
    }
  }

  async function runDatabaseDiagnostic() {
    elements.adminDatabaseTestButton.disabled = true;
    elements.adminDatabaseTestButton.textContent = "Probando…";
    try {
      const response = await window.almacen.runDatabaseDiagnostic();
      if (!response.ok) return showToast(response.message || "No se pudo probar la base local.", 5000);
      renderAdminDatabase(response.database);
      renderHomeDatabaseStatus(response.database);
      showToast(response.diagnostic?.healthy ? "La base local funciona correctamente." : "La prueba terminó con advertencias.");
    } finally {
      elements.adminDatabaseTestButton.disabled = false;
      elements.adminDatabaseTestButton.textContent = "Probar base local";
    }
  }

  async function runSync() {
    elements.syncRunButton.disabled = true;
    elements.syncRunButton.textContent = "Sincronizando…";
    try {
      const response = await window.almacen.runSync();
      renderSync(response.status || response.synchronization || {});
      showToast(response.ok ? "Sincronización completada." : response.message || "No se pudo sincronizar.", 5000);
    } catch (error) {
      showToast("No se pudo sincronizar.", 5000);
    } finally {
      try {
        const status = await window.almacen.getSyncStatus();
        renderSync(status.synchronization || {});
      } catch {}
    }
  }

  async function logoutAdmin() {
    elements.adminLogoutButton.disabled = true;
    try {
      await window.almacen.logoutAdmin();
      state.adminUnlocked = false;
      renderHome();
      showToast("Administración cerrada correctamente.");
    } finally {
      elements.adminLogoutButton.disabled = false;
    }
  }

  async function touchAdminSession() {
    if (!state.adminUnlocked || state.currentScreen !== "admin") return;
    const now = Date.now();
    if (now - state.lastAdminTouchAt < 60_000) return;
    state.lastAdminTouchAt = now;
    try {
      const response = await window.almacen.touchAdminSession();
      if (!response.status?.unlocked) {
        state.adminUnlocked = false;
        renderHome();
        showToast("La sesión administrativa terminó por inactividad.", 5000);
      }
    } catch {}
  }

  async function checkAdminSession() {
    if (!state.adminUnlocked) return;
    try {
      const response = await window.almacen.getAdminStatus();
      if (!response.status?.unlocked && state.currentScreen === "admin") {
        state.adminUnlocked = false;
        renderHome();
        showToast("La sesión administrativa terminó por inactividad.", 5000);
      }
    } catch {}
  }

  function bindEvents() {
    elements.confirmProfile.addEventListener("click", confirmSelectedProfile);
    elements.adminButton.addEventListener("click", openAdminAccess);
    elements.adminForm.addEventListener("submit", submitAdminForm);
    elements.adminCancelButton.addEventListener("click", () => { elements.adminDialog.close(); resetAdminForm(); });
    elements.showAdminPassword.addEventListener("change", () => {
      const type = elements.showAdminPassword.checked ? "text" : "password";
      elements.adminPassword.type = type;
      elements.adminConfirmation.type = type;
    });
    elements.adminBackButton.addEventListener("click", () => renderHome());
    elements.adminLogoutButton.addEventListener("click", logoutAdmin);
    elements.adminDatabaseTestButton.addEventListener("click", runDatabaseDiagnostic);
    elements.syncRunButton.addEventListener("click", runSync);

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (window.AlmacenCatalog?.open) window.AlmacenCatalog.open(action);
        else showToast("El catálogo todavía está iniciando.");
      });
    });

    ["pointerdown", "keydown"].forEach((eventName) => document.addEventListener(eventName, touchAdminSession, { passive: true }));
    window.setInterval(checkAdminSession, 30_000);
  }

  async function start() {
    bindEvents();
    if (!window.almacen) return showToast("No se pudo iniciar la comunicación segura.", 6000);
    try {
      const [appInfo, profiles, currentProfile, adminResponse, databaseResponse] = await Promise.all([
        window.almacen.getAppInfo(),
        window.almacen.listProfiles(),
        window.almacen.getProfile(),
        window.almacen.getAdminStatus(),
        window.almacen.getDatabaseSummary()
      ]);
      elements.appVersion.textContent = `Versión ${appInfo.version}`;
      state.profiles = profiles;
      state.adminUnlocked = Boolean(adminResponse.status?.unlocked);
      renderHomeDatabaseStatus(databaseResponse.database || null);
      if (currentProfile) {
        state.currentProfile = currentProfile;
        renderHome(currentProfile);
      } else {
        renderProfiles();
        showScreen(elements.setupScreen, "setup");
      }
    } catch (error) {
      showToast("No se pudo iniciar la aplicación. Ciérrala y vuelve a abrirla.", 6000);
    }
  }

  window.AlmacenShell = Object.freeze({
    showHome: () => renderHome(),
    showCatalog: () => showScreen(elements.catalogScreen, "catalog"),
    showToast,
    getProfile: () => state.currentProfile,
    getCurrentScreen: () => state.currentScreen
  });

  start();
})(window, document);
