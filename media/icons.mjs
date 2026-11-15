// Render the app icons from public/brand/icon.svg.
//   node media/icons.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "public/brand/icon.svg"), "utf8");
// full-bleed square (iOS and Android round it themselves); the glyph shrinks into the 80% safe zone for "maskable"
const square = svg.replace(/rx="228"/g, 'rx="0"');
const maskable = square.replace(/(<path[\s\S]*<\/svg>)/, (m) => `<g transform="translate(102.4 102.4) scale(0.8)">${m.replace("</svg>", "")}</g></svg>`);

const OUT = [
  ["icons/icon-192.png", 192, svg, true],
  ["icons/icon-512.png", 512, svg, true],
  ["icons/icon-512-maskable.png", 512, maskable, false],
  ["icons/apple-touch-icon.png", 180, square, false],
  ["brand/icon-1024.png", 1024, svg, true],
  ["favicon.png", 64, svg, true],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, src, transparent] of OUT) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, "public", file), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(file);
}
await browser.close();
