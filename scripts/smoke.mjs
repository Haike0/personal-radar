#!/usr/bin/env node
// Start Radar the way users do (bin/radar.mjs) with an empty data folder, wait until it answers, check a page and the
// guard, then stop it. Runs on Windows, macOS and Linux in CI. Needs a build first (`npx next build`).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = "3299";
const data = fs.mkdtempSync(path.join(os.tmpdir(), "radar smoke 测试-")); // a space and Chinese, like many real home folders
const child = spawn(process.execPath, [path.join(ROOT, "bin", "radar.mjs"), "--no-open", "--port", PORT], {
  env: { ...process.env, RADAR_DATA_DIR: data, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (b) => { log += b; });
child.stderr.on("data", (b) => { log += b; });

const base = `http://127.0.0.1:${PORT}`;
const fail = (msg) => { console.error(`✗ ${msg}\n--- output ---\n${log}`); child.kill(); process.exit(1); };
async function up() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not yet */ }
    if (child.exitCode != null) fail(`Radar exited early (code ${child.exitCode})`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail("Radar didn't answer within 120 s");
}

await up();
const home = await fetch(`${base}/welcome`);
if (!home.ok) fail(`/welcome returned ${home.status}`);
if (!fs.existsSync(path.join(data, "radar.db"))) fail("no radar.db in the data folder");
// a write from another site must be refused
const evil = await fetch(`${base}/api/settings`, { method: "PATCH", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
if (evil.status !== 403) fail(`cross-site write returned ${evil.status}, expected 403`);
const tg = await fetch(`${base}/api/telegram`); // loads the Telegram client library in the built app
if (!tg.ok) fail(`telegram status returned ${tg.status}`);
const ledger = await fetch(`${base}/api/people/demo_xiaoyu/ledger`);
if (!ledger.ok) fail(`ledger returned ${ledger.status}`);

console.log(`✓ Radar starts on ${process.platform}, serves pages, keeps data in "${data}", refuses cross-site writes`);
child.kill();
setTimeout(() => { try { fs.rmSync(data, { recursive: true, force: true }); } catch { /* Windows may still hold the db */ } process.exit(0); }, 1500);
