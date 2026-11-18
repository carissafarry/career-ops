// The sites a user can exclude from vacancy lists are named by the posting's host
// without "www" or the country part, so one entry covers every spelling.
//
// Run: node --experimental-strip-types --test tests/lib/source-exclusions.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { isHiddenBy, normalizeSite, siteFromUrl, siteLabel } from "../../src/lib/source-exclusions.ts";

test("a posting URL maps to its site", () => {
  assert.equal(siteFromUrl("https://www.kalibrr.com/c/acme/jobs/123"), "kalibrr");
  assert.equal(siteFromUrl("https://kalibrr.id/jobs/1"), "kalibrr");
  assert.equal(siteFromUrl("https://www.jobstreet.co.id/job/9"), "jobstreet");
  assert.equal(siteFromUrl("https://boards.greenhouse.io/acme/jobs/5"), "greenhouse");
  assert.equal(siteFromUrl("https://jobs.lever.co/acme/abc"), "lever");
  assert.equal(siteFromUrl("https://careers.example.com.au/x"), "example");
  assert.equal(siteFromUrl("not a url"), null);
});

test("what the user types becomes the same site name", () => {
  assert.equal(normalizeSite("Kalibrr"), "kalibrr");
  assert.equal(normalizeSite("  kalibrr.com "), "kalibrr");
  assert.equal(normalizeSite("https://www.jobstreet.co.id/id/job/1"), "jobstreet");
  assert.equal(normalizeSite(""), null);
  assert.equal(normalizeSite("   "), null);
});

test("the label capitalises the site name", () => {
  assert.equal(siteLabel("kalibrr"), "Kalibrr");
});

test("exclude hides a site; include keeps only the listed ones; exclude wins", () => {
  const kalibrr = "https://www.kalibrr.com/c/a/jobs/1";
  const jobstreet = "https://www.jobstreet.co.id/job/2";
  assert.equal(isHiddenBy(kalibrr, [], []), false);
  assert.equal(isHiddenBy(kalibrr, ["kalibrr"], []), true);
  assert.equal(isHiddenBy(jobstreet, ["kalibrr"], []), false);
  assert.equal(isHiddenBy(kalibrr, [], ["jobstreet"]), true);
  assert.equal(isHiddenBy(jobstreet, [], ["jobstreet"]), false);
  assert.equal(isHiddenBy(jobstreet, ["jobstreet"], ["jobstreet"]), true);
  // A URL with no readable site cannot be on an include list.
  assert.equal(isHiddenBy("not a url", [], ["jobstreet"]), true);
  assert.equal(isHiddenBy("not a url", ["kalibrr"], []), false);
});
