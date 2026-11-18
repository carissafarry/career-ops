// Editing content_filter.positive / negative in portals.yml text keeps every comment,
// every other list and every other block, and refuses a shape it cannot place.
//
// Run: node --experimental-strip-types --test tests/lib/portals-content-filter.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import * as yaml from "js-yaml";
import { editContentFilterText, splitContentEntry } from "../../src/lib/portals-config.mjs";

const SOURCE = `# my portals
title_filter:
  positive:
    - "Backend Engineer"   # keep

# -- Content filter --
content_filter:
  # people management
  negative:
    - "people management"
    # CRM roles (never)
    - "word:crm"
    - 'direct reports'
  min_match: 1
  positive:
    - "word:api"

# a commented-out company
# - name: Acme
tracked_companies:
  - name: Beta
`;

test("an added entry goes after the last item and nothing else moves", () => {
  const out = editContentFilterText(SOURCE, "negative", { add: ["word:plc"] });
  assert.ok(out);
  assert.deepEqual(yaml.load(out).content_filter.negative, ["people management", "word:crm", "direct reports", "word:plc"]);
  assert.ok(out.includes("# CRM roles (never)"));
  assert.ok(out.includes("# a commented-out company"));
  assert.ok(out.includes('- "word:plc"'));
  assert.equal(out.replace('    - "word:plc"\n', ""), SOURCE);
});

test("a removed entry loses only its own line", () => {
  const out = editContentFilterText(SOURCE, "negative", { remove: ["WORD:CRM"] });
  assert.deepEqual(yaml.load(out).content_filter.negative, ["people management", "direct reports"]);
  assert.ok(out.includes("# CRM roles (never)"));
  assert.equal(out.split("\n").length, SOURCE.split("\n").length - 1);
});

test("an entry already in the list is not added twice", () => {
  const out = editContentFilterText(SOURCE, "negative", { add: ["PEOPLE MANAGEMENT", "word:plc", "word:plc"] });
  assert.deepEqual(yaml.load(out).content_filter.negative.filter((e) => e === "word:plc" || /people/i.test(e)).length, 2);
});

test("positive and negative are separate lists", () => {
  const out = editContentFilterText(SOURCE, "positive", { add: ["golang"] });
  assert.deepEqual(yaml.load(out).content_filter.positive, ["word:api", "golang"]);
  assert.deepEqual(yaml.load(out).content_filter.negative, yaml.load(SOURCE).content_filter.negative);
});

test("a missing list or section is created", () => {
  const noList = SOURCE.replace(/  positive:\n    - "word:api"\n/, "");
  const a = editContentFilterText(noList, "positive", { add: ["golang"] });
  assert.deepEqual(yaml.load(a).content_filter.positive, ["golang"]);
  const noSection = "title_filter:\n  positive:\n    - \"x\"\n";
  const b = editContentFilterText(noSection, "negative", { add: ["word:crm"] });
  assert.deepEqual(yaml.load(b).content_filter.negative, ["word:crm"]);
  assert.deepEqual(yaml.load(b).title_filter.positive, ["x"]);
});

test("removing the last entry leaves an empty list, not a broken file", () => {
  const out = editContentFilterText(SOURCE, "positive", { remove: ["word:api"] });
  assert.ok(out);
  assert.deepEqual(yaml.load(out).content_filter.positive ?? [], []);
});

test("a flow-style list is refused, never rewritten", () => {
  const flow = "content_filter:\n  negative: [a, b]\n";
  assert.equal(editContentFilterText(flow, "negative", { add: ["c"] }), null);
});

test("an unknown list is refused", () => {
  assert.equal(editContentFilterText(SOURCE, "by_title_keyword", { add: ["x"] }), null);
});

test("an entry is split into how it matches and what it is", () => {
  assert.deepEqual(splitContentEntry("word:CRM"), { mode: "word", text: "CRM" });
  assert.deepEqual(splitContentEntry("stem:ios"), { mode: "stem", text: "ios" });
  assert.deepEqual(splitContentEntry("people management"), { mode: "", text: "people management" });
});
