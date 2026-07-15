from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, label):
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"No se encontró el bloque: {label} en {path}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# package.json: modo de pruebas explícito y fácil de desactivar.
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["scripts"]["start:test-profile"] = "cross-env ALMACEN_ALLOW_PROFILE_CHANGE=1 electron ."
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# main.js: el cambio solo se permite con la variable de pruebas.
replace_once(
    "app/main/main.js",
    "const commerce = new CommerceService(localDatabase);\n",
    "const commerce = new CommerceService(localDatabase);\n\nconst PROFILE_TESTING_ENABLED =\n  process.env.NODE_ENV === \"development\" || process.env.ALMACEN_ALLOW_PROFILE_CHANGE === \"1\";\n",
    "bandera de cambio de perfil"
)
replace_once(
    "app/main/main.js",
    '''  ipcMain.handle("app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }));''',
    '''  ipcMain.handle("app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    profileTestingEnabled: PROFILE_TESTING_ENABLED
  }));''',
    "información del modo de pruebas"
)
replace_once(
    "app/main/main.js",
    '''  ipcMain.handle("profile:save", async (_event, profileId) => {
    const profile = await saveProfile(app.getPath("userData"), profileId);
    if (!localDatabase.getSummary().initialized) await initializeLocalDatabase(profile);
    else localDatabase.registerDeviceProfile(profile, app.getVersion());
    currentPreferences(profile);
    await refreshStartupReport();
    scheduleAutomaticSync();
    return profile;
  });''',
    '''  ipcMain.handle("profile:save", async (_event, profileId) => {
    const profile = await saveProfile(app.getPath("userData"), profileId, {
      allowChange: PROFILE_TESTING_ENABLED
    });
    if (!localDatabase.getSummary().initialized) await initializeLocalDatabase(profile);
    else localDatabase.registerDeviceProfile(profile, app.getVersion());
    adminSession.logout();
    const preferences = currentPreferences(profile);
    applyWindowPreferences(preferences);
    await refreshStartupReport();
    scheduleAutomaticSync();
    return profile;
  });''',
    "guardado controlado del perfil"
)

# index.html: botón temporal, visible únicamente en modo de pruebas.
replace_once(
    "app/renderer/index.html",
    '''      <div class="topbar-actions">
        <button class="button button-secondary view-button" id="view-button" type="button" disabled>Letra</button>
        <button class="button button-secondary topbar-admin" id="admin-button" type="button">Administración</button>
      </div>''',
    '''      <div class="topbar-actions">
        <button class="button button-secondary hidden" id="profile-change-button" type="button">Cambiar perfil (pruebas)</button>
        <button class="button button-secondary view-button" id="view-button" type="button" disabled>Letra</button>
        <button class="button button-secondary topbar-admin" id="admin-button" type="button">Administración</button>
      </div>''',
    "botón de cambio de perfil"
)
replace_once(
    "app/renderer/index.html",
    '<div class="notice" role="note">El perfil solo podrá cambiarse posteriormente desde Administración.</div>',
    '<div class="notice" id="profile-setup-notice" role="note">El perfil quedará fijo en este equipo.</div>',
    "aviso de perfil"
)

