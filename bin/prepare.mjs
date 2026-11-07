#!/usr/bin/env node
// npm runs this before packing and when installing from GitHub (npx github:…).
// It builds the app once, so the installed copy starts in seconds. Skipped when a build already exists.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
if (fs.existsSync(path.join(ROOT, ".next", "BUILD_ID")) && !process.env.RADAR_FORCE_BUILD) process.exit(0);
if (!fs.existsSync(path.join(ROOT, "node_modules", "next"))) process.exit(0); // dependencies not installed yet
console.log("Personal Radar：正在构建（大约一分钟）…");
const r = spawnSync(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "build"], {
  cwd: ROOT, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
process.exit(r.status ?? 1);
