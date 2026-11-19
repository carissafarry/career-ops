import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extensions/linkedin-watch");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));

test("manifest is MV3 with minimal permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["alarms", "tabs", "storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://www.linkedin.com/jobs/search*", "http://localhost:3000/*"]);
  assert.equal(manifest.background.service_worker, "background.js");
});

test("content script only matches LinkedIn jobs search", () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.linkedin.com/jobs/search*"]);
  for (const f of ["background.js", ...manifest.content_scripts[0].js]) assert.ok(fs.existsSync(path.join(dir, f)), f);
});

test("the extension has its logo at every size Chrome asks for", () => {
  for (const size of ["16", "32", "48", "128"]) {
    const file = path.join(dir, manifest.icons[size]);
    assert.ok(fs.existsSync(file), manifest.icons[size]);
    const png = fs.readFileSync(file);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), Number(size)); // IHDR width
  }
  assert.deepEqual(manifest.action.default_icon, { 16: manifest.icons["16"], 32: manifest.icons["32"] });
});
