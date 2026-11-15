// Copy the screenshots and brand files the video needs into video/public.
import fs from "node:fs";
import path from "node:path";
const here = import.meta.dirname, media = path.dirname(here), root = path.dirname(media);
const pub = path.join(here, "public");
fs.mkdirSync(pub, { recursive: true });
for (const [L, dir] of [["zh", "zh-Hans"], ["en", "en"], ["ja", "ja"]]) {
  for (const f of ["phone-today-full", "phone-person-full", "phone-ledger", "phone-card", "desktop-calendar", "desktop-today", "phone-report-full"]) {
    const s = path.join(media, "out", "shots", dir, "light", `${f}.png`);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(pub, `${L}-${f}.png`));
  }
}
fs.copyFileSync(path.join(root, "public", "brand", "icon-1024.png"), path.join(pub, "icon.png"));
fs.copyFileSync(path.join(media, "video-lines.json"), path.join(here, "lines.json"));
await import("./bgm.mjs");
console.log("prepared", fs.readdirSync(pub).length, "files");
// image sizes, so the phone can scroll exactly to the bottom of each long screenshot
const dims = {};
for (const f of fs.readdirSync(pub).filter((f) => f.endsWith(".png"))) {
  const b = fs.readFileSync(path.join(pub, f));
  dims[f] = [b.readUInt32BE(16), b.readUInt32BE(20)];
}
fs.writeFileSync(path.join(here, "dims.json"), JSON.stringify(dims));
