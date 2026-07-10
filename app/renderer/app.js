/* =========================================================
Nombre completo: app.js
Ruta o ubicación: /app/renderer/app.js
Función o funciones:
- Cargar el perfil configurado en la computadora.
- Mostrar la selección inicial de Edgar, Gloria o Jefferson.
- Guardar el perfil elegido mediante la API segura de Electron.
- Presentar la pantalla principal adaptada al usuario.
========================================================= */

"use strict";

(function initializeRenderer(window, document) {
  const state = {
    profiles: [],
    selectedProfileId: null,
    currentProfile: null
  };

  const elements = {
    loadingScreen: document.getElementById("loading-screen"),
    setupScreen: document.getElementById("setup-screen"),
    homeScreen: document.getElementById("home-screen"),
    profileList: document.getElementById("profile-list"),
    appVersion: document.getElementById("app-version"),
    welcomeTitle: document.getElementById("welcome-title"),
    channelName: document.getElementById("channel-name"),
    adminButton: document.getElementById("admin-button"),
    dialog: document.getElementById("confirmation-dialog"),
    dialogTitle: document.getElementById("dialog-title"),
    dialogMessage: document.getElementById("dialog-message"),
    confirmProfile: document.getElementById("confirm-profile"),
    toast: document.getElementById("toast")
  };

  function showScreen(screen) {
    [elements.loadingScreen, elements.setupScreen, elements.homeScreen].forEach((item) => {
      item.classList.toggle("hidden", item !== screen);
    });
  }

  function showToast(message, duration = 3200) {
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");

    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.classList.add("hidden");
    }, duration);
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
    elements.dialogTitle.textContent = `¿Guardar el perfil de ${profile.displayName}?`;
    elements.dialogMessage.textContent = `Esta computadora quedará asignada a ${profile.displayName} — ${profile.channelName}.`;
    elements.dialog.showModal();
  }

  function renderHome(profile) {
    state.currentProfile = profile;
    elements.welcomeTitle.textContent = `Hola, ${profile.displayName}`;
    elements.channelName.textContent = profile.channelName;
    showScreen(elements.homeScreen);
  }

  async function confirmSelectedProfile(event) {
    event.preventDefault();

    if (!state.selectedProfileId) {
      elements.dialog.close();
      return;
    }

    elements.confirmProfile.disabled = true;
    elements.confirmProfile.textContent = "Guardando…";

    try {
      const profile = await window.almacen.saveProfile(state.selectedProfileId);
      elements.dialog.close();
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

  function bindEvents() {
    elements.confirmProfile.addEventListener("click", confirmSelectedProfile);

    elements.adminButton.addEventListener("click", () => {
      showToast("El acceso con contraseña se agregará en el siguiente avance.", 4200);
    });

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        showToast("Esta función se habilitará en la etapa de productos y precios.", 4200);
      });
    });
  }

  async function start() {
    bindEvents();

    if (!window.almacen) {
      showToast("No se pudo iniciar la comunicación segura con la aplicación.", 6000);
      return;
    }

    try {
      const [appInfo, profiles, currentProfile] = await Promise.all([
        window.almacen.getAppInfo(),
        window.almacen.listProfiles(),
        window.almacen.getProfile()
      ]);

      elements.appVersion.textContent = `Versión ${appInfo.version}`;
      state.profiles = profiles;

      if (currentProfile) {
        renderHome(currentProfile);
        return;
      }

      renderProfiles();
      showScreen(elements.setupScreen);
    } catch (error) {
      console.error(error);
      showToast("No se pudo iniciar la aplicación. Ciérrala y vuelve a abrirla.", 6000);
    }
  }

  start();
})(window, document);
