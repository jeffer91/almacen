/* =========================================================
Nombre completo: app.js
Ruta o ubicación: /app/renderer/app.js
Función o funciones:
- Cargar el perfil configurado en la computadora.
- Mostrar la selección inicial de Edgar, Gloria o Jefferson.
- Guardar el perfil elegido mediante la API segura de Electron.
- Presentar la pantalla principal adaptada al usuario.
- Gestionar el acceso administrativo, la sesión y el cierre por inactividad.
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
    lastAdminTouchAt: 0
  };

  const elements = {
    loadingScreen: document.getElementById("loading-screen"),
    setupScreen: document.getElementById("setup-screen"),
    homeScreen: document.getElementById("home-screen"),
    adminScreen: document.getElementById("admin-screen"),
    profileList: document.getElementById("profile-list"),
    appVersion: document.getElementById("app-version"),
    welcomeTitle: document.getElementById("welcome-title"),
    channelName: document.getElementById("channel-name"),
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
    toast: document.getElementById("toast")
  };

  function allScreens() {
    return [
      elements.loadingScreen,
      elements.setupScreen,
      elements.homeScreen,
      elements.adminScreen
    ];
  }

  function showScreen(screen, name) {
    allScreens().forEach((item) => {
      item.classList.toggle("hidden", item !== screen);
    });

    state.currentScreen = name;
  }

  function showToast(message, duration = 3200) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");

    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.classList.add("hidden");
    }, duration);
  }

  function setAdminError(message) {
    elements.adminFormError.textContent = message || "";
    elements.adminFormError.classList.toggle("hidden", !message);
  }

  function setAdminBusy(busy, label) {
    elements.adminSubmitButton.disabled = busy;
    elements.adminCancelButton.disabled = busy;
    elements.adminSubmitButton.textContent = busy ? "Verificando…" : label;
  }

  function profileInitials(profile) {
    return profile.displayName.slice(0, 1).toUpperCase();
  }

  function renderProfiles() {
    elements.profileList.replaceChildren();

    state.profiles.forEach((profile) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-card";
      button.dataset.profileId = profile.id;
      button.setAttribute("aria-label", `Elegir a ${profile.displayName}, ${profile.channelName}`);

      const avatar = document.createElement("span");
      avatar.className = "profile-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = profileInitials(profile);

      const content = document.createElement("span");
      content.className = "profile-content";

      const name = document.createElement("strong");
      name.textContent = profile.displayName;

      const channel = document.createElement("span");
      channel.textContent = profile.channelName;

      content.append(name, channel);
      button.append(avatar, content);
      button.addEventListener("click", () => openProfileConfirmation(profile.id));
      elements.profileList.append(button);
    });
  }

  function openProfileConfirmation(profileId) {
    const profile = state.profiles.find((item) => item.id === profileId);
    if (!profile) {
      showToast("No fue posible seleccionar ese perfil.");
      return;
    }

    state.selectedProfileId = profileId;
    elements.profileDialogTitle.textContent = `¿Guardar el perfil de ${profile.displayName}?`;
    elements.profileDialogMessage.textContent =
      `Esta computadora quedará asignada a ${profile.displayName} — ${profile.channelName}.`;
    elements.profileDialog.showModal();
  }

  function renderHome(profile = state.currentProfile) {
    if (!profile) {
      return;
    }

    state.currentProfile = profile;
    elements.welcomeTitle.textContent = `Hola, ${profile.displayName}`;
    elements.channelName.textContent = profile.channelName;
    elements.adminButton.textContent = "Administración";
    showScreen(elements.homeScreen, "home");
  }

  async function confirmSelectedProfile(event) {
    event.preventDefault();

    if (!state.selectedProfileId) {
      elements.profileDialog.close();
      return;
    }

    elements.confirmProfile.disabled = true;
    elements.confirmProfile.textContent = "Guardando…";

    try {
      const profile = await window.almacen.saveProfile(state.selectedProfileId);
      elements.profileDialog.close();
      state.currentProfile = profile;
      renderHome(profile);
      showToast("Perfil guardado correctamente.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo guardar el perfil. Intenta nuevamente.", 5000);
    } finally {
      elements.confirmProfile.disabled = false;
      elements.confirmProfile.textContent = "Sí, guardar";
    }
  }

  function formatDateTime(isoDate) {
    if (!isoDate) {
      return "";
    }

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function platformName(platform) {
    const names = {
      win32: "Windows",
      darwin: "macOS",
      linux: "Linux"
    };

    return names[platform] || platform || "Sistema no identificado";
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
    elements.adminCancelButton.disabled = false;
    elements.adminSubmitButton.disabled = false;

    elements.adminPasswordFields.classList.toggle(
      "hidden",
      mode === "unavailable" || mode === "locked" || mode === "damaged"
    );
    elements.adminConfirmationField.classList.toggle("hidden", mode !== "setup");
    elements.adminSecurityNote.classList.add("hidden");
    elements.adminSubmitButton.classList.remove("hidden");
    elements.adminCancelButton.textContent = "Volver";

    if (mode === "setup") {
      elements.adminDialogEyebrow.textContent = "Primera configuración administrativa";
      elements.adminDialogTitle.textContent = "Crear contraseña de Jefferson";
      elements.adminDialogMessage.textContent =
        "Esta contraseña protegerá el Centro de control en esta computadora.";
      elements.adminPassword.autocomplete = "new-password";
      elements.adminConfirmation.required = true;
      elements.adminSubmitButton.textContent = "Crear y entrar";
      elements.adminSecurityNote.textContent =
        "Usa al menos 8 caracteres. La contraseña no se guardará como texto visible.";
      elements.adminSecurityNote.classList.remove("hidden");
      return;
    }

    elements.adminConfirmation.required = false;
    elements.adminPassword.autocomplete = "current-password";

    if (mode === "login") {
      elements.adminDialogEyebrow.textContent = "Acceso protegido";
      elements.adminDialogTitle.textContent = "Ingresar a Administración";
      elements.adminDialogMessage.textContent = "Escribe la contraseña de Jefferson.";
      elements.adminSubmitButton.textContent = "Ingresar";
      return;
    }

    elements.adminSubmitButton.classList.add("hidden");
    elements.adminCancelButton.textContent = "Cerrar";
    elements.adminSecurityNote.classList.remove("hidden");

    if (mode === "locked") {
      elements.adminDialogEyebrow.textContent = "Acceso temporalmente bloqueado";
      elements.adminDialogTitle.textContent = "Espera antes de volver a intentar";
      elements.adminDialogMessage.textContent =
        "Se ingresaron varias contraseñas incorrectas.";
      elements.adminSecurityNote.textContent = status.lockedUntil
        ? `Podrás volver a intentarlo después de ${formatDateTime(status.lockedUntil)}.`
        : "Podrás volver a intentarlo dentro de unos minutos.";
      return;
    }

    if (mode === "damaged") {
      elements.adminDialogEyebrow.textContent = "Configuración dañada";
      elements.adminDialogTitle.textContent = "No se puede abrir Administración";
      elements.adminDialogMessage.textContent =
        "La configuración administrativa local necesita revisión.";
      elements.adminSecurityNote.textContent =
        status.authDataErrorMessage || "Jefferson deberá reparar la configuración local.";
      return;
    }

    elements.adminDialogEyebrow.textContent = "Configuración pendiente";
    elements.adminDialogTitle.textContent = "Administración aún no configurada";
    elements.adminDialogMessage.textContent =
      "La contraseña inicial solo se crea desde la computadora configurada como Jefferson.";
    elements.adminSecurityNote.textContent =
      "En una etapa posterior, la credencial administrativa se distribuirá de forma segura a los otros equipos mediante sincronización.";
  }

  async function openAdminAccess() {
    if (!state.currentProfile) {
      showToast("Primero elige quién utilizará esta computadora.", 4200);
      return;
    }

    try {
      const response = await window.almacen.getAdminStatus();
      const status = response.status || {};
      state.adminUnlocked = Boolean(status.unlocked);

      if (status.authDataError) {
        configureAdminDialog("damaged", status);
        elements.adminDialog.showModal();
        return;
      }

      if (status.unlocked) {
        await openAdminDashboard();
        return;
      }

      if (status.locked) {
        configureAdminDialog("locked", status);
        elements.adminDialog.showModal();
        return;
      }

      if (!status.configured) {
        configureAdminDialog(status.canInitialize ? "setup" : "unavailable", status);
        elements.adminDialog.showModal();
        if (status.canInitialize) {
          elements.adminPassword.focus();
        }
        return;
      }

      configureAdminDialog("login", status);
      elements.adminDialog.showModal();
      elements.adminPassword.focus();
    } catch (error) {
      console.error(error);
      showToast("No se pudo abrir el acceso administrativo.", 5000);
    }
  }

  async function submitAdminForm(event) {
    event.preventDefault();
    setAdminError("");

    if (state.adminMode !== "setup" && state.adminMode !== "login") {
      return;
    }

    const normalLabel = state.adminMode === "setup" ? "Crear y entrar" : "Ingresar";
    setAdminBusy(true, normalLabel);

    try {
      const password = elements.adminPassword.value;
      let response;

      if (state.adminMode === "setup") {
        response = await window.almacen.setupAdminPassword(
          password,
          elements.adminConfirmation.value
        );
      } else {
        response = await window.almacen.loginAdmin(password);
      }

      if (!response.ok) {
        const status = response.status || {};

        if (status.locked) {
          configureAdminDialog("locked", status);
          return;
        }

        const attemptsText =
          response.code === "INVALID_PASSWORD" && Number.isInteger(status.attemptsRemaining)
            ? ` Intentos disponibles: ${status.attemptsRemaining}.`
            : "";

        setAdminError(`${response.message || "No se pudo ingresar."}${attemptsText}`);
        elements.adminPassword.select();
        return;
      }

      state.adminUnlocked = true;
      elements.adminDialog.close();
      resetAdminForm();
      await openAdminDashboard();
    } catch (error) {
      console.error(error);
      setAdminError("No se pudo verificar el acceso. Intenta nuevamente.");
    } finally {
      if (state.adminMode === "setup" || state.adminMode === "login") {
        setAdminBusy(false, normalLabel);
      }
    }
  }

  async function openAdminDashboard() {
    try {
      const response = await window.almacen.getAdminDashboard();

      if (!response.ok) {
        state.adminUnlocked = false;
        renderHome();
        showToast(response.message || "La sesión administrativa terminó.", 5000);
        return;
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
      elements.adminSessionText.textContent = dashboard.session?.expiresAt
        ? `Activa hasta ${formatDateTime(dashboard.session.expiresAt)} si no hay actividad.`
        : "Se cerrará después de 15 minutos sin actividad.";
      elements.adminButton.textContent = "Administración abierta";
      showScreen(elements.adminScreen, "admin");
    } catch (error) {
      console.error(error);
      state.adminUnlocked = false;
      renderHome();
      showToast("No se pudo cargar el Centro de control.", 5000);
    }
  }

  async function logoutAdmin() {
    elements.adminLogoutButton.disabled = true;

    try {
      await window.almacen.logoutAdmin();
      state.adminUnlocked = false;
      renderHome();
      showToast("Administración cerrada correctamente.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo cerrar la sesión administrativa.", 5000);
    } finally {
      elements.adminLogoutButton.disabled = false;
    }
  }

  async function touchAdminSession() {
    if (!state.adminUnlocked || state.currentScreen !== "admin") {
      return;
    }

    const now = Date.now();
    if (now - state.lastAdminTouchAt < 60_000) {
      return;
    }

    state.lastAdminTouchAt = now;

    try {
      const response = await window.almacen.touchAdminSession();
      const status = response.status || {};

      if (!status.unlocked) {
        state.adminUnlocked = false;
        renderHome();
        showToast("La sesión administrativa terminó por inactividad.", 5000);
        return;
      }

      elements.adminSessionText.textContent = status.expiresAt
        ? `Activa hasta ${formatDateTime(status.expiresAt)} si no hay actividad.`
        : "Se cerrará después de 15 minutos sin actividad.";
    } catch (error) {
      console.error("No fue posible extender la sesión administrativa:", error);
    }
  }

  async function checkAdminSession() {
    if (!state.adminUnlocked) {
      return;
    }

    try {
      const response = await window.almacen.getAdminStatus();
      const status = response.status || {};

      if (!status.unlocked) {
        state.adminUnlocked = false;

        if (state.currentScreen === "admin") {
          renderHome();
          showToast("La sesión administrativa terminó por inactividad.", 5000);
        }
      }
    } catch (error) {
      console.error("No fue posible comprobar la sesión administrativa:", error);
    }
  }

  function togglePasswordVisibility() {
    const type = elements.showAdminPassword.checked ? "text" : "password";
    elements.adminPassword.type = type;
    elements.adminConfirmation.type = type;
  }

  function bindEvents() {
    elements.confirmProfile.addEventListener("click", confirmSelectedProfile);
    elements.adminButton.addEventListener("click", openAdminAccess);
    elements.adminForm.addEventListener("submit", submitAdminForm);
    elements.adminCancelButton.addEventListener("click", () => {
      elements.adminDialog.close();
      resetAdminForm();
    });
    elements.showAdminPassword.addEventListener("change", togglePasswordVisibility);
    elements.adminBackButton.addEventListener("click", () => renderHome());
    elements.adminLogoutButton.addEventListener("click", logoutAdmin);

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        showToast("Esta función se habilitará en la etapa de productos y precios.", 4200);
      });
    });

    ["pointerdown", "keydown"].forEach((eventName) => {
      document.addEventListener(eventName, touchAdminSession, { passive: true });
    });

    window.setInterval(checkAdminSession, 30_000);
  }

  async function start() {
    bindEvents();

    if (!window.almacen) {
      showToast("No se pudo iniciar la comunicación segura con la aplicación.", 6000);
      return;
    }

    try {
      const [appInfo, profiles, currentProfile, adminResponse] = await Promise.all([
        window.almacen.getAppInfo(),
        window.almacen.listProfiles(),
        window.almacen.getProfile(),
        window.almacen.getAdminStatus()
      ]);

      elements.appVersion.textContent = `Versión ${appInfo.version}`;
      state.profiles = profiles;
      state.adminUnlocked = Boolean(adminResponse.status?.unlocked);

      if (currentProfile) {
        state.currentProfile = currentProfile;
        renderHome(currentProfile);
        return;
      }

      renderProfiles();
      showScreen(elements.setupScreen, "setup");
    } catch (error) {
      console.error(error);
      showToast("No se pudo iniciar la aplicación. Ciérrala y vuelve a abrirla.", 6000);
    }
  }

  start();
})(window, document);
