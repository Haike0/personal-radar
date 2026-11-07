#!/usr/bin/env node
// Personal Radar — AI extraction bridge. `npm run organize` drives it with your own API key;
// an agent (Claude Code, Codex…) can also drive it directly with these commands.
//
//   node scripts/radar-ai.mjs status
//   node scripts/radar-ai.mjs next   --session <id> [--max 500]        → JSON chunk on stdout
//   node scripts/radar-ai.mjs submit --file result.json                       → validates, stores, advances cursor
//   node scripts/radar-ai.mjs backfill-start --session S --min-id N         → older history imported later (e.g. phone migration)
//   node scripts/radar-ai.mjs next --session S --backfill                   → reads only those messages, own cursor
//   node scripts/radar-ai.mjs digest --session <id>                           → all organized items + interaction facts, for the person analysis
//   node scripts/radar-ai.mjs analysis --file analysis.json                   → validates (every point cites item ids) and stores the analysis
//
// Guarantees: chat databases are opened read-only. Only the app's own radar.db is written. The cursor moves only
// when a submit succeeds (one transaction), so an interrupted run just repeats the same chunk next time.
// Items store message IDs + time, never copies of chat text.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CHATS_DIR, RADAR_DB } from "./lib/env.mjs";

const HOME = os.homedir();
// ChatLab is opt-in: only read when CHATLAB_DATA_DIR points at its data folder (usually ~/.chatlab/data).
const CHATLAB_DIR = process.env.CHATLAB_DATA_DIR ? path.join(process.env.CHATLAB_DATA_DIR.replace(/^~(?=\/)/, HOME), "databases") : null;
// Every private chat Radar can see: imported ones, plus ChatLab's if you opted in. Group chats are out of scope.
// Limit it with RADAR_SESSIONS=id1,id2 if you only want some people organized.
function sessionFile(sid) {
  for (const dir of [CHATS_DIR, CHATLAB_DIR].filter(Boolean)) { const f = path.join(dir, `${sid}.db`); if (fs.existsSync(f)) return f; }
  return null;
}
const SESSIONS = (() => {
  if (process.env.RADAR_SESSIONS) return process.env.RADAR_SESSIONS.split(",").map((x) => x.trim()).filter(Boolean);
  const ids = new Set();
  for (const dir of [CHATS_DIR, CHATLAB_DIR].filter(Boolean)) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".db") || f.startsWith("demo_")) continue;
      try {
        const d = new DatabaseSync(path.join(dir, f), { readOnly: true });
        const m = d.prepare("SELECT type FROM meta LIMIT 1").get();
        d.close();
        if (m && m.type !== "group") ids.add(f.slice(0, -3));
      } catch {}
    }
  }
  // people set to "不发给 AI" in 设置 → 隐私 are never organized
  let excluded = new Set();
  try {
    const d = new DatabaseSync(RADAR_DB, { readOnly: true });
    excluded = new Set(JSON.parse(d.prepare("SELECT value FROM settings WHERE key='ai_excluded'").get()?.value ?? "[]").map(String));
    d.close();
  } catch {}
  return [...ids].filter((id) => !excluded.has(id));
})();
const TEXT_TYPES = new Set([0, 4, 7, 20, 21, 24, 25, 26]); // text, file, link, red packet, transfer, share, reply, forwarded record
const KINDS = ["plan", "promise", "need", "pending", "preference", "concern", "change", "fact"];
const KNOWLEDGE = new Set(["fact", "preference", "need"]);
const CERTS = ["confirmed", "tentative", "changed", "cancelled", "uncertain"];
const SUBJECTS = ["them", "self", "both"];
const FACETS = ["作息与工作", "情况", "近况", "喜好", "明确需求", "相处约定", "观点与判断", "家人与朋友", "健康", "其他"];
const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
// `next` saves the chunk's ref→message-id table here (vault, not iCloud); `submit` reads it back.
const CHUNK_DIR = path.join(path.dirname(RADAR_DB), "ai-chunks");
const VOICE_DB = path.join(path.dirname(RADAR_DB), "voice-transcripts.db");
// low-information messages (laughter, acks, bare emoji/stickers) are not sent to the model at all
const LOW = /^(?:[哈嘿呵嗯哦噢啊呀嗷哇欸诶好的对是行okOK啦了吧呢吗~～！!？?。.,，\s]|\[[^\]]{1,6}\]|[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}])*$/u;
const informative = (t) => t.length >= 4 && !LOW.test(t);

