from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative_path: str, old: str, new: str) -> None:
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"No se encontró el texto esperado en {relative_path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "app/main/admin-auth-store.js",
    "const MIN_PASSWORD_LENGTH = 8;",
    "const MIN_PASSWORD_LENGTH = 4;"
)

replace_once(
    "app/renderer/index.html",
    'id="admin-password" type="password" minlength="8" maxlength="128" required',
    'id="admin-password" type="password" minlength="4" maxlength="128" required'
)

replace_once(
    "app/renderer/index.html",
    'id="admin-confirmation" type="password" minlength="8" maxlength="128"',
    'id="admin-confirmation" type="password" minlength="4" maxlength="128"'
)

replace_once(
    "app/renderer/app.js",
    'elements.adminSecurityNote.textContent = "Usa al menos 8 caracteres.";',
    'elements.adminSecurityNote.textContent = "Usa al menos 4 caracteres. Puedes combinar letras, números o símbolos.";'
)

path = ROOT / "tests/admin-auth.test.js"
text = path.read_text(encoding="utf-8")
anchor = '''test("rechaza contraseñas demasiado cortas", async () => {
  await withTempDirectory(async (directory) => {
    await assert.rejects(
      createAdminCredential(directory, "123"),
      (error) => error.code === "PASSWORD_TOO_SHORT"
    );
  });
});
'''
addition = anchor + '''
test("acepta una contraseña sencilla de cuatro caracteres", async () => {
  await withTempDirectory(async (directory) => {
    await createAdminCredential(directory, "1234");
    assert.equal(await verifyAdminPassword(directory, "1234"), true);
  });
});
'''
if "acepta una contraseña sencilla de cuatro caracteres" not in text:
    if anchor not in text:
        raise RuntimeError("No se encontró el bloque de prueba de contraseña corta")
    path.write_text(text.replace(anchor, addition, 1), encoding="utf-8")

print("Política de contraseña flexible aplicada.")
