// Brand images for the README, website and social posts, built from the real screenshots (media/out/shots).
//   node media/compose.mjs      → docs/assets/
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHOTS = path.join(import.meta.dirname, "out", "shots");
const OUT = path.join(ROOT, "docs", "assets");
const COPY = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "copy.json"), "utf8"));
const ICON = fs.readFileSync(path.join(ROOT, "public/brand/icon.svg"), "utf8");
const LANGS = ["zh-Hans", "en", "ja"];
const short = { "zh-Hans": "zh", en: "en", ja: "ja" };
fs.mkdirSync(OUT, { recursive: true });

const uri = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
const FONT = `-apple-system, "SF Pro Display", "Hiragino Sans", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
const base = (body, w, h, bg = "transparent") => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px;background:${bg};font-family:${FONT};-webkit-font-smoothing:antialiased;overflow:hidden}
.phone{position:absolute;border-radius:64px;padding:13px;background:#0d0d10;box-shadow:0 0 0 2px #2a2a30 inset,0 40px 80px -20px rgba(0,0,0,.45),0 18px 36px -18px rgba(0,0,0,.35)}
.phone .scr{width:100%;height:100%;border-radius:52px;overflow:hidden;position:relative;background:#f5f6fa}
.phone .scr img{width:100%;display:block}
.phone .sb{height:54px;display:flex;align-items:center;justify-content:space-between;padding:6px 34px 0 40px;font-size:16px}
.phone .sb span{display:flex;gap:3px;align-items:flex-end}.phone .sb i{display:block;width:4px;background:currentColor;border-radius:1px}.phone .sb i:nth-child(1){height:6px}.phone .sb i:nth-child(2){height:9px}.phone .sb i:nth-child(3){height:12px}
.phone .sb em{display:block;width:24px;height:11px;border:1.5px solid currentColor;border-radius:3px;margin-left:6px;position:relative}
.phone .island{position:absolute;top:24px;left:50%;transform:translateX(-50%);width:112px;height:32px;border-radius:20px;background:#000;z-index:2}
.win{position:absolute;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 50px 100px -30px rgba(0,0,0,.6)}
.win .bar{height:38px;background:#ececf0;display:flex;align-items:center;gap:8px;padding:0 16px}
.win .bar i{width:12px;height:12px;border-radius:50%;display:block}
.win img{display:block;width:100%}
</style></head><body>${body}</body></html>`;
const phone = (img, x, y, w, dark = false) => `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;height:${w * 2.06}px"><div class="island"></div><div class="scr" style="background:${dark ? "#10131d" : "#f5f6fa"}"><div class="sb" style="color:${dark ? "#fff" : "#111"}"><b>9:41</b><span><i></i><i></i><i></i><em></em></span></div><img src="${img}"></div></div>`;
const win = (img, x, y, w, dark = false) => `<div class="win" style="left:${x}px;top:${y}px;width:${w}px"><div class="bar" style="background:${dark ? "#23252e" : "#ececf0"}"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></div><img src="${img}"></div>`;
const glow = (dark) => dark
  ? `<div style="position:absolute;inset:0;background:radial-gradient(60% 55% at 50% 0%,rgba(47,216,180,.22),transparent 70%),radial-gradient(45% 45% at 85% 20%,rgba(47,139,255,.16),transparent 70%)"></div>`
  : `<div style="position:absolute;inset:0;background:radial-gradient(55% 60% at 50% 0%,rgba(47,216,180,.10),transparent 70%),radial-gradient(40% 40% at 88% 15%,rgba(47,139,255,.10),transparent 70%)"></div>`;
const logo = (size) => ICON.replace("<svg ", `<svg width="${size}" height="${size}" `);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
async function render(file, html, w, h, opts = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(150);
  const p = path.join(OUT, file);
  await page.screenshot({ path: p, omitBackground: !!opts.transparent, type: "png" });
  // smaller files for GitHub: WebP keeps transparency
  execFileSync("cwebp", ["-quiet", "-q", String(opts.q ?? 86), "-alpha_q", "100", p, "-o", p.replace(/\.png$/, ".webp")]);
  if (!opts.keepPng) fs.rmSync(p);
  console.log(file);
}

for (const lang of LANGS) {
  const c = COPY[lang], L = short[lang], S = (s, f) => uri(path.join(SHOTS, lang, s, f));
  for (const dark of [false, true]) {
    const fg = dark ? "#fff" : "#111216", sub = dark ? "rgba(255,255,255,.62)" : "#5b5d66", bg = dark ? "#0b0b10" : "#fbfaf8";
    // banner: logo, name, one line
    await render(`banner-${L}-${dark ? "dark" : "light"}.png`, base(`${glow(dark)}
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">
        <div style="display:flex;align-items:center;gap:26px">${logo(112)}<div style="font-size:104px;font-weight:700;letter-spacing:-3px;color:${fg}">ReadMe</div></div>
        <div style="font-size:34px;color:${sub};letter-spacing:.5px">${c.tagline}</div>
      </div>`, 1600, 440, bg), 1600, 440);
    // hero: the desktop app with the phone in front
    const s = dark ? "dark" : "light";
    await render(`hero-${L}-${s}.png`, base(`${glow(dark)}
      ${win(S(s, "desktop-today.png"), 70, 70, 1180, dark)}
      ${phone(S(s, "phone-ledger.png"), 1150, 250, 360, dark)}`, 1600, 1060, bg), 1600, 1060);
  }
  // feature tiles: phone frames on transparent background
  for (const [key] of c.features) {
    const f = key === "card" ? "phone-ledger.png" : `phone-${key}.png`;
    await render(`tile-${key}-${L}.png`, base(phone(S("light", f), 20, 20, 420), 460, 905), 460, 905, { transparent: true });
  }
  // the share card on its own
  await render(`card-${L}.png`, base(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><img src="${S("light", "phone-card.png")}" style="width:520px;border-radius:28px;box-shadow:0 30px 60px -20px rgba(0,0,0,.35)"></div>`, 600, 820), 600, 820, { transparent: true });
  // social preview (GitHub uses 1280×640)
  await render(`social-${L}.png`, base(`${glow(true)}
    <div style="position:absolute;left:84px;top:0;bottom:0;width:640px;display:flex;flex-direction:column;justify-content:center;gap:26px">
      <div style="display:flex;align-items:center;gap:18px">${logo(76)}<div style="font-size:64px;font-weight:700;letter-spacing:-2px;color:#fff">ReadMe</div></div>
      <div style="font-size:${lang === "en" ? 46 : 38}px;line-height:1.25;font-weight:650;color:#fff;${lang === "en" ? "" : "white-space:nowrap"}">${c.tagline}</div>
      <div style="font-size:24px;line-height:1.5;color:rgba(255,255,255,.6)">${c.openSource}</div>
    </div>
    ${phone(S("light", "phone-ledger.png"), 820, 70, 330)}`, 1280, 640, "#0b0b10"), 1280, 640, { keepPng: true });
}
await browser.close();
