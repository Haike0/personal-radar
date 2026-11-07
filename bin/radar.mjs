#!/usr/bin/env node
// Personal Radar in one command:
//   npx github:Ikarishinji00/personal-radar         (or `npm start` inside a clone)
// The package ships the built app (npm runs `prepare` → next build when installing from GitHub), so it starts in seconds.
// In a clone without a build, the first run builds it (about a minute).
// Options: --port 3210   --rebuild   --no-open
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const PORT = String(opt("port", process.env.PORT ?? "3210"));

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`Personal Radar 需要 Node.js 22.13 或更新版本（你现在是 ${process.versions.node}）。到 https://nodejs.org 下载 LTS 版本后再试。`);
  process.exit(1);
}

const next = createRequire(path.join(ROOT, "package.json")).resolve("next/dist/bin/next");
const built = fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"));
if (!built || args.includes("--rebuild")) {
  // Next.js can't compile source that sits inside node_modules, so an installed copy must come prebuilt
  if (ROOT.split(path.sep).includes("node_modules")) {
    console.error("这个安装包里缺少构建好的程序。请重新安装：npx github:Ikarishinji00/personal-radar ，还不行就到 GitHub 提 issue。");
    process.exit(1);
  }
  console.log("第一次运行，正在准备（大约一分钟）…");
  const b = spawnSync(process.execPath, [next, "build"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (b.status !== 0) { console.error("准备失败，上面是出错信息。可以到 GitHub 提 issue。"); process.exit(1); }
}

const url = `http://localhost:${PORT}`;
const server = spawn(process.execPath, [next, "start", "-p", PORT], {
  cwd: ROOT, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, NODE_ENV: "production", RADAR_PORT: PORT, NEXT_TELEMETRY_DISABLED: "1" },
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));

// wait until it answers, then open the browser
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(`${url}/api/health`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const dataDir = (process.env.RADAR_DATA_DIR ?? path.join(os.homedir(), ".personal-radar")).replace(os.homedir(), "~");
console.log(`\n  Personal Radar 已经开好：${url}\n  聊天和记录都在你自己的电脑上（${dataDir}）。按 Ctrl+C 关闭。\n`);
if (!args.includes("--no-open")) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const a = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, a, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
