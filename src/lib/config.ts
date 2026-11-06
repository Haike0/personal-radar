import os from "node:os";
import path from "node:path";

/**
 * Where Radar keeps its own data (radar.db, imported chats, push keys). Override with RADAR_DATA_DIR.
 * scripts/lib/env.mjs uses the same default, so keep the two in sync.
 */
export const DATA_DIR = process.env.RADAR_DATA_DIR ?? path.join(os.homedir(), ".personal-radar");

/** Chats imported with `npm run import` (LINE / WhatsApp / ChatLab JSON), one SQLite file per conversation. */
export const CHATS_DIR = path.join(DATA_DIR, "chats");
