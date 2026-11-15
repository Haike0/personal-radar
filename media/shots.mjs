// Screenshots of the real app with the fictional demo data, in three languages, phone + desktop.
// Start ReadMe on its own data folder first, e.g.
//   RADAR_DATA_DIR=/tmp/readme-shots node bin/radar.mjs --port 3240 --no-open
// then: node media/shots.mjs   (BASE=http://127.0.0.1:3240 by default)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://127.0.0.1:3240";
const OUT = path.join(import.meta.dirname, "out", "shots");
const LANGS = (process.env.LANGS ?? "zh-Hans,en,ja").split(",");
const SCHEMES = (process.env.SCHEMES ?? "light,dark").split(",");
const PERSON = "demo_xiaoyu";

const api = (p, method = "GET", body) =>
  fetch(BASE + p, { method, headers: { "content-type": "application/json", origin: BASE }, body: body && JSON.stringify(body) }).then((r) => r.json());

const PAGES = [
  ["today", "/"],
  ["person", `/people/${PERSON}`],
  ["ledger", `/people/${PERSON}/ledger`],
  ["report", `/people/${PERSON}/report`],
  ["calendar", "/timeline"],
  ["ask", "/companion"],
  ["sources", "/settings/sources"],
];
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

const browser = await chromium.launch();
for (const lang of LANGS) {
  await api("/api/onboarding", "POST", { state: "demo", demo_set: "love" });
  await api("/api/settings", "PATCH", { mode: "demo", demo_set: "love", ui_lang: lang });
  for (const scheme of SCHEMES) for (const [dev, opts] of Object.entries(DEVICES)) {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme, locale: lang });
    await ctx.addInitScript(([l, s]) => {
      localStorage.setItem("radar.lang", l);
      localStorage.setItem("mantine-color-scheme-value", s);
    }, [lang, scheme]);
    const page = await ctx.newPage();
    const dir = path.join(OUT, lang, scheme);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, url] of PAGES) {
      await page.goto(BASE + url, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(dir, `${dev}-${name}.png`) });
      if (dev === "phone" && ["today", "person", "ledger", "report"].includes(name)) {
        // long screenshots for scrolling in the video: hide the floating tab bar and AI button so they don't sit mid-page
        await page.evaluate(() => { for (const el of document.querySelectorAll("body *")) { const s = getComputedStyle(el); if (s.position === "fixed" && el.getBoundingClientRect().top > 300) el.setAttribute("data-shot-hidden", el.style.visibility || "-"), (el.style.visibility = "hidden"); } });
        await page.screenshot({ path: path.join(dir, `${dev}-${name}-full.png`), fullPage: true });
        await page.evaluate(() => { for (const el of document.querySelectorAll("[data-shot-hidden]")) { const v = el.getAttribute("data-shot-hidden"); el.style.visibility = v === "-" ? "" : v; el.removeAttribute("data-shot-hidden"); } });
      }
    }
    // the share card (opens from the ledger page)
    await page.goto(BASE + `/people/${PERSON}/ledger`, { waitUntil: "networkidle" });
    const btn = page.locator("button").filter({ hasText: /晒图|曬圖|Share|シェア|共有|投稿/ }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(2500);
      const img = page.locator('img[alt]').filter({ has: page.locator("xpath=self::img[contains(@src,'data:image')]") }).first();
      const card = (await img.count()) ? img : page.locator(".mantine-Modal-content").first();
      await card.screenshot({ path: path.join(dir, `${dev}-card.png`) });
    }
    await ctx.close();
    console.log("done", lang, scheme, dev);
  }
}
await browser.close();
