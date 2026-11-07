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

/** Up to `limit` messages right after a given one (text and stickers, no system lines), for 说话算数账本. */
export function after(sessionId: string, messageId: string, limit = 160): ChatMessage[] {
  const d = open(sessionId);
  if (!d) return [];
  const self = owner(d);
  const pivot = d.prepare("SELECT id, ts FROM message WHERE platform_message_id=?").get(messageId) as Row | undefined;
  if (!pivot) return [];
  const rows = d.prepare(`${SELECT} WHERE m.type NOT IN (80, 81) AND (m.ts > ? OR (m.ts = ? AND m.id > ?)) ORDER BY m.ts, m.id LIMIT ?`)
    .all(pivot.ts as number, pivot.ts as number, pivot.id as number, limit) as Row[];
  return rows.map((r) => toMsg(r, self));
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

// ---------- chat report (language & rhythm), computed locally; nothing is sent anywhere ----------
const STOP = new Set(`的 了 是 我 你 他 她 它 们 这 那 就 都 也 还 又 在 有 和 跟 给 吗 呢 吧 啊 呀 哦 嗯 哈 嘿 噢 喔 么 啦 嘛 吧 着 过 去 来 到 说 要 会 能 好 不 没 很 太 想 看 让 把 被 对 一个 什么 怎么 这个 那个 我们 你们 他们 自己 现在 然后 因为 所以 但是 还是 就是 可以 知道 一下 已经 今天 明天 昨天 时候 感觉 觉得 真的 没有 不是 一样 一起 这样 那样 东西 应该 可能 起来 出来 一点 有点 the a an to and of is it you i me my in on for that this be are was so ok yeah
の に は を た が で て と し れ さ ある いる も な い か から だ です ます こと よ ね ん う お よう それ これ あ そう まあ じゃ って けど でも した ない さん いい ます でした ください くれ くる する して いた なる なっ られ ちゃ もう ので のに たら たよ だよ だね ですね ますね ちょっと すごく 本当 今日は`.split(/\s+/));
const EMOJI = /\p{Extended_Pictographic}/gu;
const BRACKET = /^\[[^\]]{1,8}\]$/;

export function chatReport(sessionId: string) {
  const d = open(sessionId);
  if (!d) return null;
  const self = owner(d);
  const rows = d.prepare(`SELECT m.ts, m.type, m.content, mb.platform_id spid FROM message m JOIN member mb ON mb.id = m.sender_id WHERE m.type NOT IN (80, 81) ORDER BY m.ts, m.id`).all() as Row[];
  if (rows.length < 2) return null;
  // Chinese and Japanese need different word rules; pick per message (any kana → Japanese)
  const segZh = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "word" }) : null;
  const segJa = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "word" }) : null;
  const words = { me: new Map<string, number>(), them: new Map<string, number>() };
  const shorts = { me: new Map<string, number>(), them: new Map<string, number>() };
  const emoji = { me: new Map<string, number>(), them: new Map<string, number>() };
  const len = { me: [0, 0], them: [0, 0] }; // [chars, text messages]
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const types: Record<string, number> = {};
  const TYPE_NAME: Record<number, string> = { 0: "文字", 1: "图片", 2: "语音", 3: "视频", 4: "文件", 5: "表情", 7: "链接", 8: "位置", 23: "通话", 25: "回复", 26: "转发" };
  const days = new Set<string>();
  for (const r of rows) {
    const who = r.spid === self ? "me" : "them";
    const t = new Date(Number(r.ts) * 1000);
    heat[t.getDay()][t.getHours()]++;
    days.add(t.toLocaleDateString("sv-SE"));
    const type = Number(r.type);
    types[TYPE_NAME[type] ?? "其他"] = (types[TYPE_NAME[type] ?? "其他"] ?? 0) + 1;
    const text = String(r.content ?? "").trim();
    if (!text || BRACKET.test(text)) continue;
    if (type !== 0 && type !== 25) continue;
    len[who][0] += text.length; len[who][1]++;
    for (const e of text.match(EMOJI) ?? []) emoji[who].set(e, (emoji[who].get(e) ?? 0) + 1);
    // [表情] / [图片] placeholders inside a message count as stickers/images, not as words
    const marks = text.match(/\[[^\]]{1,6}\]/g) ?? [];
    for (const m of marks) if (/表情|スタンプ|sticker/i.test(m)) types["表情"] = (types["表情"] ?? 0) + 1;
    const plain = text.replace(/\[[^\]]{1,6}\]/g, "").replace(EMOJI, "").replace(/[\uFE0F\u200D]/g, "").trim();
    if (plain && plain.length <= 6) shorts[who].set(plain, (shorts[who].get(plain) ?? 0) + 1);
    const seg = /[\u3040-\u30ff]/.test(plain) ? segJa : segZh;
    if (!seg || /^https?:\/\//.test(plain)) continue;
    for (const s of seg.segment(plain.toLowerCase())) {
      const w = s.segment.trim();
      if (!s.isWordLike || w.length < 2 || w.length > 8 || STOP.has(w) || /^\d+$/.test(w)) continue;
      if (/^[\u3040-\u309f]{1,3}$/.test(w)) continue; // short hiragana runs are grammar, not content
      words[who].set(w, (words[who].get(w) ?? 0) + 1);
    }
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w, c]) => ({ w, c }));
  // catchphrases: what each side says a lot, and clearly more than the other side
  const catch_ = (a: Map<string, number>, b: Map<string, number>, sa: Map<string, number>) => {
    const scored = [...a].filter(([, c]) => c >= 3).map(([w, c]) => ({ w, c, s: c * Math.log((c + 1) / ((b.get(w) ?? 0) + 1) + 1) }));
    const phrases = [...sa].filter(([, c]) => c >= 4).map(([w, c]) => ({ w, c, s: c * 1.2 }));
    return [...phrases, ...scored].sort((x, y) => y.s - x.s).filter((x, i, arr) => arr.findIndex((z) => z.w === x.w) === i).slice(0, 8).map(({ w, c }) => ({ w, c }));
  };
  const all = new Map(words.me);
  for (const [w, c] of words.them) all.set(w, (all.get(w) ?? 0) + c);
  // longest run of consecutive days with messages, and the longest silence
  const sorted = [...days].sort();
  let run = 1, best = 1, gap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / 864e5);
    run = diff === 1 ? run + 1 : 1; best = Math.max(best, run); gap = Math.max(gap, diff - 1);
  }
  return {
    keywords: top(all, 24),
    catchphrases: { me: catch_(words.me, words.them, shorts.me), them: catch_(words.them, words.me, shorts.them) },
    emoji: { me: top(emoji.me, 6), them: top(emoji.them, 6) },
    avgLen: { me: len.me[1] ? Math.round(len.me[0] / len.me[1]) : 0, them: len.them[1] ? Math.round(len.them[0] / len.them[1]) : 0 },
    heat, types: Object.entries(types).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    activeDays: days.size, longestStreak: best, longestGap: gap,
  };
}
