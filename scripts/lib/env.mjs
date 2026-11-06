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
export const AI = {
  key: (process.env.RADAR_AI_KEY ?? "").trim(),
  baseUrl: (process.env.RADAR_AI_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, ""),
  model: process.env.RADAR_AI_MODEL ?? "deepseek-flash",
};
export function requireKey() {
  if (!AI.key) {
    console.error("没有找到 API 密钥：把 .env.example 复制成 .env.local，填上 RADAR_AI_KEY。 / Set RADAR_AI_KEY in .env.local.");
    process.exit(2);
  }
  return AI.key;
}
