import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedHost, checkRequest } from "../scripts/lib/guard.mjs";

test("only local and Tailscale host names are answered (DNS rebinding)", () => {
  for (const h of ["localhost:3210", "127.0.0.1:3210", "[::1]:3210", "radar.your-tailnet.ts.net"]) assert.equal(allowedHost(h), true, h);
  for (const h of ["evil.example:3210", "192.168.0.10:3210", "localhost.evil.example", "ts.net.evil.example"]) assert.equal(allowedHost(h), false, h);
  assert.equal(allowedHost("radar.home", ["radar.home"]), true);
  assert.equal(allowedHost("pc.lan", ["*.lan"]), true);
  assert.equal(checkRequest({ path: "/", host: "evil.example:3210" }), "host");
});

test("API calls from other pages are refused (CSRF), Radar's own pages and local scripts are not", () => {
  const api = { method: "POST", path: "/api/data/delete", host: "localhost:3210" };
  assert.equal(checkRequest({ ...api, origin: "https://evil.example" }), "origin");
  assert.equal(checkRequest({ ...api, origin: "http://localhost:5173" }), "origin");
  assert.equal(checkRequest({ ...api, origin: "null" }), "origin");
  assert.equal(checkRequest({ ...api, secFetchSite: "cross-site" }), "origin");
  assert.equal(checkRequest({ ...api, origin: "http://localhost:3210" }), null);
  assert.equal(checkRequest(api), null); // curl / CLI / the reminder timer
  // behind Tailscale serve: the browser's origin is the ts.net name
  assert.equal(checkRequest({ ...api, host: "127.0.0.1:3210", forwardedHost: "radar.your-tailnet.ts.net", origin: "https://radar.your-tailnet.ts.net" }), null);
  assert.equal(checkRequest({ ...api, host: "127.0.0.1:3210", forwardedHost: "evil.example", origin: "https://evil.example" }), "origin");
  // following a link to a page from anywhere is fine
  assert.equal(checkRequest({ method: "GET", path: "/people", host: "localhost:3210", secFetchSite: "cross-site" }), null);
});
