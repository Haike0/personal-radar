import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";

// Result of the last `npm run import` (written by scripts/import.mjs).
const STATE = path.join(DATA_DIR, "import-state.json");

export type SyncStatus = { ok: boolean | null; at: string | null; error: string | null; newMessages: number | null };
export function syncStatus(): SyncStatus {
  try {
    const d = JSON.parse(fs.readFileSync(STATE, "utf8"));
    const n = (d.sessions ?? []).reduce((a: number, s: { new?: number }) => a + (s.new ?? 0), 0);
    return { ok: Boolean(d.ok), at: d.finishedAt ?? null, error: d.error ?? null, newMessages: n };
  } catch {
    return { ok: null, at: null, error: null, newMessages: null };
  }
}
