import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// nav-items.ts imports a .tsx icon through the "@/" alias, which plain node cannot load; read the source instead.
const src = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/nav-items.ts"), "utf8");

test("nav has a LinkedIn entry using the LinkedIn icon", () => {
  assert.match(src, /href: "\/linkedin", label: "LinkedIn", icon: LinkedInIcon/);
});
