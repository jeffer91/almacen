"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("el flujo sencillo convive con las mejoras comerciales anteriores", () => {
  assert.equal(fs.existsSync(path.join(root, "app/renderer/commercial-enhancements.js")), true);
  assert.equal(fs.existsSync(path.join(root, "app/renderer/simple-workflow.js")), true);

  const loader = read("app/renderer/catalog-enhancements.js");
  assert.match(loader, /commercial-enhancements\.js/);
  assert.match(loader, /simple-workflow\.js/);
  assert.match(loader, /role !== "administrator"/);
  assert.match(loader, /simple-catalog-workspace/);
});
