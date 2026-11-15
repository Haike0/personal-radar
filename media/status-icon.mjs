// Render the macOS menu-bar icon (template image: black on transparent) from packaging/mac/status.svg.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "packaging/mac/status.svg"), "utf8").replace("<svg ", '<svg width="36" height="36" ');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 36, height: 36 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: path.join(ROOT, "packaging/mac/StatusIcon.png"), omitBackground: true, clip: { x: 0, y: 0, width: 36, height: 36 } });
const big = svg.replace('width="36" height="36"', 'width="360" height="360"');
await page.setViewportSize({ width: 360, height: 360 });
await page.setContent(`<html><body style="margin:0;background:#e9e9e9">${big}</body></html>`);
await page.screenshot({ path: process.argv[2] ?? "/dev/null", clip: { x: 0, y: 0, width: 360, height: 360 } });
await browser.close();
