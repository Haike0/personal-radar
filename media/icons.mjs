// Render every app icon from the master picture public/brand/icon-1024.png (1024×1024, rounded, transparent corners).
//   node media/icons.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const master = `data:image/png;base64,${fs.readFileSync(path.join(ROOT, "public/brand/icon-1024.png")).toString("base64")}`;
// the master's own colours, for places that need a full square (iOS and Android cut their own shape)
const FILL = "linear-gradient(45deg,#0ac7f0 0%,#137fd5 38%,#1f6fd6 62%,#2a6fcf 100%)";

const plain = (size) => `<img src="${master}" width="${size}" height="${size}" style="display:block">`;
const filled = (size) => `<div style="width:${size}px;height:${size}px;background:${FILL}"><img src="${master}" width="${size}" height="${size}" style="display:block"></div>`;
// macOS draws app icons on an 824/1024 grid with a soft shadow; a full-bleed icon looks too big in the Dock
const mac = (size) => {
  const k = size / 1024, body = 824 * k;
  return `<div style="width:${size}px;height:${size}px;display:grid;place-items:center"><img src="${master}" width="${body}" height="${body}" style="display:block;filter:drop-shadow(0 ${10 * k}px ${12 * k}px rgba(0,0,0,.28))"></div>`;
};

const OUT = [
  ["brand/icon.png", 256, plain, true],
  ["brand/icon-mac.png", 1024, mac, true],
  ["icons/icon-192.png", 192, plain, true],
  ["icons/icon-512.png", 512, plain, true],
  ["icons/icon-512-maskable.png", 512, filled, false],
  ["icons/apple-touch-icon.png", 180, filled, false],
  ["favicon.png", 64, plain, true],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, draw, transparent] of OUT) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${draw(size)}</body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: path.join(ROOT, "public", file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(file);
}
await browser.close();
