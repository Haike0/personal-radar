import os from "node:os";
import path from "node:path";

/**
 * Where Radar keeps its own data (radar.db, imported chats, push keys). Override with RADAR_DATA_DIR.
 * scripts/lib/env.mjs uses the same default, so keep the two in sync.
 */
export const DATA_DIR = process.env.RADAR_DATA_DIR ?? path.join(os.homedir(), ".personal-radar");

/** Chats imported with `npm run import` (LINE / WhatsApp / ChatLab JSON), one SQLite file per conversation. */
export const CHATS_DIR = path.join(DATA_DIR, "chats");

/** OpenAI-compatible chat API. DeepSeek is the default; any compatible endpoint works. */
export const AI = {
  key: () => (process.env.RADAR_AI_KEY ?? "").trim() || null,
  baseUrl: (process.env.RADAR_AI_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/, ""),
  model: process.env.RADAR_AI_MODEL ?? "deepseek-flash",
};
