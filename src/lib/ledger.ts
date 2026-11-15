import "server-only";
import * as chatlab from "./chatlab";
import { complete } from "./ai/deepseek";
import { resolve } from "./ai/model";
import { isExcluded } from "./ai-config";
import { db, getItem, getSetting, listItems, nowStr } from "./db";
import { langRule } from "../../scripts/lib/lang.mjs";
import { LEDGER_SQL } from "./ledger-schema";
import { keywords, LEDGER_SYSTEM, ledgerInput, parseLedger, pickWindow } from "../../scripts/lib/ledger.mjs";
import type { Item } from "./types";

export type Who = "me" | "them" | "both";
export type Verdict = "done" | "not" | "skip";
export interface LedgerRow {
  id: number; title: string; who: Who; saidAt: string | null; due: string | null; future: boolean;
  quote: { mid: string | null; ts: string; sender: string; text: string } | null;
  ai: { result: "done" | "not" | "unclear"; reason: string | null; proof: { mid: string; ts: string; sender: string; text: string } | null } | null;
  verdict: Verdict | null;
}

let ready = false;
function d() {
  const x = db();
  if (!ready) { x.exec(LEDGER_SQL); ready = true; }
  return x;
}
type Row = Record<string, unknown>;

const promises = (key: string) => listItems({ person: key }).filter((i) => i.kind === "promise" && !["ignored", "superseded", "cancelled"].includes(i.status));
const guess = (i: Item): Who => (i.subject === "self" ? "me" : i.subject === "both" ? "both" : "them");
const today = () => nowStr().slice(0, 10);

function quoteOf(i: Item, who: Who) {
  const ev = (getItem(i.id)?.evidence ?? []).filter((e) => e.isKey && e.text.trim());
  if (!ev.length) return null;
  const mine = (s: string) => s === "我";
  const pick = [...ev].reverse().find((e) => (who === "me" ? mine(e.sender) : who === "them" ? !mine(e.sender) : true)) ?? ev[ev.length - 1];
  return { mid: pick.messageId, ts: pick.ts, sender: pick.sender, text: pick.text, last: ev[ev.length - 1] };
}

export function list(key: string): { rows: LedgerRow[]; unchecked: number; aiReady: boolean } {
  const saved = new Map((d().prepare("SELECT * FROM ledger").all() as Row[]).map((r) => [Number(r.item_id), r]));
  const rows = promises(key).map((i): LedgerRow => {
    const s = saved.get(i.id);
    const who = ((s?.who_fixed as string) || (s?.who as string) || guess(i)) as Who;
    const q = quoteOf(i, who);
    return {
      id: i.id, title: i.title, who, saidAt: i.observedAt ?? q?.ts ?? null, due: i.eventDate,
      future: !!i.eventDate && i.eventDate >= today(),
      quote: q ? { mid: q.mid, ts: q.ts, sender: q.sender, text: q.text } : null,
      ai: s?.checked_at ? {
        result: (s.ai as "done" | "not" | "unclear") ?? "unclear", reason: (s.reason as string) ?? null,
        proof: s.proof_mid ? { mid: String(s.proof_mid), ts: String(s.proof_ts), sender: String(s.proof_sender), text: String(s.proof_text) } : null,
      } : null,
      verdict: (s?.verdict as Verdict) ?? null,
    };
  });
  rows.sort((a, b) => (b.saidAt ?? "").localeCompare(a.saidAt ?? ""));
  return { rows, unchecked: rows.filter((r) => !r.ai).length, aiReady: !!resolve("fast").key };
}

/** Ask the AI about promises it hasn't looked at yet (a batch at a time, so one click never runs for minutes). */
export async function check(key: string, name: string, batch = 24) {
  if (isExcluded(key)) return { error: "这个人设成了「不发给 AI」，账本只能手动标。" };
  if (!resolve("fast").key) return { error: "还没设置 AI 服务。到「设置 → AI」填好密钥再来。" };
  const done = new Set((d().prepare("SELECT item_id FROM ledger WHERE checked_at IS NOT NULL").all() as Row[]).map((r) => Number(r.item_id)));
  const todo = promises(key).filter((i) => !done.has(i.id));
  const up = d().prepare(`INSERT INTO ledger(item_id,who,ai,reason,proof_mid,proof_ts,proof_sender,proof_text,checked_at) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(item_id) DO UPDATE SET who=excluded.who, ai=excluded.ai, reason=excluded.reason, proof_mid=excluded.proof_mid,
      proof_ts=excluded.proof_ts, proof_sender=excluded.proof_sender, proof_text=excluded.proof_text, checked_at=excluded.checked_at`);
  let checked = 0, failed = 0;
  const one = async (i: Item) => {
    const q = quoteOf(i, guess(i));
    const all = q?.last.messageId ? chatlab.after(key, q.last.messageId, 20000).filter((m) => m.text.trim()) : [];
    // the days around the promised date, if it has one
    const due = i.eventDate ? new Date(i.eventDate + "T00:00:00").getTime() / 1000 : null;
    const nearDue = (k: number) => due != null && all[k].epoch >= due - 86400 && all[k].epoch < due + 3 * 86400;
    const idx = pickWindow(all, keywords(i.title, name), nearDue);
    const after = idx.map((k) => all[k]);
    const shown = idx.map((k, n) => ({ who: all[k].isSelf ? "我" : name, text: all[k].text, ts: all[k].ts, gap: n > 0 && k !== idx[n - 1] + 1 }));
    const quotes = (getItem(i.id)?.evidence ?? []).filter((e) => e.isKey).slice(-4).map((e) => `${e.sender === "我" ? "我" : name}：${e.text.slice(0, 100)}`);
    const raw = await complete(LEDGER_SYSTEM + langRule(getSetting("ui_lang")), ledgerInput({ title: i.title, summary: i.summary, whoGuess: i.subject ?? "them", quotes, name }, shown), 200);
    const r = parseLedger(raw, shown.length);
    if (!r) { failed++; return; }
    const p = r.proof ? after[r.proof - 1] : null;
    up.run(i.id, r.who ?? guess(i), r.result, r.reason, p?.messageId ?? null, p?.ts.slice(0, 16) ?? null, p ? (p.isSelf ? "我" : p.sender) : null, p?.text ?? null, nowStr());
    checked++;
  };
  // a few at a time: fast enough to share right after importing, gentle on rate limits
  const queue = todo.slice(0, batch);
  await Promise.all(Array.from({ length: 4 }, async () => { for (let i = queue.shift(); i; i = queue.shift()) await one(i); }));
  return { checked, failed, remaining: Math.max(0, todo.length - checked - failed) };
}

/** The user's call on one promise (and, if the AI got it backwards, who made it). */
export function decide(id: number, patch: { verdict?: Verdict | null; who?: Who }) {
  d().prepare("INSERT OR IGNORE INTO ledger(item_id) VALUES(?)").run(id);
  if (patch.verdict !== undefined) d().prepare("UPDATE ledger SET verdict=?, decided_at=? WHERE item_id=?").run(patch.verdict, nowStr(), id);
  if (patch.who) d().prepare("UPDATE ledger SET who_fixed=? WHERE item_id=?").run(patch.who, id);
}
