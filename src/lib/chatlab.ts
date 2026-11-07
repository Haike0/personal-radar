import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { voiceText, searchVoiceIds } from "./voice";
import { CHATS_DIR, DATA_DIR } from "./config";

/**
 * Read-only chat store. Every conversation is one SQLite file with the same simple layout
 * (meta / member / message tables). Radar reads three places:
 *   1. CHATS_DIR  — chats you imported with `npm run import` (LINE, WhatsApp, ChatLab JSON)
 *   2. ChatLab    — only if you set CHATLAB_DATA_DIR (https://chatlab.fun): its session databases, opened read-only
 *   3. demoDir()  — fictional demo chats (ids start with "demo_")
 * Nothing here ever writes to a chat database.
 */
// ChatLab is opt-in: only read when you point CHATLAB_DATA_DIR at its data folder (usually ~/.chatlab/data).
function chatlabDir(): string | null {
  const dir = process.env.CHATLAB_DATA_DIR?.replace(/^~(?=\/)/, os.homedir());
  return dir && fs.existsSync(dir) ? dir : null;
}
const realDirs = () => [CHATS_DIR, ...(chatlabDir() ? [path.join(chatlabDir()!, "databases")] : [])];
export const demoDir = () => path.join(DATA_DIR, "demo-chats");
function fileFor(id: string): string | null {
  if (id.startsWith("demo_")) return path.join(demoDir(), `${id}.db`);
  for (const dir of realDirs()) {
    const f = path.join(dir, `${id}.db`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

export interface ChatSession { id: string; name: string; isGroup: boolean; platform: string; messages: number; members: number; lastTs: number | null }
export interface ChatMessage { messageId: string; ts: string; epoch: number; sender: string; isSelf: boolean; type: number; text: string }

const VALID_ID = /^[A-Za-z0-9_@][A-Za-z0-9._@-]{0,127}$/;
const cache = new Map<string, DatabaseSync>();
function open(sessionId: string): DatabaseSync | null {
  if (!VALID_ID.test(sessionId)) return null;
  const f = fileFor(sessionId);
  if (!f || !fs.existsSync(f)) return null;
  let d = cache.get(sessionId);
  if (!d) {
    d = new DatabaseSync(f, { readOnly: true });
    cache.set(sessionId, d);
  }
  return d;
}

const fmt = (epoch: number) => {
  const d = new Date(epoch * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Row = Record<string, unknown>;
function owner(d: DatabaseSync): string | null {
  const r = d.prepare("SELECT owner_id FROM meta LIMIT 1").get() as Row | undefined;
  return (r?.owner_id as string) ?? null;
}
const SELECT = `SELECT m.id, m.platform_message_id pid, m.ts, m.type, m.content,
  COALESCE(NULLIF(m.sender_account_name,''), mb.account_name) sender, mb.platform_id spid
  FROM message m JOIN member mb ON mb.id = m.sender_id`;
function toMsg(r: Row, self: string | null): ChatMessage {
  const isSelf = r.spid === self;
  return {
    messageId: String(r.pid), ts: fmt(Number(r.ts)), epoch: Number(r.ts), sender: isSelf ? "我" : String(r.sender ?? "未知"),
    isSelf, type: Number(r.type), text: (Number(r.type) === 2 ? voiceText(String(r.pid)) : null) ?? String(r.content ?? ""),
  };
}

export function status(): { ok: boolean; dir: string; sessions: number; error?: string } {
  const sessions = listSessions("real").length;
  return { ok: sessions > 0, dir: realDirs().join(" + "), sessions, error: sessions ? undefined : "还没有导入聊天，在下面「导入聊天」里把导出文件拖进来" };
}

/** Drop cached handles of imported chats (after an import, so the next read sees the new file state). */
export function closeReal() {
  for (const [id, d] of cache) if (!id.startsWith("demo_")) { try { d.close(); } catch {} cache.delete(id); }
}

/** Drop cached handles (demo dbs are rebuilt when the demo set changes). */
export function closeDemo() {
  for (const [id, d] of cache) if (id.startsWith("demo_")) { try { d.close(); } catch {} cache.delete(id); }
}

export function listSessions(mode: "real" | "demo" = "real"): ChatSession[] {
  const files = new Set<string>();
  for (const dir of mode === "demo" ? [demoDir()] : realDirs()) {
    try { for (const f of fs.readdirSync(dir)) if (f.endsWith(".db") && f.startsWith("demo_") === (mode === "demo")) files.add(f); } catch {}
  }
  const out: ChatSession[] = [];
  for (const f of files) {
    const id = f.replace(/\.db$/, "");
    const d = open(id);
    if (!d) continue;
    try {
      const m = d.prepare("SELECT name, platform, type FROM meta LIMIT 1").get() as Row;
      const c = d.prepare("SELECT COUNT(*) n, MAX(ts) last FROM message").get() as Row;
      const mem = d.prepare("SELECT COUNT(*) n FROM member WHERE platform_id NOT IN ('SYSTEM')").get() as Row;
      out.push({ id, name: String(m.name), isGroup: m.type === "group", platform: String(m.platform), messages: Number(c.n), members: Number(mem.n), lastTs: c.last == null ? null : Number(c.last) });
    } catch { /* not a ChatLab session db */ }
  }
  return out.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
}

export function getMessages(sessionId: string, ids: string[]): ChatMessage[] {
  const d = open(sessionId);
  if (!d || !ids.length) return [];
  const self = owner(d);
  const rows = d.prepare(`${SELECT} WHERE m.platform_message_id IN (${ids.map(() => "?").join(",")}) ORDER BY m.ts, m.id`).all(...ids) as Row[];
  return rows.map((r) => toMsg(r, self));
}

/** Messages around a given one (by time order), for “前后文”. */
export function getContext(sessionId: string, messageId: string, before = 3, after = 3): ChatMessage[] {
  const d = open(sessionId);
  if (!d) return [];
  const self = owner(d);
  const pivot = d.prepare("SELECT id, ts FROM message WHERE platform_message_id=?").get(messageId) as Row | undefined;
  if (!pivot) return [];
  const prev = d.prepare(`${SELECT} WHERE (m.ts < ? OR (m.ts = ? AND m.id < ?)) ORDER BY m.ts DESC, m.id DESC LIMIT ?`).all(pivot.ts as number, pivot.ts as number, pivot.id as number, before) as Row[];
  const cur = d.prepare(`${SELECT} WHERE m.id=?`).all(pivot.id as number) as Row[];
  const next = d.prepare(`${SELECT} WHERE (m.ts > ? OR (m.ts = ? AND m.id > ?)) ORDER BY m.ts, m.id LIMIT ?`).all(pivot.ts as number, pivot.ts as number, pivot.id as number, after) as Row[];
  return [...prev.reverse(), ...cur, ...next].map((r) => toMsg(r, self));
}

/** The latest `limit` messages of a session, oldest first (for “最近” questions). */
export function recent(sessionId: string, limit = 50): ChatMessage[] {
  const d = open(sessionId);
  if (!d) return [];
  const self = owner(d);
  const rows = d.prepare(`${SELECT} WHERE m.type <> 80 ORDER BY m.ts DESC, m.id DESC LIMIT ?`).all(Math.max(1, Math.min(200, limit))) as Row[];
  return rows.reverse().map((r) => toMsg(r, self));
}

/** Search a session's text messages (used by the AI's evidence tool later). */
export function search(sessionId: string, q: string, limit = 20): ChatMessage[] {
  const d = open(sessionId);
  if (!d || !q.trim()) return [];
  const self = owner(d);
  const pattern = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`; // literal match, not LIKE wildcards
  const rows = d.prepare(`${SELECT} WHERE m.content LIKE ? ESCAPE '\\' ORDER BY m.ts DESC, m.id DESC LIMIT ?`).all(pattern, limit) as Row[];
  const voiceIds = searchVoiceIds(sessionId, q, limit);
  if (voiceIds.length) {
    rows.push(...d.prepare(`${SELECT} WHERE m.type=2 AND m.platform_message_id IN (${voiceIds.map(() => "?").join(",")})`).all(...voiceIds) as Row[]);
  }
  const unique = [...new Map(rows.map((r) => [String(r.pid), r])).values()];
  return unique.sort((a, b) => Number(b.ts) - Number(a.ts) || Number(b.id) - Number(a.id)).slice(0, limit).map((r) => toMsg(r, self));
}

/** Plain facts about a conversation (no “closeness” scores). */
export function sessionStats(sessionId: string) {
  const d = open(sessionId);
  if (!d) return null;
  const self = owner(d);
  const r = d.prepare("SELECT COUNT(*) n, MIN(ts) first, MAX(ts) last FROM message WHERE type <> 80").get() as Row;
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;
  const r30 = d.prepare("SELECT COUNT(*) n FROM message WHERE ts >= ? AND type <> 80").get(since) as Row;
  const mine = self
    ? (d.prepare("SELECT COUNT(*) n FROM message m JOIN member mb ON mb.id=m.sender_id WHERE mb.platform_id=? AND m.type <> 80").get(self) as Row)
    : null;
  const n = Number(r.n);
  return {
    messages: n,
    firstAt: r.first == null ? null : fmt(Number(r.first)),
    lastAt: r.last == null ? null : fmt(Number(r.last)),
    last30: Number(r30.n),
    mineShare: mine && n ? Number(mine.n) / n : null,
  };
}

/** Text-like messages (the ones the organizer reads) after a cursor position. Read-only count. */
const TEXT_TYPES = "0,4,7,20,21,24,25,26"; // same set as scripts/radar-ai.mjs
export function countTextAfter(sessionId: string, ts: number, id: number): number | null {
  const d = open(sessionId);
  if (!d) return null;
  const r = d.prepare(`SELECT COUNT(*) n FROM message WHERE (ts > ? OR (ts = ? AND id > ?)) AND type IN (${TEXT_TYPES})`).get(ts, ts, id) as Row;
  return Number(r.n);
}
/** Number of voice messages in a conversation. */
export function countVoice(sessionId: string): number {
  const d = open(sessionId);
  if (!d) return 0;
  return Number((d.prepare("SELECT COUNT(*) n FROM message WHERE type = 2").get() as Row).n);
}

/** Messages per calendar day (local time), newest day first — the day list of 聊天记忆. */
export function dayCounts(sessionId: string): { date: string; messages: number }[] {
  const d = open(sessionId);
  if (!d) return [];
  const rows = d.prepare(`SELECT date(ts,'unixepoch','localtime') day, COUNT(*) n FROM message WHERE type <> 80 GROUP BY day ORDER BY day DESC`).all() as Row[];
  return rows.map((r) => ({ date: String(r.day), messages: Number(r.n) }));
}
/** All messages of one local calendar day, in order (capped so a huge day can't freeze the page). */
export function dayMessages(sessionId: string, date: string, cap = 3000): ChatMessage[] {
  const d = open(sessionId);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const self = owner(d);
  const rows = d.prepare(`${SELECT} WHERE m.type <> 80 AND date(m.ts,'unixepoch','localtime') = ? ORDER BY m.ts, m.id LIMIT ?`).all(date, cap) as Row[];
  return rows.map((r) => toMsg(r, self));
}

/**
 * Plain facts about how a conversation goes (no "interest" score): who writes how much, how quickly the other
 * person answers, how often they answer at all, who opens the day, and how busy each period was.
 * A "turn" is a run of consecutive messages from one side; system messages (type 80/81) are ignored.
 */
export function chatStats(sessionId: string) {
  const d = open(sessionId);
  if (!d) return null;
  const self = owner(d);
  const rows = d.prepare(`SELECT m.ts, mb.platform_id spid FROM message m JOIN member mb ON mb.id = m.sender_id WHERE m.type NOT IN (80, 81) ORDER BY m.ts, m.id`).all() as Row[];
  if (rows.length < 2) return null;
  const msgs = rows.map((r) => ({ ts: Number(r.ts), me: r.spid === self }));
  const mine = msgs.filter((m) => m.me).length, theirs = msgs.length - mine;
  // turns
  const turns: { me: boolean; start: number; end: number }[] = [];
  for (const m of msgs) {
    const t = turns[turns.length - 1];
    if (t && t.me === m.me) t.end = m.ts; else turns.push({ me: m.me, start: m.ts, end: m.ts });
  }
  const DAY = 86400;
  const replyTimes = (fromMe: boolean) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < turns.length; i++) if (turns[i].me === fromMe && turns[i + 1].start - turns[i].end <= DAY) out.push(turns[i + 1].start - turns[i].end);
    return out;
  };
  const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const myTurns = turns.filter((t, i) => t.me && i < turns.length - 1).length;
  const theyReplied = replyTimes(true);
  // who sends the first message of each local day
  const openers = { me: 0, them: 0 };
  let lastDay = "";
  for (const m of msgs) {
    const day = new Date(m.ts * 1000).toLocaleDateString("sv-SE");
    if (day !== lastDay) { openers[m.me ? "me" : "them"]++; lastDay = day; }
  }
  // 8 equal periods from first to last message
  const first = msgs[0].ts, last = msgs[msgs.length - 1].ts, span = Math.max(1, last - first);
  const periods = Array.from({ length: 8 }, (_, i) => ({ from: first + (span * i) / 8, to: first + (span * (i + 1)) / 8, count: 0 }));
  for (const m of msgs) periods[Math.min(7, Math.floor(((m.ts - first) / span) * 8))].count++;
  const hours = new Array(24).fill(0);
  for (const m of msgs) hours[new Date(m.ts * 1000).getHours()]++;
  const peak = hours.map((n, h) => ({ h, n })).sort((a, b) => b.n - a.n).slice(0, 2).map((x) => x.h).sort((a, b) => a - b);
  return {
    total: msgs.length, mine, theirs,
    days: Math.max(1, Math.round(span / DAY)),
    replyRate: myTurns ? theyReplied.length / myTurns : null,             // their answers within 24 h to your turns
    theirReplyMin: median(theyReplied) == null ? null : Math.round(median(theyReplied)! / 60),
    myReplyMin: median(replyTimes(false)) == null ? null : Math.round(median(replyTimes(false))! / 60),
    openers,
    periods: periods.map((p) => ({ from: fmt(Math.round(p.from)).slice(0, 10), to: fmt(Math.round(p.to)).slice(0, 10), count: p.count })),
    peakHours: peak,
  };
}
