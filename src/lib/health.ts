import "server-only";
import * as chatlab from "./chatlab";
import { currentMode, db, listPeople } from "./db";
import { syncStatus, type SyncStatus } from "./sync";
import { isKnowledge, KIND_LABEL, type Kind } from "./types";
import { voiceStats } from "./voice";

// "Data health": three separate kinds of progress that must not be confused —
// 聊天已导入 (import) → AI 已整理 (organizer cursor) → 你已核对 (review). Plus voice-transcript coverage.

export interface PersonHealth {
  key: string; name: string;
  remaining: number | null;       // text messages in the chat that the organizer hasn't read yet
  organizedUntil: string | null;   // last message time the organizer has read
  analysisAt: string | null;
  voice: { total: number; transcribed: number; doubtful: number; missing: number };
}
export interface Health {
  mode: "demo" | "real";
  sync: SyncStatus;
  people: PersonHealth[];
  review: {
    actionPending: number; knowledgePending: number;    // still to check
    accepted: number; rejected: number;                  // checked so far
    byKind: { kind: Kind; label: string; accepted: number; rejected: number }[];
  };
}

type Row = Record<string, unknown>;
const fmt = (epoch: number) => {
  const d = new Date(epoch * 1000), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function health(person?: string): Health {
  const mode = currentMode();
  const d = db();
  const people: PersonHealth[] = [];
  if (mode === "real") {
    const cursors = new Map<string, Row>();
    try { for (const r of d.prepare("SELECT * FROM ai_cursor").all() as Row[]) cursors.set(String(r.session_id), r); } catch { /* organizer never ran */ }
    const analyses = new Map<string, string>();
    try { for (const r of d.prepare("SELECT session_id, generated_at FROM person_analysis").all() as Row[]) analyses.set(String(r.session_id), String(r.generated_at)); } catch {}
    for (const p of listPeople("real").filter((x) => !x.isGroup && (!person || x.key === person))) {
      const c = cursors.get(p.key);
      const v = voiceStats(p.key);
      people.push({
        key: p.key, name: p.name,
        remaining: c ? chatlab.countTextAfter(p.key, Number(c.last_ts), Number(c.last_id)) : null,
        organizedUntil: c ? fmt(Number(c.last_ts)) : null,
        analysisAt: analyses.get(p.key) ?? null,
        voice: { total: chatlab.countVoice(p.key), ...v },
      });
    }
  }
  const where = person ? "AND person_key=?" : "";
  const args = person ? [mode, person] : [mode];
  const rows = d.prepare(`SELECT kind, review, status FROM items WHERE mode=? AND origin='ai' ${where}`).all(...args) as Row[];
  const byKind = new Map<Kind, { accepted: number; rejected: number }>();
  let actionPending = 0, knowledgePending = 0, accepted = 0, rejected = 0;
  for (const r of rows) {
    const kind = r.kind as Kind;
    if (r.review === "pending") {
      if (isKnowledge({ kind })) knowledgePending++;
      else if (r.status === "open") actionPending++;
    } else if (r.review === "accepted" || r.review === "rejected") {
      const k = byKind.get(kind) ?? { accepted: 0, rejected: 0 };
      k[r.review]++;
      byKind.set(kind, k);
      if (r.review === "accepted") accepted++; else rejected++;
    }
  }
  return {
    mode, sync: syncStatus(), people,
    review: { actionPending, knowledgePending, accepted, rejected, byKind: [...byKind].map(([kind, v]) => ({ kind, label: KIND_LABEL[kind], ...v })) },
  };
}
