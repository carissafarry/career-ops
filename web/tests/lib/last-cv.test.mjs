import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findLastCv } from "../../src/lib/last-cv.mjs";

function outputDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "last-cv-"));
  files.forEach(([name, ageSeconds], i) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, "x");
    const at = new Date(Date.now() - ageSeconds * 1000 - i);
    fs.utimesSync(file, at, at);
  });
  return dir;
}

test("the newest cv-* PDF is the last CV", () => {
  const dir = outputDir([["cv-ada-002-acme-2026-11-18.pdf", 100], ["cv-ada-003-beta-2026-11-19.pdf", 10]]);
  assert.equal(findLastCv(dir)?.name, "cv-ada-003-beta-2026-11-19.pdf");
});

test("a PDF in the #6667 standard layout (written by the CLI) counts too", () => {
  const dir = outputDir([["cv-ada-002-acme-2026-11-18.pdf", 100], ["004-gamma-cv-ada-lovelace-2026-11-21.pdf", 5]]);
  assert.equal(findLastCv(dir)?.name, "004-gamma-cv-ada-lovelace-2026-11-21.pdf");
});

test("covers, HTML and other files are not a CV", () => {
  const dir = outputDir([["004-gamma-cover-ada-2026-11-21.pdf", 1], ["cv-ada-002-acme-2026-11-18.html", 1], ["notes.pdf", 1]]);
  assert.equal(findLastCv(dir), null);
});
