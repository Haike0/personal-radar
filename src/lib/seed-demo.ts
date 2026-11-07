import type { DatabaseSync } from "node:sqlite";
import { LEDGER_SQL } from "./ledger-schema";
import { clearNightChats, nightAvailable, seedNight } from "./seed-night";

// Clearly-labelled demo data (mode='demo'). Names are fictional; never real chat content.

export type DemoSet = "love" | "work" | "night";
export const DEMO_SETS: DemoSet[] = ["love", "work", "night"];
const asSet = (x: string | undefined): DemoSet => (DEMO_SETS.includes(x as DemoSet) ? (x as DemoSet) : "love");

// Each scenario is a folder under demo/ (chats + items + analysis), written by scripts/demo-gen-*.mjs.
export function seedDemo(d: DatabaseSync, set: string = "love") {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const dateOf = (off: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + off);
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  const now = `${dateOf(0)} ${p(today.getHours())}:${p(today.getMinutes())}:00`;
  const s = asSet(set);
  if (!nightAvailable(s)) { clearNightChats(); return; }
  ensureAnalysisTable(d);
  seedNight(d, now, dateOf, s);
}

/** Replace the demo rows with another demo set (real data is never touched). */
export function reseedDemo(d: DatabaseSync, set: string) {
  const ids = "SELECT id FROM items WHERE mode='demo'";
  d.exec(LEDGER_SQL);
  d.exec(`DELETE FROM evidence WHERE item_id IN (${ids}); DELETE FROM history WHERE item_id IN (${ids}); DELETE FROM ledger WHERE item_id IN (${ids}); DELETE FROM items WHERE mode='demo';`);
  ensureAnalysisTable(d);
  d.exec("DELETE FROM person_analysis WHERE session_id LIKE 'demo:%'");
  seedDemo(d, set);
}

// same shape the background analysis job writes; demo rows use session ids "demo:<person>"
function ensureAnalysisTable(d: DatabaseSync) {
  d.exec("CREATE TABLE IF NOT EXISTS person_analysis(session_id TEXT PRIMARY KEY, content TEXT NOT NULL, basis_items INTEGER NOT NULL, basis_until TEXT, generated_at TEXT NOT NULL)");
}
