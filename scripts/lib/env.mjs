// Shared by the command-line scripts: data paths and the AI endpoint, same defaults as src/lib/config.ts.
// Reads .env.local / .env from the project root (Next.js does this for the app itself).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

export const ROOT_DIR = ROOT;
export const DATA_DIR = process.env.RADAR_DATA_DIR ?? path.join(os.homedir(), ".personal-radar");
export const CHATS_DIR = path.join(DATA_DIR, "chats");
export const RADAR_DB = path.join(DATA_DIR, "radar.db");
// Settings saved in the app (设置 → AI 服务 / 隐私) live in radar.db; environment variables override them.
import { DatabaseSync } from "node:sqlite";
import { privacyConfig, outbound } from "./redact.mjs";
function saved() {
  try {
    const d = new DatabaseSync(RADAR_DB, { readOnly: true });
    const rows = d.prepare("SELECT key, value FROM settings").all();
    d.close();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch { return {}; }
}
const S = saved();
const baseUrl = (process.env.RADAR_AI_BASE_URL || S.ai_base_url || "https://api.deepseek.com").replace(/\/+$/, "");
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(baseUrl + "/");
export const AI = {
  key: (process.env.RADAR_AI_KEY || S.ai_key || "").trim() || (isLocal ? "local" : ""),
  baseUrl,
  model: process.env.RADAR_AI_MODEL || S.ai_model || "deepseek-flash",
};
export const extraBody = () => (/deepseek/i.test(AI.baseUrl) ? { thinking: { type: "disabled" } } : {});
export const PRIVACY = privacyConfig((k) => S[k]);
/** Last step before a request leaves the computer: drop blacklisted lines, redact the rest. */
export const scrub = (text) => outbound(text, PRIVACY).text;
export function requireKey() {
  if (!AI.key) {
    console.error("还没有设置 AI 服务：在 App 的「设置 → AI 服务」里填密钥，或在 .env.local 里设 RADAR_AI_KEY。");
    process.exit(2);
  }
  return AI.key;
}
