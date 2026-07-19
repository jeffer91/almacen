"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("la aplicación web contiene los archivos instalables requeridos", () => {
  for (const relativePath of [
    "web/index.html",
    "web/app.js",
    "web/styles.css",
    "web/service-worker.js",
    "web/manifest.webmanifest",
    "web/icon.svg"
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `Falta ${relativePath}`);
  }

  const manifest = JSON.parse(read("web/manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

  const index = read("web/index.html");
  assert.match(index, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(index, /src="\.\/app\.js"/);
  assert.match(index, /name="viewport"/);
});

test("Firebase Hosting publica únicamente la carpeta web", () => {
  const firebase = JSON.parse(read("firebase.json"));
  assert.equal(firebase.hosting.public, "web");
  assert.ok(Array.isArray(firebase.hosting.ignore));

  const projects = JSON.parse(read(".firebaserc"));
  assert.equal(projects.projects.default, "almacen-59227");
});

test("el instalador de Windows mantiene NSIS x64", () => {
  const builder = read("electron-builder.yml");
  assert.match(builder, /target:\s*\n\s*- target: nsis/);
  assert.match(builder, /arch:\s*\n\s*- x64/);
  assert.match(builder, /createDesktopShortcut: always/);

  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.main, "app/main/main.js");
  assert.match(packageJson.scripts["build:win"], /electron-builder --win nsis --x64/);
  assert.match(packageJson.scripts["release:win"], /release:check/);
});
