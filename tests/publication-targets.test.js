"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("el proyecto mantiene únicamente la aplicación de escritorio", () => {
  assert.equal(fs.existsSync(path.join(root, "web")), false);
  assert.equal(fs.existsSync(path.join(root, ".github/workflows/web-deploy.yml")), false);
});

test("el instalador de Windows mantiene Electron y NSIS x64", () => {
  const builder = read("electron-builder.yml");
  assert.match(builder, /files:\s*\n\s*- app\/\*\*\/\*/);
  assert.match(builder, /target:\s*\n\s*- target: nsis/);
  assert.match(builder, /arch:\s*\n\s*- x64/);
  assert.match(builder, /createDesktopShortcut: always/);

  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.main, "app/main/main.js");
  assert.equal(packageJson.scripts["release:check"], "npm test");
  assert.equal(packageJson.scripts["web:check"], undefined);
  assert.match(packageJson.scripts["build:win"], /electron-builder --win nsis --x64/);
  assert.match(packageJson.scripts["release:win"], /release:check/);
});
