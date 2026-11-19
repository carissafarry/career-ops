// Pages opened by 127.0.0.1 are sent to localhost, so the browser's stored settings live
// under one address.
//
// Run: node --experimental-strip-types --test tests/lib/loopback-redirect.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOPBACK_REDIRECT_SCRIPT } from "../../src/lib/loopback-redirect.mjs";

function run(location) {
  let target = null;
  const window = { location: { ...location, replace: (url) => { target = url; } } };
  new Function("window", LOOPBACK_REDIRECT_SCRIPT)(window);
  return target;
}

test("127.0.0.1 goes to localhost with port, path, query and hash kept", () => {
  assert.equal(
    run({ protocol: "http:", hostname: "127.0.0.1", port: "3000", pathname: "/explore", search: "?q=a%2Cb&since=30", hash: "#x" }),
    "http://localhost:3000/explore?q=a%2Cb&since=30#x",
  );
});

test("a missing port is left out", () => {
  assert.equal(run({ protocol: "http:", hostname: "127.0.0.1", port: "", pathname: "/", search: "", hash: "" }), "http://localhost/");
});

test("localhost and other hosts are left alone", () => {
  assert.equal(run({ protocol: "http:", hostname: "localhost", port: "3000", pathname: "/", search: "", hash: "" }), null);
  assert.equal(run({ protocol: "http:", hostname: "127.0.0.2", port: "3000", pathname: "/", search: "", hash: "" }), null);
  assert.equal(run({ protocol: "https:", hostname: "example.com", port: "", pathname: "/", search: "", hash: "" }), null);
});
