import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Radar holds people's chats and has no login: it must never listen on the whole network by default.
test("every way of starting the server listens on 127.0.0.1 only", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const k of ["dev", "serve"]) assert.match(pkg.scripts[k], /-H 127\.0\.0\.1/, `npm run ${k}`);
  const launcher = fs.readFileSync(new URL("../bin/radar.mjs", import.meta.url), "utf8");
  assert.match(launcher, /RADAR_HOST \?\? "127\.0\.0\.1"/);
  assert.match(launcher, /"-H", HOST/);
  const compose = fs.readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
  assert.match(compose, /"127\.0\.0\.1:3210:3210"/);
});
