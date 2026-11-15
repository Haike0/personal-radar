#!/usr/bin/env node
// Desktop downloads: ReadMe with its own Node.js, so people don't have to install anything.
//   npm run build && node scripts/package-app.mjs [mac-arm64,mac-x64,win-x64,linux-x64]
// Output in dist/:
//   ReadMe-mac-arm64.dmg / .zip   ReadMe-mac-x64.dmg / .zip   (menu-bar app; needs macOS and Xcode tools to build)
//   ReadMe-windows-x64.zip        ReadMe-linux-x64.tar.gz
// The server is plain JavaScript, so every target is built from the same .next/standalone.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const NODE = process.env.READ_ME_NODE ?? "v22.23.5";
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const targets = (process.argv[2] ?? (process.platform === "darwin" ? "mac-arm64,mac-x64,win-x64,linux-x64" : "win-x64,linux-x64")).split(",");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

if (!fs.existsSync(path.join(ROOT, ".next", "standalone", "server.js")) || !fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.error("Build first: npm run build");
  process.exit(1);
}
const { finishStandalone } = await import("../bin/standalone.mjs");
finishStandalone(ROOT);
// the server needs Next's route runtime once real data is in (background sync); demo mode never loads it
if (!fs.existsSync(path.join(ROOT, ".next", "standalone", "node_modules", "next", "dist", "compiled", "next-server", "app-route-turbo.runtime.prod.js"))) {
  console.error("The build is missing Next's route runtime (see outputFileTracingIncludes in next.config.ts). Rebuild first.");
  process.exit(1);
}

// 1) the app folder: what the npm package carries, minus the source code
const payload = path.join(DIST, "payload", "app");
fs.rmSync(path.join(DIST, "payload"), { recursive: true, force: true });
fs.mkdirSync(payload, { recursive: true });
const copy = (rel) => { const s = path.join(ROOT, rel); if (fs.existsSync(s)) fs.cpSync(s, path.join(payload, rel), { recursive: true, dereference: true }); };
for (const rel of ["bin", "agent", "public", "scripts", "demo", "docs", "examples", "LICENSE", "package.json", ".env.example", ".next/standalone", ".next/BUILD_ID"]) copy(rel);
for (const junk of ["docs/assets", "scripts/package-app.mjs", "demo/love/.cache", "demo/work/.cache", "demo/night/.cache"]) fs.rmSync(path.join(payload, junk), { recursive: true, force: true });
fs.writeFileSync(path.join(payload, ".packaged"), `ReadMe ${pkg.version} desktop download\n`);

// 2) Node.js for each platform (cached)
const cache = path.join(DIST, "cache");
fs.mkdirSync(cache, { recursive: true });
async function node(platform) {
  const name = { "mac-arm64": `node-${NODE}-darwin-arm64.tar.gz`, "mac-x64": `node-${NODE}-darwin-x64.tar.gz`, "linux-x64": `node-${NODE}-linux-x64.tar.xz`, "win-x64": `node-${NODE}-win-x64.zip` }[platform];
  const file = path.join(cache, name);
  if (!fs.existsSync(file)) {
    console.log(`downloading ${name}`);
    const r = await fetch(`https://nodejs.org/dist/${NODE}/${name}`);
    if (!r.ok) throw new Error(`download failed: ${r.status} ${name}`);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const dir = path.join(cache, name.replace(/\.(tar\.gz|tar\.xz|zip)$/, ""));
  if (!fs.existsSync(dir)) {
    if (name.endsWith(".zip")) run("unzip", ["-q", file, "-d", cache]);
    else run("tar", ["-xf", file, "-C", cache]);
  }
  return dir;
}

// 3) the macOS launcher (menu-bar app), compiled once for both chips
function launcher() {
  const out = path.join(DIST, "cache", "ReadMe-launcher");
  const src = path.join(ROOT, "packaging", "mac", "Launcher.swift");
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(src).mtimeMs) return out;
  const parts = ["arm64", "x86_64"].map((arch) => {
    const o = `${out}-${arch}`;
    run("swiftc", ["-O", "-target", `${arch}-apple-macos12`, "-o", o, src]);
    return o;
  });
  run("lipo", ["-create", ...parts, "-output", out]);
  return out;
}
function icns() {
  const out = path.join(DIST, "cache", "AppIcon.icns");
  const set = path.join(DIST, "cache", "AppIcon.iconset");
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set);
  const src = path.join(ROOT, "public", "brand", "icon-mac.png");
  for (const s of [16, 32, 128, 256, 512]) {
    run("sips", ["-z", String(s), String(s), src, "--out", path.join(set, `icon_${s}x${s}.png`)], { stdio: "ignore" });
    run("sips", ["-z", String(s * 2), String(s * 2), src, "--out", path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: "ignore" });
  }
  run("iconutil", ["-c", "icns", set, "-o", out]);
  return out;
}

