import { connection } from "next/server";
import { db, getSettings, nowStr } from "@/lib/db";
import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import pkg from "../../../../../package.json";

// Everything ReadMe itself wrote (records, evidence links, edits, analyses, day summaries, settings without secrets) as one JSON file.
// The imported chats themselves are SQLite files in the data folder's chats/ and are not repeated here.
const SECRET = new Set(["ai_key", "chatlab_api_token", "beeper_api_token", "bark_key", "bark_encrypt_key"]);
const table = (name: string) => { try { return db().prepare(`SELECT * FROM ${name}`).all(); } catch { return []; } };

export async function GET() {
  await connection();
  if (DEMO_ONLY) return demoOnlyResponse();
  const settings = Object.fromEntries(Object.entries(getSettings()).filter(([k]) => !SECRET.has(k)));
  const body = {
    app: "personal-radar", version: pkg.version, exportedAt: nowStr(),
    items: table("items"), evidence: table("evidence"), history: table("history"),
    person_analysis: table("person_analysis"), day_summary: table("day_summary"), settings,
  };
  return new Response(JSON.stringify(body, null, 1), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="radar-export-${nowStr().slice(0, 10)}.json"` },
  });
}
