// Shared by the command-line scripts: data paths and the AI endpoint, same defaults as src/lib/config.ts.
// Reads .env.local / .env from the project root (Next.js does this for the app itself).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, f), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

export const ROOT_DIR = ROOT;
export const DATA_DIR = process.env.RADAR_DATA_DIR ?? path.join(os.homedir(), ".personal-radar");
export const CHATS_DIR = path.join(DATA_DIR, "chats");
export const RADAR_DB = path.join(DATA_DIR, "radar.db");
// Settings saved in the app (设置 → AI 设置 / 隐私) live in radar.db; keys live in keys.json next to it.
import { DatabaseSync } from "node:sqlite";
import { privacyConfig, outbound } from "./redact.mjs";
import { migrateLegacy, resolveRole } from "./ai-services.mjs";
function saved() {
  try {
    if (!fs.existsSync(RADAR_DB)) return {};
    const d = new DatabaseSync(RADAR_DB);
    migrateLegacy(d, DATA_DIR);
    const rows = d.prepare("SELECT key, value FROM settings").all();
    d.close();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch { return {}; }
}
const S = saved();
// Organizing uses the "整理模型" chosen in the app (the RADAR_AI_* service when nothing is chosen).
const R = resolveRole((k) => S[k], process.env, DATA_DIR, "fast");
export const AI = { key: R.key ?? "", baseUrl: R.service.baseUrl, model: R.model, service: R.service.name };
export const extraBody = () => R.extra;
/** Interface language chosen in the app (zh-Hans when unset). */
export const UI_LANG = S.ui_lang || "zh-Hans";
export const PRIVACY = privacyConfig((k) => S[k]);
/** Last step before a request leaves the computer: drop blacklisted lines, redact the rest. */
export const scrub = (text) => outbound(text, PRIVACY).text;
export function requireKey() {
  if (!AI.key) {
    console.error(`还没有 ${AI.service} 的密钥：在 App 的「设置 → AI 设置」里填，或在 .env.local 里设 RADAR_AI_KEY。`);
    process.exit(2);
  }
  return AI.key;
}
