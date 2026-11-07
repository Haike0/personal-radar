import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config";

// Derived, local-only ASR. This database is separate from the read-only chat databases.
let cached: DatabaseSync | null = null;
function open(): DatabaseSync | null {
  const dir = DATA_DIR;
  const file = path.join(dir, "voice-transcripts.db");
  if (!fs.existsSync(file)) return null;
  try {
    if (!cached) cached = new DatabaseSync(file, { readOnly: true });
    return cached;
  } catch {
    return null; // sidecar unreadable → pages fall back to the original text
  }
}
// LIKE treats % and _ as wildcards; escape user input so a search for "50%" means the literal text
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;

export function voiceText(messageId: string): string | null {
  const d = open();
  if (!d) return null;
  let r: { text: string | null; quality_flags: string } | undefined;
  try {
    r = d.prepare("SELECT text,quality_flags FROM voice_transcripts WHERE message_id=? AND state='transcribed' AND review<>'rejected'")
      .get(messageId) as typeof r;
  } catch {
    return null; // locked/corrupt/old schema: show the original "[语音]" placeholder instead of breaking the page
  }
  if (!r?.text?.trim()) return null;
  const uncertain = r.quality_flags !== "[]";
  return `[语音 AI 转写·待核对${uncertain ? "·识别存疑" : ""}] ${r.text}`;
}

export function searchVoiceIds(sessionId: string, query: string, limit: number): string[] {
  const d = open();
  if (!d) return [];
  try {
    const rows = d.prepare("SELECT message_id FROM voice_transcripts WHERE session_id=? AND state='transcribed' AND review<>'rejected' AND text LIKE ? ESCAPE '\\' ORDER BY ts DESC,chatlab_id DESC LIMIT ?")
      .all(sessionId, like(query), Math.max(1, Math.min(100, limit))) as { message_id: string }[];
    return rows.map((r) => r.message_id);
  } catch {
    return [];
  }
}

/** How many voice messages have a local transcript, how many of those are flagged as doubtful, how many failed. */
export function voiceStats(sessionId?: string): { transcribed: number; doubtful: number; missing: number } {
  const d = open();
  if (!d) return { transcribed: 0, doubtful: 0, missing: 0 };
  try {
    const r = d.prepare(`SELECT SUM(state='transcribed') t, SUM(state='transcribed' AND quality_flags<>'[]') q, SUM(state<>'transcribed') m
      FROM voice_transcripts WHERE (? IS NULL OR session_id=?)`).get(sessionId ?? null, sessionId ?? null) as { t: number | null; q: number | null; m: number | null };
    return { transcribed: r.t ?? 0, doubtful: r.q ?? 0, missing: r.m ?? 0 };
  } catch {
    return { transcribed: 0, doubtful: 0, missing: 0 };
  }
}