const die = (msg, code = 1) => { console.error(JSON.stringify({ ok: false, error: msg })); process.exit(code); };
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const p2 = (n) => String(n).padStart(2, "0");
const fmt = (sec) => { const d = new Date(sec * 1000); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const now = () => fmt(Math.floor(Date.now() / 1000)) + ":00";
const today = () => now().slice(0, 10);

function radar() {
  if (!fs.existsSync(RADAR_DB)) die("radar.db not found — run `npm run dev` once first");
  const d = new DatabaseSync(RADAR_DB);
  d.exec(`CREATE TABLE IF NOT EXISTS ai_cursor(session_id TEXT PRIMARY KEY, last_ts INTEGER NOT NULL, last_id INTEGER NOT NULL, updated_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS person_analysis(session_id TEXT PRIMARY KEY, content TEXT NOT NULL, basis_items INTEGER NOT NULL, basis_until TEXT, generated_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS ai_runs(id INTEGER PRIMARY KEY, session_id TEXT, from_ts INTEGER, to_ts INTEGER, messages INTEGER, added INTEGER, attached INTEGER, skipped INTEGER, at TEXT);
          CREATE TABLE IF NOT EXISTS ai_voice_seen(session_id TEXT, message_id TEXT, text_sha256 TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(session_id,message_id));
          CREATE TABLE IF NOT EXISTS ai_voice_runs(id INTEGER PRIMARY KEY, session_id TEXT, messages INTEGER, added INTEGER, attached INTEGER, skipped INTEGER, at TEXT);
          CREATE TABLE IF NOT EXISTS ai_backfill(session_id TEXT PRIMARY KEY, min_id INTEGER NOT NULL, until_ts INTEGER NOT NULL, last_ts INTEGER NOT NULL, last_id INTEGER NOT NULL, updated_at TEXT NOT NULL);`);
  for (const col of ["observed_at TEXT", "subject TEXT NOT NULL DEFAULT 'them'", "facet TEXT", "origin TEXT", "review TEXT", "milestone INTEGER", "extractor TEXT", "checked_at TEXT"])
    try { d.exec(`ALTER TABLE items ADD COLUMN ${col}`); } catch {}
  return d;
}
function chat(sid) {
  if (!SESSIONS.includes(sid)) die(`session not allowed: ${sid}`);
  const f = sessionFile(sid);
  if (!f) die(`chat not found: ${sid}`);
  return new DatabaseSync(f, { readOnly: true });
}
const cursorOf = (r, sid) => r.prepare("SELECT last_ts, last_id FROM ai_cursor WHERE session_id=?").get(sid) ?? { last_ts: 0, last_id: 0 };
const SELECT = `SELECT m.id, m.platform_message_id pid, m.ts, m.type, m.content, COALESCE(NULLIF(m.sender_account_name,''), mb.account_name) sender, mb.platform_id spid
                FROM message m JOIN member mb ON mb.id=m.sender_id`;

function cmdStatus() {
  const r = radar();
  const out = SESSIONS.map((sid) => {
    const c = chat(sid);
    const name = c.prepare("SELECT name FROM meta").get().name;
    const cur = cursorOf(r, sid);
    const remaining = c.prepare(`SELECT COUNT(*) n FROM message WHERE (ts > ? OR (ts = ? AND id > ?)) AND type IN (${[...TEXT_TYPES].join(",")})`).get(cur.last_ts, cur.last_ts, cur.last_id).n;
    const items = r.prepare("SELECT COUNT(*) n FROM items WHERE mode='real' AND person_key=? AND origin='ai'").get(sid).n;
    const an = r.prepare("SELECT generated_at, basis_items FROM person_analysis WHERE session_id=?").get(sid);
    const totalItems = r.prepare("SELECT COUNT(*) n FROM items WHERE mode='real' AND person_key=? AND COALESCE(review,'')<>'rejected'").get(sid).n;
    // analysis is due when chat is organized and there's no analysis yet, or ≥15% / ≥10 more items since the last one
    const analysisDue = remaining === 0 && !backfillRemaining0(r, c, sid) && (!an || totalItems >= an.basis_items * 1.15 || totalItems - an.basis_items >= 10);
    const bf = r.prepare("SELECT * FROM ai_backfill WHERE session_id=?").get(sid);
    const backfillRemaining = bf ? c.prepare(`SELECT COUNT(*) n FROM message WHERE id > ? AND ts <= ? AND (ts > ? OR (ts = ? AND id > ?)) AND type IN (${[...TEXT_TYPES].join(",")})`).get(bf.min_id, bf.until_ts, bf.last_ts, bf.last_ts, bf.last_id).n : 0;
    return { session: sid, name, backfillRemaining, processedUntil: cur.last_ts ? fmt(cur.last_ts) : null, remainingTextMessages: remaining, aiItems: items, analysisAt: an?.generated_at ?? null, analysisDue };
  });
  console.log(JSON.stringify({ ok: true, sessions: out, done: out.every((s) => s.remainingTextMessages === 0 && !s.analysisDue) }, null, 1));
}

function backfillRemaining0(r, c, sid) {
  const bf = r.prepare("SELECT * FROM ai_backfill WHERE session_id=?").get(sid);
  return bf ? c.prepare(`SELECT COUNT(*) n FROM message WHERE id > ? AND ts <= ? AND (ts > ? OR (ts = ? AND id > ?)) AND type IN (${[...TEXT_TYPES].join(",")})`).get(bf.min_id, bf.until_ts, bf.last_ts, bf.last_ts, bf.last_id).n : 0;
}

function cmdBackfillStart() {
  const sid = arg("session") ?? die("--session required");
  const minId = Number(arg("min-id") ?? die("--min-id required (largest message id before the late import)"));
  if (!Number.isInteger(minId) || minId < 0) die("--min-id must be a non-negative integer");
  const r = radar(); chat(sid);
  if (r.prepare("SELECT 1 FROM ai_backfill WHERE session_id=?").get(sid)) die("backfill already started for this session");
  const cur = cursorOf(r, sid);
  r.prepare("INSERT INTO ai_backfill(session_id,min_id,until_ts,last_ts,last_id,updated_at) VALUES(?,?,?,0,0,?)").run(sid, minId, cur.last_ts, now());
  console.log(JSON.stringify({ ok: true, session: sid, minId, until: fmt(cur.last_ts) }));
}

function cmdVoiceStatus() {
  const r = radar();
  if (!fs.existsSync(VOICE_DB)) die("no local voice transcripts yet");
  const v = new DatabaseSync(VOICE_DB, { readOnly: true });
  const sessions = SESSIONS.map((sid) => {
    // rejected transcripts are skipped by `next`, so they must not count as unread here either
    const rows = v.prepare("SELECT message_id,text,state,quality_flags FROM voice_transcripts WHERE session_id=? AND review<>'rejected'").all(sid);
    const seen = new Map(r.prepare("SELECT message_id,text_sha256 FROM ai_voice_seen WHERE session_id=?").all(sid).map((x) => [x.message_id,x.text_sha256]));
    const ready = rows.filter((x) => x.state === "transcribed");
    const unread = ready.filter((x) => seen.get(x.message_id) !== crypto.createHash("sha256").update(x.text ?? "").digest("hex")).length;
    return { session:sid, total:rows.length, transcribed:ready.length, unread,
      missing:rows.filter((x) => x.state === "missing").length,
      awaitingTranscription:rows.filter((x) => x.state === "decoded").length,
      flagged:ready.filter((x) => x.quality_flags !== "[]").length };
  });
  console.log(JSON.stringify({sessions, availableDone:sessions.every((x) => !x.unread && !x.awaitingTranscription),
    allAudioAvailable:sessions.every((x) => !x.missing)},null,1));
}

function cmdNext() {
  if (arg("source") === "voice") return cmdNextVoice();
  const sid = arg("session") ?? die("--session required");
  const max = Math.min(Number(arg("max", 2500)), 3000);
  const r = radar(), c = chat(sid);
  const meta = c.prepare("SELECT name, owner_id FROM meta").get();
  const backfill = process.argv.includes("--backfill");
  const cf0 = path.join(CHUNK_DIR, `${sid}${backfill ? ".backfill" : ""}.json`);
  if (!process.argv.includes("--resume") && fs.existsSync(cf0) && Date.now() - fs.statSync(cf0).mtimeMs < 40 * 60e3) {
    console.log(`BUSY ${sid}: 另一个运行正在处理这个人，换一个人；如果是你自己刚取的这段，加 --resume 重新取`);
    return;
  }
  const bf = backfill ? r.prepare("SELECT * FROM ai_backfill WHERE session_id=?").get(sid) ?? die("run backfill-start first") : null;
  const cur = bf ? { last_ts: bf.last_ts, last_id: bf.last_id } : cursorOf(r, sid);
  // backfill = rows ChatLab received later (id > min_id) that are older than what the main cursor already covered
  const rows = bf
    ? c.prepare(`${SELECT} WHERE m.id > ? AND m.ts <= ? AND (m.ts > ? OR (m.ts = ? AND m.id > ?)) AND m.type IN (${[...TEXT_TYPES].join(",")}) ORDER BY m.ts, m.id LIMIT ?`)
      .all(bf.min_id, bf.until_ts, cur.last_ts, cur.last_ts, cur.last_id, max + 300)
    : c.prepare(`${SELECT} WHERE (m.ts > ? OR (m.ts = ? AND m.id > ?)) AND m.type IN (${[...TEXT_TYPES].join(",")}) ORDER BY m.ts, m.id LIMIT ?`)
      .all(cur.last_ts, cur.last_ts, cur.last_id, max + 300);
  // end at a day boundary near `max` so a day's conversation stays in one chunk when possible
  let end = Math.min(rows.length, max);
  if (rows.length > max) {
    const day = fmt(Number(rows[max - 1].ts)).slice(0, 10);
    let j = max;
    while (j < rows.length && fmt(Number(rows[j].ts)).slice(0, 10) === day) j++;
    end = j < rows.length ? j : max;
  }
  const chunk = rows.slice(0, end);
  if (!chunk.length) { console.log(`DONE ${meta.name}: 没有${backfill ? "补进来的旧聊天" : "新的聊天"}需要整理`); return; }
  const last = chunk.at(-1);
  const map = chunk.map((m) => m.pid);
  fs.mkdirSync(CHUNK_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(cf0, JSON.stringify({ source: backfill ? "backfill" : "text", session: sid, from: { ts: cur.last_ts, id: cur.last_id }, chunk_end: { ts: Number(last.ts), id: Number(last.id) }, map }), { mode: 0o600 });
  const existing = r.prepare(`SELECT id, title, kind, facet, subject, event_date, status FROM items WHERE mode='real' AND person_key=? AND status<>'ignored' ORDER BY COALESCE(event_date, observed_at)`).all(sid);
  const out = [];
  out.push(`# ${meta.name}${backfill ? " · 补读旧记录（提交时 source 填 backfill）" : ""} · ${fmt(Number(chunk[0].ts))} → ${fmt(Number(last.ts))} · ${chunk.length} 条文字消息 · 今天 ${today()}`);
  out.push(`## 已有记录（${existing.length}）：新内容和这些重复时用 attach 补证据，变化/取消时用 supersedes_item_id`);
  out.push(existing.map((i) => `#${i.id} ${i.event_date ? i.event_date.slice(5) + " " : ""}${i.title}`).join(" | "));
  const who = (m) => (m.spid === meta.owner_id ? "W" : "T");
  out.push(`## 聊天：W=我，T=${meta.name}。每行“编号 发送人 内容”；“@HH”表示时间到了该小时；无信息量的短消息已省略（编号会跳号）`);
  let day = "", hour = "", shown = 0;
  chunk.forEach((m, k) => {
    // collapse whitespace, drop URL tracking params; long pastes (AI answers, articles) only need their opening
    let text = String(m.content ?? "").replace(/\s+/g, " ").replace(/(https?:\/\/[^\s?]+)\?\S*/g, "$1").trim();
    if (!informative(text)) return;
    if (text.length > 140) text = text.slice(0, 140) + "…";
    const t = fmt(Number(m.ts));
    if (t.slice(0, 10) !== day) { day = t.slice(0, 10); hour = ""; out.push(`-- ${day} ${WD[new Date(Number(m.ts) * 1000).getDay()]}`); }
    if (t.slice(11, 13) !== hour) { hour = t.slice(11, 13); out.push(`@${hour}`); }
    out.push(`${k + 1} ${who(m)} ${text}`);
    shown++;
  });
  out[0] += `（实际给你看 ${shown} 条）`;
  console.log(out.join("\n"));
}

// Voice has independent progress: processing old audio must never rewind/advance the text cursor.
function cmdNextVoice() {
  const sid = arg("session") ?? die("--session required");
  const r = radar(), c = chat(sid);
  if (!fs.existsSync(VOICE_DB)) die("no local voice transcripts yet");
  const v = new DatabaseSync(VOICE_DB, { readOnly: true });
  const cf = path.join(CHUNK_DIR, `${sid}.voice.json`);
  if (!process.argv.includes("--resume") && fs.existsSync(cf) && Date.now() - fs.statSync(cf).mtimeMs < 40 * 60e3) {
    console.log(`BUSY ${sid}: voice chunk pending; use --resume only for your own run`); return;
  }
  const seen = new Map(r.prepare("SELECT message_id,text_sha256 FROM ai_voice_seen WHERE session_id=?").all(sid).map((x) => [x.message_id, x.text_sha256]));
  const hash = (s) => crypto.createHash("sha256").update(s ?? "").digest("hex");
  const rows = v.prepare("SELECT * FROM voice_transcripts WHERE session_id=? AND state='transcribed' AND review<>'rejected' ORDER BY ts,chatlab_id").all(sid)
    .filter((x) => seen.get(x.message_id) !== hash(x.text)).slice(0, Math.min(Number(arg("max", 80)), 150));
  if (!rows.length) {
    const pending = v.prepare("SELECT COUNT(*) n FROM voice_transcripts WHERE session_id=? AND state='decoded'").get(sid).n;
    const missing = v.prepare("SELECT COUNT(*) n FROM voice_transcripts WHERE session_id=? AND state='missing'").get(sid).n;
    console.log(pending ? `WAIT ${sid}: ${pending} voices still awaiting transcription` :
      `AVAILABLE DONE ${sid}: no unread transcribed voices${missing ? `; ${missing} audio files missing` : ""}`);
    return;
  }
  const meta = c.prepare("SELECT name,owner_id FROM meta").get();
  const map = [], refs = new Map();
  const ref = (pid) => { if (!refs.has(pid)) { map.push(pid); refs.set(pid, map.length); } return refs.get(pid); };
  const out = [`# ${meta.name} · 语音补读 · ${rows.length} 条 · ${fmt(rows[0].ts)} → ${fmt(rows.at(-1).ts)}`,
    "W=我，T=对方；V=AI语音转写（待核对），C=邻近文字上下文。转写可能有错，数字、人名、日期及立场须结合上下文；不要把不清楚的话补成事实。"];
  const existing = r.prepare("SELECT id,title FROM items WHERE mode='real' AND person_key=? AND COALESCE(review,'')<>'rejected' AND status<>'ignored'").all(sid);
  out.push("## 已有记录", existing.map((i) => `#${i.id} ${i.title}`).join(" | "), "## 语音和上下文");
  const show = (m, voice = null) => {
    const k = ref(m.pid), who = m.spid === meta.owner_id ? "W" : "T";
    const text = voice ? (voice.text || "[无可识别文字]") : String(m.content ?? "").replace(/\s+/g, " ").slice(0, 180);
    return `${k} ${who} ${voice ? `V${voice.quality_flags !== "[]" ? "[识别存疑]" : ""}` : "C"} ${fmt(m.ts)} ${text}`;
  };
  const displayed = new Set();
  for (const x of rows) {
    const m = c.prepare(`${SELECT} WHERE m.platform_message_id=? AND m.type=2`).get(x.message_id);
    if (!m || m.ts !== x.ts || m.id !== x.chatlab_id) die("voice provenance mismatch");
    const context = c.prepare(`${SELECT} WHERE m.id BETWEEN ? AND ? AND m.type IN (0,25) ORDER BY m.ts,m.id`).all(m.id - 2, m.id + 2);
    for (const p of context.filter((p) => p.id < m.id)) if (!displayed.has(p.pid)) { out.push(show(p)); displayed.add(p.pid); }
    out.push(show(m, x)); displayed.add(m.pid);
    for (const p of context.filter((p) => p.id > m.id)) if (!displayed.has(p.pid)) { out.push(show(p)); displayed.add(p.pid); }
  }
  fs.mkdirSync(CHUNK_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(cf, JSON.stringify({ source: "voice", session: sid, map,
    voice_rows: rows.map((x) => ({ message_id: x.message_id, text_sha256: hash(x.text) })),
    chunk_end: { ts: rows.at(-1).ts, id: rows.at(-1).chatlab_id } }), { mode: 0o600 });
  console.log(out.join("\n"));
}

function validItem(x, i) {
  const bad = (m) => die(`items[${i}]: ${m}`);
  if (!x || typeof x.title !== "string" || !x.title.trim() || x.title.length > 80) bad("title (1–80 chars) required");
  if (!KINDS.includes(x.kind)) bad(`kind must be one of ${KINDS}`);
  if (!CERTS.includes(x.certainty)) bad(`certainty must be one of ${CERTS}`);
  if (!SUBJECTS.includes(x.subject)) bad(`subject must be one of ${SUBJECTS}`);
  if (KNOWLEDGE.has(x.kind) && !FACETS.includes(x.facet)) bad(`knowledge items need facet in ${FACETS}`);
  if (x.event_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(x.event_date)) bad("event_date must be YYYY-MM-DD or null");
  if (x.event_time != null && !/^\d{2}:\d{2}$/.test(x.event_time)) bad("event_time must be HH:mm or null");
  if (!Array.isArray(x.refs) || !x.refs.length || x.refs.length > 8 || !x.refs.every(Number.isInteger)) bad("1–8 integer refs (message numbers from the chunk) required as evidence");
}

function cmdSubmit() {
  const file = arg("file") ?? die("--file required");
  const res = JSON.parse(fs.readFileSync(file, "utf8"));
  const sid = res.session;
  const r = radar(), c = chat(sid);
  const isVoice = res.source === "voice", isBackfill = res.source === "backfill";
  const cf = path.join(CHUNK_DIR, `${sid}${isVoice ? ".voice" : isBackfill ? ".backfill" : ""}.json`);
  if (!fs.existsSync(cf)) die("no pending chunk for this session — run `next` first");
  const ck = JSON.parse(fs.readFileSync(cf, "utf8"));
  const bfRow = isBackfill ? r.prepare("SELECT * FROM ai_backfill WHERE session_id=?").get(sid) ?? die("no backfill for this session") : null;
  const cur = bfRow ? { last_ts: bfRow.last_ts, last_id: bfRow.last_id } : cursorOf(r, sid);
  if (isVoice) {
    if (ck.source !== "voice" || !ck.voice_rows?.length) die("invalid voice chunk");
    const v = new DatabaseSync(VOICE_DB, { readOnly: true });
    for (const x of ck.voice_rows) {
      const row = v.prepare("SELECT text,state FROM voice_transcripts WHERE session_id=? AND message_id=?").get(sid,x.message_id);
      const hash = row ? crypto.createHash("sha256").update(row.text ?? "").digest("hex") : null;
      if (row?.state !== "transcribed" || hash !== x.text_sha256) die("voice transcript changed; read chunk again");
    }
  } else if (ck.from.ts !== cur.last_ts || ck.from.id !== cur.last_id) die("chunk is stale (cursor moved) — run `next` again");
  res.chunk_end = ck.chunk_end;
  res.textMessages = ck.map.length;
  const ref = (k) => { if (k < 1 || k > ck.map.length) die(`ref out of range: ${k}`); return ck.map[k - 1]; };
  const items = res.items ?? [], attach = res.attach ?? [];
  items.forEach(validItem);
  for (const x of items) x.message_ids = x.refs.map(ref);
  for (const a of attach) a.message_ids = (a.refs ?? []).filter(Number.isInteger).map(ref);
  const exists = c.prepare("SELECT ts FROM message WHERE platform_message_id=?");
  const tsOf = (mid) => { const row = exists.get(mid); if (!row) die(`message id not found in the chat: ${mid}`); return Number(row.ts); };
  const used = new Set(r.prepare("SELECT e.message_id mid FROM evidence e JOIN items i ON i.id=e.item_id WHERE i.mode='real' AND i.person_key=?").all(sid).map((x) => x.mid));
  const name = c.prepare("SELECT name FROM meta").get().name;
  const t = now(), td = today();
  let added = 0, attached = 0, skipped = 0;
  r.exec("BEGIN");
  try {
    const ins = r.prepare(`INSERT OR IGNORE INTO items(mode,source_key,person_key,person_name,is_group,title,summary,why,next_step,category,status,certainty,kind,event_date,event_time,supersedes_id,observed_at,subject,facet,origin,review,created_at,updated_at,milestone,extractor,checked_at)
      VALUES('real',?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ai','pending',?,?,?,?,?)`);
    // who organized it: "api" (npm run organize) or "agent" (an agent driving this script by hand)
    const extractor = res.extractor === "api" ? "api" : "agent";
    const insEv = r.prepare("INSERT INTO evidence(item_id,session_id,message_id,ts,sender,text,is_key,ord) VALUES(?,?,?,'','','',1,?)");
    for (const x of items) {
      const times = x.message_ids.map(tsOf);
      if (x.message_ids.every((m) => used.has(m))) { skipped++; continue; } // same evidence already recorded → duplicate
      const past = x.event_date != null && x.event_date < td;
      const soon = x.event_date != null && !past && (Date.parse(x.event_date) - Date.parse(td)) / 864e5 <= 7;
      const category = KNOWLEDGE.has(x.kind) ? "later" : x.certainty === "uncertain" ? "potential" : soon && ["plan", "promise", "pending"].includes(x.kind) ? "urgent" : "later";
      const status = x.certainty === "cancelled" ? "cancelled" : past ? "expired" : "open";
      const key = "ai:" + crypto.createHash("sha1").update(sid + "|" + [...x.message_ids].sort().join(",") + "|" + x.title).digest("hex").slice(0, 16);
      const sup = Number.isInteger(x.supersedes_item_id) && r.prepare("SELECT 1 FROM items WHERE id=? AND person_key=?").get(x.supersedes_item_id, sid) ? x.supersedes_item_id : null;
      const out = ins.run(key, sid, name, x.title.trim(), x.summary ?? null, x.why ?? null, past ? null : x.next_step ?? null, category, status, x.certainty, x.kind,
        x.event_date ?? null, x.event_time ?? null, sup, fmt(Math.max(...times)), x.subject, KNOWLEDGE.has(x.kind) ? x.facet : (x.facet ?? null), t, t, x.kind === "fact" && typeof x.milestone === "boolean" ? Number(x.milestone) : null, extractor, t);
      if (Number(out.changes) !== 1) { skipped++; continue; }
      const id = Number(r.prepare("SELECT last_insert_rowid() id").get().id);
      x.message_ids.forEach((m, k) => { insEv.run(id, sid, m, k); used.add(m); });
      added++;
    }
    for (const a of attach) {
      const it = r.prepare("SELECT id FROM items WHERE id=? AND person_key=? AND mode='real'").get(a.item_id, sid);
      if (!it || !Array.isArray(a.message_ids)) continue;
      const base = r.prepare("SELECT COALESCE(MAX(ord),0) o FROM evidence WHERE item_id=?").get(a.item_id).o;
      let k = 0;
      for (const m of a.message_ids.slice(0, 5)) {
        if (used.has(m)) continue;
        tsOf(m);
        insEv.run(a.item_id, sid, m, base + ++k); used.add(m); attached++;
      }
      if (k) r.prepare("UPDATE items SET observed_at=MAX(COALESCE(observed_at,''), ?) WHERE id=?").run(fmt(Math.max(...a.message_ids.map(tsOf))), a.item_id);
    }
    if (isVoice) {
      for (const x of ck.voice_rows) {
        const seen = r.prepare("SELECT text_sha256 FROM ai_voice_seen WHERE session_id=? AND message_id=?").get(sid,x.message_id);
        if (seen?.text_sha256 === x.text_sha256) throw new Error("voice chunk already processed; read the next chunk");
      }
      const mark = r.prepare("INSERT INTO ai_voice_seen(session_id,message_id,text_sha256,at) VALUES(?,?,?,?) ON CONFLICT(session_id,message_id) DO UPDATE SET text_sha256=excluded.text_sha256,at=excluded.at");
      for (const x of ck.voice_rows) mark.run(sid, x.message_id, x.text_sha256, t);
      r.prepare("INSERT INTO ai_voice_runs(session_id,messages,added,attached,skipped,at) VALUES(?,?,?,?,?,?)").run(sid, ck.voice_rows.length, added, attached, skipped, t);
    } else if (isBackfill) {
      r.prepare("UPDATE ai_backfill SET last_ts=?, last_id=?, updated_at=? WHERE session_id=?").run(res.chunk_end.ts, res.chunk_end.id, t, sid);
      r.prepare("INSERT INTO ai_runs(session_id,from_ts,to_ts,messages,added,attached,skipped,at) VALUES(?,?,?,?,?,?,?,?)").run(sid + ":backfill", cur.last_ts, res.chunk_end.ts, res.textMessages ?? null, added, attached, skipped, t);
    } else {
      r.prepare("INSERT INTO ai_cursor(session_id,last_ts,last_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET last_ts=excluded.last_ts,last_id=excluded.last_id,updated_at=excluded.updated_at")
        .run(sid, res.chunk_end.ts, res.chunk_end.id, t);
      r.prepare("INSERT INTO ai_runs(session_id,from_ts,to_ts,messages,added,attached,skipped,at) VALUES(?,?,?,?,?,?,?,?)").run(sid, cur.last_ts, res.chunk_end.ts, res.textMessages ?? null, added, attached, skipped, t);
    }
    r.exec("COMMIT");
    fs.rmSync(cf, { force: true });
  } catch (e) {
    r.exec("ROLLBACK");
    die(`submit failed, nothing saved: ${e.message}`);
  }
  console.log(JSON.stringify({ ok: true, session: sid, added, attached, skipped, cursor: fmt(res.chunk_end.ts) }));
}

function interaction(c, self) {
  // plain facts only: monthly volume by side, who opens each day's conversation, active hours
  const rows = c.prepare(`SELECT m.ts, mb.platform_id spid FROM message m JOIN member mb ON mb.id=m.sender_id WHERE m.type <> 80 ORDER BY m.ts, m.id`).all();
  const months = new Map(), openers = { me: 0, them: 0 }, hours = new Array(24).fill(0);
  let lastDay = "";
  for (const r of rows) {
    const t = fmt(Number(r.ts)); const mo = t.slice(0, 7), day = t.slice(0, 10);
    const me = r.spid === self;
    const e = months.get(mo) ?? { me: 0, them: 0 }; me ? e.me++ : e.them++; months.set(mo, e);
    if (day !== lastDay) { me ? openers.me++ : openers.them++; lastDay = day; }
    hours[Number(t.slice(11, 13))]++;
  }
  const peak = hours.map((n, h) => [h, n]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${h}点`);
  return { months: [...months].map(([m, v]) => `${m} 我${v.me}/对方${v.them}`), dayOpeners: openers, peakHours: peak, total: rows.length };
}

function cmdDigest() {
  const sid = arg("session") ?? die("--session required");
  const r = radar(), c = chat(sid);
  const meta = c.prepare("SELECT name, owner_id FROM meta").get();
  const items = r.prepare(`SELECT id, title, summary, kind, facet, subject, certainty, status, event_date, observed_at, review FROM items
    WHERE mode='real' AND person_key=? AND COALESCE(review,'')<>'rejected' AND status<>'ignored' ORDER BY COALESCE(event_date, observed_at)`).all(sid);
  const q = c.prepare(`${SELECT} WHERE m.platform_message_id=?`);
  const out = [`# ${meta.name} · 人物分析素材 · 今天 ${today()}`];
  const it = interaction(c, meta.owner_id);
  out.push(`## 互动事实（只有计数，不是评分）`, `总消息 ${it.total}；每天第一条消息：我发 ${it.dayOpeners.me} 天 / 对方发 ${it.dayOpeners.them} 天；最活跃时段 ${it.peakHours.join("、")}`, `按月：${it.months.join("；")}`);
  const voice = fs.existsSync(VOICE_DB) ? new DatabaseSync(VOICE_DB, { readOnly: true }) : null;
  if (voice) {
    const counts = voice.prepare("SELECT COUNT(*) total,SUM(state='transcribed') transcribed,SUM(state='missing') missing FROM voice_transcripts WHERE session_id=?").get(sid);
    out.push(`语音覆盖：总计${counts.total}条，自动转写${counts.transcribed ?? 0}条，缓存缺失${counts.missing ?? 0}条；自动转写尚待用户核对，不是人工逐字稿。`);
  }
  out.push(`## 已整理的记录（${items.length} 条）：格式 #编号 [类型/分组/关于谁/确定程度] 日期 标题 —— 一条关键原话`);
  for (const i of items) {
    const ev = r.prepare("SELECT message_id FROM evidence WHERE item_id=? ORDER BY ord LIMIT 1").get(i.id);
    const m = ev ? q.get(ev.message_id) : null;
    const speech = m?.type === 2 && voice ? voice.prepare("SELECT text FROM voice_transcripts WHERE session_id=? AND message_id=? AND state='transcribed' AND review<>'rejected'").get(sid,m.pid) : null;
    const content = speech?.text ? `[语音转写·待核对] ${speech.text}` : m?.content;
    const quote = m ? `${m.spid === meta.owner_id ? "我" : m.sender}：${String(content ?? "").replace(/\s+/g, " ").slice(0, 100)}` : "";
    out.push(`#${i.id} [${i.kind}${i.facet ? "/" + i.facet : ""}/${i.subject}/${i.certainty}${i.status !== "open" ? "/" + i.status : ""}] ${i.event_date ?? (i.observed_at ?? "").slice(0, 10)} ${i.title}${quote ? " —— " + quote : ""}`);
  }
  console.log(out.join("\n"));
}

function cmdAnalysis() {
  const file = arg("file") ?? die("--file required");
  const a = JSON.parse(fs.readFileSync(file, "utf8"));
  const sid = a.session;
  const r = radar(); chat(sid);
  if (typeof a.summary !== "string" || a.summary.length < 20 || a.summary.length > 600) die("summary: 20–600 chars required");
  if (!Array.isArray(a.sections) || a.sections.length < 3 || a.sections.length > 10) die("sections: 3–10 required");
  const valid = new Set(r.prepare("SELECT id FROM items WHERE mode='real' AND person_key=?").all(sid).map((x) => x.id));
  let points = 0;
  a.sections.forEach((sec, i) => {
    if (typeof sec.title !== "string" || !sec.title.trim()) die(`sections[${i}].title required`);
    if (!Array.isArray(sec.points) || !sec.points.length) die(`sections[${i}].points required`);
    sec.points.forEach((pt, j) => {
      if (typeof pt.text !== "string" || pt.text.length < 4 || pt.text.length > 240) die(`sections[${i}].points[${j}].text 4–240 chars`);
      if (!["fact", "inference"].includes(pt.basis)) die(`sections[${i}].points[${j}].basis must be fact|inference`);
      if (!Array.isArray(pt.items) || !pt.items.length) die(`sections[${i}].points[${j}]: cite at least one item id`);
      for (const id of pt.items) if (!valid.has(id)) die(`sections[${i}].points[${j}]: unknown item #${id}`);
      points++;
    });
  });
  const basis = r.prepare("SELECT COUNT(*) n, MAX(COALESCE(observed_at, event_date)) last FROM items WHERE mode='real' AND person_key=? AND COALESCE(review,'')<>'rejected'").get(sid);
  r.prepare("INSERT INTO person_analysis(session_id,content,basis_items,basis_until,generated_at) VALUES(?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET content=excluded.content,basis_items=excluded.basis_items,basis_until=excluded.basis_until,generated_at=excluded.generated_at")
    .run(sid, JSON.stringify({ summary: a.summary, sections: a.sections }), basis.n, basis.last, now());
  console.log(JSON.stringify({ ok: true, session: sid, sections: a.sections.length, points, basisItems: basis.n }));
}

const cmd = process.argv[2];
if (cmd === "status") arg("source") === "voice" ? cmdVoiceStatus() : cmdStatus();
else if (cmd === "next") cmdNext();
else if (cmd === "submit") cmdSubmit();
else if (cmd === "digest") cmdDigest();
else if (cmd === "backfill-start") cmdBackfillStart();
else if (cmd === "analysis") cmdAnalysis();
else die("usage: status | next --session S [--max N] | submit --file F | digest --session S | analysis --file F");
