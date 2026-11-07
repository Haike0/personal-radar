#!/usr/bin/env node
// Personal Radar in one command:
//   npx github:Ikarishinji00/personal-radar         (or `npm start` inside a clone)
// The package ships the built app (npm runs `prepare` → next build when installing from GitHub), so it starts in seconds.
// In a clone without a build, the first run builds it (about a minute).
// Options: --port 3210   --rebuild   --no-open   --host 127.0.0.1
// Commands for agents and scripts (no server needed):
//   personal-radar import <files…>     import chat exports
//   personal-radar ai status|next|submit|digest|analysis …   organize with your own agent (see agent/SKILL.md)
//   personal-radar organize --yes      organize with the API key saved in Settings
//   personal-radar guide extract|analysis|export   print the organizing rules / analysis rules / export guide
// Listens on this computer only by default: anyone on the same Wi-Fi could otherwise read your chats.
// For your phone, use Tailscale (`tailscale serve 3210`) instead of opening it to the network.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const PORT = String(opt("port", process.env.PORT ?? "3210"));
const HOST = String(opt("host", process.env.RADAR_HOST ?? "127.0.0.1"));

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`Personal Radar 需要 Node.js 22.13 或更新版本（你现在是 ${process.versions.node}）。到 https://nodejs.org 下载 LTS 版本后再试。`);
  process.exit(1);
}

// subcommands run a script and exit; they read and write the same data folder as the app
const SUB = { import: "import.mjs", ai: "radar-ai.mjs", organize: "organize.mjs" };
const GUIDES = { extract: "ai-extract-guide.md", analysis: "ai-analysis-guide.md", export: "export-guide.md" };
if (args[0] === "guide") {
  const f = GUIDES[args[1]];
  if (!f) { console.error("用法：personal-radar guide extract|analysis|export"); process.exit(1); }
  process.stdout.write(fs.readFileSync(path.join(ROOT, "docs", f), "utf8"));
  process.exit(0);
}
if (SUB[args[0]]) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", SUB[args[0]]), ...args.slice(1)], { stdio: "inherit", env: process.env });
  process.exit(r.status ?? 1);
}

const next = createRequire(path.join(ROOT, "package.json")).resolve("next/dist/bin/next");
const inPackage = ROOT.split(path.sep).includes("node_modules");
const BUILD_ID = path.join(ROOT, ".next", "BUILD_ID");
// in a clone, rebuild after `git pull` changed the code
const newest = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((t, e) => {
  const p = path.join(dir, e.name);
  return Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
}, 0);
const stale = !inPackage && fs.existsSync(BUILD_ID) && newest(path.join(ROOT, "src")) > fs.statSync(BUILD_ID).mtimeMs;
const built = fs.existsSync(BUILD_ID) && !stale;
if (!built || args.includes("--rebuild")) {
  // Next.js can't compile source that sits inside node_modules, so an installed copy must come prebuilt
  if (inPackage) {
    console.error("这个安装包里缺少构建好的程序。请重新安装：npx github:Ikarishinji00/personal-radar ，还不行就到 GitHub 提 issue。");
    process.exit(1);
  }
  console.log(stale ? "代码有更新，正在重新准备（大约一分钟）…" : "第一次运行，正在准备（大约一分钟）…");
  // build output (and its harmless warnings) only shows when the build fails
  const b = spawnSync(process.execPath, [next, "build"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  if (b.status !== 0) { console.error(`${b.stdout ?? ""}${b.stderr ?? ""}\n准备失败，上面是出错信息。可以到 GitHub 提 issue。`); process.exit(1); }
}

const url = `http://${HOST === "127.0.0.1" || HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST}:${PORT}`;
const server = spawn(process.execPath, [next, "start", "-p", PORT, "-H", HOST], {
  cwd: ROOT, stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, NODE_ENV: "production", RADAR_PORT: PORT, NEXT_TELEMETRY_DISABLED: "1" },
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));

// wait until it answers, then open the browser
for (let i = 0; i < 60; i++) {
  // ask 127.0.0.1 directly: "localhost" may resolve to ::1 first, where nothing listens
  try { const r = await fetch(`http://${HOST === "0.0.0.0" || HOST === "::" || HOST === "localhost" ? "127.0.0.1" : HOST}:${PORT}/api/health`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
const dataDir = (process.env.RADAR_DATA_DIR ?? path.join(os.homedir(), ".personal-radar")).replace(os.homedir(), "~");
console.log(`\n  Personal Radar 已经开好：${url}\n  聊天和记录都在你自己的电脑上（${dataDir}）。按 Ctrl+C 关闭。\n`);
if (HOST !== "127.0.0.1" && HOST !== "localhost") console.log(`  注意：现在监听的是 ${HOST}，同一网络里的人也能打开这个页面、看到你的聊天整理结果。\n`);
if (!args.includes("--no-open")) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const a = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, a, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