const made = [];
for (const t of targets) {
  const n = await node(t);
  const stage = path.join(DIST, "stage", t);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  if (t.startsWith("mac")) {
    const app = path.join(stage, "ReadMe.app", "Contents");
    fs.mkdirSync(path.join(app, "MacOS"), { recursive: true });
    fs.mkdirSync(path.join(app, "Resources", "node", "bin"), { recursive: true });
    fs.writeFileSync(path.join(app, "Info.plist"), fs.readFileSync(path.join(ROOT, "packaging", "mac", "Info.plist"), "utf8").replaceAll("__VERSION__", pkg.version));
    fs.copyFileSync(launcher(), path.join(app, "MacOS", "ReadMe"));
    fs.chmodSync(path.join(app, "MacOS", "ReadMe"), 0o755);
    fs.copyFileSync(icns(), path.join(app, "Resources", "AppIcon.icns"));
    fs.copyFileSync(path.join(ROOT, "packaging", "mac", "StatusIcon.png"), path.join(app, "Resources", "StatusIcon.png"));
    fs.copyFileSync(path.join(n, "bin", "node"), path.join(app, "Resources", "node", "bin", "node"));
    fs.cpSync(payload, path.join(app, "Resources", "app"), { recursive: true });
    // ad-hoc signature: not notarized (that needs a paid Apple account), but Apple Silicon refuses unsigned code
    run("codesign", ["--force", "--deep", "--sign", "-", path.join(stage, "ReadMe.app")]);
    const zip = path.join(DIST, `ReadMe-${t}.zip`);
    fs.rmSync(zip, { force: true });
    run("ditto", ["-c", "-k", "--keepParent", path.join(stage, "ReadMe.app"), zip]);
    fs.symlinkSync("/Applications", path.join(stage, "Applications"));
    const dmg = path.join(DIST, `ReadMe-${t}.dmg`);
    fs.rmSync(dmg, { force: true });
    run("hdiutil", ["create", "-quiet", "-volname", "ReadMe", "-srcfolder", stage, "-ov", "-format", "ULFO", dmg]);
    made.push(dmg, zip);
  } else if (t === "win-x64") {
    const dir = path.join(stage, "ReadMe");
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(n, "node.exe"), path.join(dir, "node.exe"));
    fs.cpSync(payload, path.join(dir, "app"), { recursive: true });
    fs.writeFileSync(path.join(dir, "ReadMe.cmd"), [
      "@echo off", 'cd /d "%~dp0"', "title ReadMe",
      "echo ReadMe is starting. Your browser will open in a few seconds.",
      "echo Keep this window open while you use ReadMe; close it to quit.",
      "echo.", 'node.exe "app\\bin\\radar.mjs"', "pause", "",
    ].join("\r\n"));
    const zip = path.join(DIST, "ReadMe-windows-x64.zip");
    fs.rmSync(zip, { force: true });
    run("zip", ["-q", "-r", "-X", zip, "ReadMe"], { cwd: stage });
    made.push(zip);
  } else if (t === "linux-x64") {
    const dir = path.join(stage, "ReadMe");
    fs.mkdirSync(path.join(dir, "node", "bin"), { recursive: true });
    fs.copyFileSync(path.join(n, "bin", "node"), path.join(dir, "node", "bin", "node"));
    fs.chmodSync(path.join(dir, "node", "bin", "node"), 0o755);
    fs.cpSync(payload, path.join(dir, "app"), { recursive: true });
    fs.writeFileSync(path.join(dir, "readme"), '#!/bin/sh\nD="$(cd "$(dirname "$0")" && pwd)"\nexec "$D/node/bin/node" "$D/app/bin/radar.mjs" "$@"\n');
    fs.chmodSync(path.join(dir, "readme"), 0o755);
    const tgz = path.join(DIST, "ReadMe-linux-x64.tar.gz");
    run("tar", ["-czf", tgz, "-C", stage, "ReadMe"]);
    made.push(tgz);
  }
}
for (const f of made) console.log(`${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1e6).toFixed(0)} MB`);