# app.js: mostrar el botón, cambiar el perfil y corregir el texto administrativo pendiente.
replace_once(
    "app/renderer/app.js",
    '''    adminUnlocked: false,
    lastAdminTouchAt: 0,
    databaseSummary: null''',
    '''    adminUnlocked: false,
    lastAdminTouchAt: 0,
    databaseSummary: null,
    profileTestingEnabled: false''',
    "estado del modo de pruebas"
)
replace_once(
    "app/renderer/app.js",
    '''    adminButton: document.getElementById("admin-button"),
    profileDialog: document.getElementById("confirmation-dialog"),''',
    '''    adminButton: document.getElementById("admin-button"),
    profileChangeButton: document.getElementById("profile-change-button"),
    profileSetupNotice: document.getElementById("profile-setup-notice"),
    profileDialog: document.getElementById("confirmation-dialog"),''',
    "elementos del modo de pruebas"
)
replace_once(
    "app/renderer/app.js",
    '''    elements.adminButton.textContent = state.adminUnlocked ? "Administración abierta" : "Administración";
    showScreen(elements.homeScreen, "home");''',
    '''    elements.adminButton.textContent = state.adminUnlocked ? "Administración abierta" : "Administración";
    elements.profileChangeButton?.classList.toggle("hidden", !state.profileTestingEnabled);
    showScreen(elements.homeScreen, "home");''',
    "visibilidad del botón de pruebas"
)
replace_once(
    "app/renderer/app.js",
    '''    elements.adminDialogEyebrow.textContent = "Configuración pendiente";
    elements.adminDialogTitle.textContent = "Administración aún no configurada";
    elements.adminDialogMessage.textContent = "La contraseña inicial solo se crea desde la computadora de Jefferson.";
    elements.adminSecurityNote.textContent = "Después podrá sincronizarse el estado con los otros equipos.";''',
    '''    elements.adminDialogEyebrow.textContent = "Configuración pendiente";
    elements.adminDialogTitle.textContent = "Administración aún no configurada";
    if (state.profileTestingEnabled) {
      elements.adminDialogMessage.textContent = "Para esta prueba, cambia el perfil a Jefferson y crea la contraseña.";
      elements.adminSecurityNote.textContent = "Usa el botón Cambiar perfil (pruebas). Al iniciar normalmente, ese botón desaparece.";
    } else {
      elements.adminDialogMessage.textContent = "La contraseña inicial se crea localmente desde la computadora configurada como Jefferson.";
      elements.adminSecurityNote.textContent = "Por seguridad, la contraseña y su hash no se sincronizan con Firebase.";
    }''',
    "mensaje administrativo exacto"
)
replace_once(
    "app/renderer/app.js",
    '''  async function confirmSelectedProfile(event) {
    event.preventDefault();''',
    '''  function openProfileTesting() {
    if (!state.profileTestingEnabled) return;
    state.selectedProfileId = null;
    renderProfiles();
    if (elements.profileSetupNotice) {
      elements.profileSetupNotice.textContent = "Modo de pruebas activo. Puedes cambiar de perfil sin borrar la base local.";
    }
    showScreen(elements.setupScreen, "setup");
  }

  async function confirmSelectedProfile(event) {
    event.preventDefault();''',
    "pantalla para cambiar perfil"
)
replace_once(
    "app/renderer/app.js",
    '''      state.currentProfile = profile;
      await refreshDatabaseSummary();
      renderHome(profile);''',
    '''      state.currentProfile = profile;
      state.adminUnlocked = false;
      await refreshDatabaseSummary();
      renderHome(profile);''',
    "reinicio de administración al cambiar perfil"
)
replace_once(
    "app/renderer/app.js",
    '''    elements.confirmProfile.addEventListener("click", confirmSelectedProfile);
    elements.adminButton.addEventListener("click", openAdminAccess);''',
    '''    elements.confirmProfile.addEventListener("click", confirmSelectedProfile);
    elements.profileChangeButton?.addEventListener("click", openProfileTesting);
    elements.adminButton.addEventListener("click", openAdminAccess);''',
    "evento de cambio de perfil"
)
replace_once(
    "app/renderer/app.js",
    '''      elements.appVersion.textContent = `Versión ${appInfo.version}`;
      state.profiles = profiles;''',
    '''      elements.appVersion.textContent = `Versión ${appInfo.version}`;
      state.profileTestingEnabled = Boolean(appInfo.profileTestingEnabled);
      elements.profileChangeButton?.classList.toggle("hidden", !state.profileTestingEnabled);
      if (elements.profileSetupNotice) {
        elements.profileSetupNotice.textContent = state.profileTestingEnabled
          ? "Modo de pruebas activo. Puedes cambiar de perfil sin borrar la base local."
          : "El perfil quedará fijo en este equipo.";
      }
      state.profiles = profiles;''',
    "inicio del modo de pruebas"
)

# Prueba: el modo autorizado cambia el perfil y conserva el mismo equipo.
replace_once(
    "tests/startup-profile.test.js",
    '''test("una configuración dañada se detecta, respalda y reemplaza", async () => {''',
    '''test("el modo autorizado permite cambiar de perfil conservando el equipo", async () => {
  await withTempDirectory(async (directory) => {
    const first = await saveProfile(directory, "edgar");
    const changed = await saveProfile(directory, "jefferson", { allowChange: true });

    assert.equal(changed.id, "jefferson");
    assert.equal(changed.deviceId, first.deviceId);
    assert.equal(changed.configuredAt, first.configuredAt);
    assert.equal((await readProfile(directory)).id, "jefferson");
  });
});

test("una configuración dañada se detecta, respalda y reemplaza", async () => {''',
    "prueba de cambio autorizado"
)

# Documentación breve y precisa.
readme_path = ROOT / "README.md"
readme = readme_path.read_text(encoding="utf-8")
anchor = '''## Ejecutar en desarrollo

```bash
npm install
npm start
```
'''
replacement = '''## Ejecutar en desarrollo

```bash
npm install
npm start
```

### Cambiar de perfil durante las pruebas

```bash
npm run start:test-profile
```

Este comando muestra **Cambiar perfil (pruebas)** y permite alternar entre Edgar, Gloria y Jefferson sin borrar la base. El cambio queda deshabilitado automáticamente al abrir con `npm start` o desde el instalador normal.

La contraseña administrativa se mantiene local en cada instalación. Por seguridad, ni la contraseña ni su hash se sincronizan con Firebase.
'''
if replacement not in readme:
    if anchor not in readme:
        raise RuntimeError("No se encontró la sección de ejecución en README.md")
    readme_path.write_text(readme.replace(anchor, replacement, 1), encoding="utf-8")

print("Cambio temporal de perfil y mensaje administrativo corregidos.")
