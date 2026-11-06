#!/usr/bin/env node
// Personal Radar — import a chat export into Radar's local chat store (one SQLite file per conversation).
//
//   npm run import -- <file> [--me "your name in the chat"] [--name "display name"] [--date-order dmy|mdy]
//
// Supported files (detected automatically):
//   • LINE        "Send chat history" / トーク履歴を送信 → .txt
//   • WhatsApp    Export chat → Without media → .txt (or the .txt inside the .zip)
//   • ChatLab     ChatLab JSON (format 0.0.x), e.g. exported from https://chatlab.fun or written by your own converter
//
// Re-importing a newer export of the same chat only adds the messages that are new; nothing is deleted.
// The original file is never modified, and nothing is sent anywhere.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CHATS_DIR, DATA_DIR } from "./lib/env.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const die = (msg) => { console.error(msg); writeState({ ok: false, error: msg, sessions: [] }); process.exit(1); };

function writeState(state) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(DATA_DIR, "import-state.json"), JSON.stringify({ finishedAt: new Date().toLocaleString("sv-SE").slice(0, 16), file: file ? path.basename(file) : null, ...state }));
  } catch {}
}

// Message types (same numbers ChatLab uses): 0 text, 1 image, 2 voice, 3 video, 4 file, 5 sticker, 7 link, 80 system
const T = { text: 0, image: 1, voice: 2, video: 3, file: 4, sticker: 5, link: 7, system: 80 };
const p2 = (n) => String(n).padStart(2, "0");
const epochOf = (y, mo, d, h, mi, s = 0) => Math.floor(new Date(`${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(s)}`).getTime() / 1000);
const to24 = (h, ampm) => { h = Number(h); if (!ampm) return h; const pm = /p|午後|下午/i.test(ampm); return (h % 12) + (pm ? 12 : 0); };

// ---------------------------------------------------------------- LINE
// [LINE] 田中さんとのトーク履歴 / [LINE] Chat history with Tanaka / [LINE] 与田中的聊天记录
// 2026/11/05(水)           ← date line (also 2026.11.05 星期三, Wed, 11/05/2026)
// 21:03\t田中さん\tこんばんは  ← message (multi-line text is wrapped in "…")
function parseLine(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const title = lines[0] ?? "";
  const partner = title.match(/^\[LINE\]\s*(.+?)とのトーク履歴/)?.[1] ?? title.match(/^\[LINE\]\s*Chat history with\s+(.+)$/i)?.[1]
    ?? title.match(/^\[LINE\]\s*与(.+?)的聊天记录/)?.[1] ?? title.match(/^\[LINE\]\s*(?:和|與)(.+?)的聊天記錄/)?.[1] ?? null;
  let day = null;
  const out = [];
  let open = null; // message whose quoted text continues on the next lines
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/‎/g, "");
    let m;
    if (open) {
      if (line.endsWith('"')) { open.text += "\n" + line.slice(0, -1); open = null; } else open.text += "\n" + line;
      continue;
    }
    if ((m = line.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})\b/))) { day = [m[1], m[2], m[3]]; continue; }
    if ((m = line.match(/^[A-Za-z]{3},\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { day = [m[3], m[1], m[2]]; continue; }
    if ((m = line.match(/^(?:(午前|午後|上午|下午|AM|PM)\s*)?(\d{1,2}):(\d{2})\s*([AP]M)?\t([^\t]*)\t?(.*)$/i)) && day) {
      const [, pre, h, mi, post, sender, body] = m;
      const msg = { ts: epochOf(day[0], day[1], day[2], to24(h, pre || post), mi), sender: sender.trim(), text: body };
      if (body.startsWith('"') && !(body.length > 1 && body.endsWith('"'))) { msg.text = body.slice(1); open = msg; }
      else if (body.length > 1 && body.startsWith('"') && body.endsWith('"')) msg.text = body.slice(1, -1);
      out.push(msg);
      continue;
    }
    if (out.length && line.trim() && day) out[out.length - 1].text += "\n" + line; // stray continuation
  }
  for (const msg of out) {
    const t = msg.text.trim();
    msg.type = !msg.sender ? T.system
      : /^\[(写真|Photo|照片|图片|圖片)\]$/i.test(t) ? T.image
      : /^\[(スタンプ|Sticker|贴图|貼圖)\]$/i.test(t) ? T.sticker
      : /^\[(動画|Video|视频|影片)\]$/i.test(t) ? T.video
      : /^\[(ボイスメッセージ|Voice message|语音|語音)\]$/i.test(t) ? T.voice
      : /^\[(ファイル|File|文件|檔案)\]$/i.test(t) ? T.file
      : /^https?:\/\/\S+$/.test(t) ? T.link : T.text;
    if (!msg.sender) msg.sender = "SYSTEM";
  }
  return { platform: "line", name: partner, messages: out };
}

// ---------------------------------------------------------------- WhatsApp
// iOS:     [05/11/2026, 21:03:12] Name: text
// Android: 05/11/2026, 21:03 - Name: text        (12-hour clocks add "PM"; dates may be D/M/Y or M/D/Y)
const WA = /^\[?(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:-\s*)?(.*)$/;
function parseWhatsApp(text, filename) {
  const lines = text.replace(/^﻿/, "").replace(/[‎‏‪-‮]/g, "").replace(/[  ]/g, " ").split(/\r?\n/);
  const raw = [];
  for (const line of lines) {
    const m = line.match(WA);
    if (m) raw.push({ a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), h: m[4], mi: m[5], s: m[6] ?? 0, ampm: m[7], rest: m[8] });
    else if (raw.length) raw[raw.length - 1].rest += "\n" + line;
  }
  if (!raw.length) return null;
  // day order: year first (Y-M-D) is unambiguous; otherwise look for a field > 12, then fall back to --date-order (default D/M/Y)
  const yFirst = raw[0].a > 31;
  let order = opt("date-order");
  if (!order && !yFirst) order = raw.some((r) => r.a > 12) ? "dmy" : raw.some((r) => r.b > 12) ? "mdy" : "dmy";
  const out = raw.map((r) => {
    const [y, mo, d] = yFirst ? [r.a, r.b, r.c] : order === "mdy" ? [r.c, r.a, r.b] : [r.c, r.b, r.a];
    const year = y < 100 ? 2000 + y : y;
    const ts = epochOf(year, mo, d, to24(r.h, r.ampm), r.mi, r.s);
    const m = r.rest.match(/^([^:]{1,80}?):\s([\s\S]*)$/);
    if (!m) return { ts, sender: "SYSTEM", text: r.rest, type: T.system };
    const body = m[2];
    const t = body.trim();
    const type = /^(<Media omitted>|<メディアなし>|<省略影音>|<媒体已省略>)$/.test(t) || /^(image|photo) omitted$/i.test(t) ? T.image
      : /^(sticker omitted|<sticker omitted>)$/i.test(t) ? T.sticker
      : /^(video omitted)$/i.test(t) ? T.video
      : /^(audio omitted)$/i.test(t) || /\.opus \(file attached\)$/i.test(t) ? T.voice
      : /^(document omitted)$/i.test(t) || /\(file attached\)$/i.test(t) ? T.file
      : /^https?:\/\/\S+$/.test(t) ? T.link : T.text;
    return { ts, sender: m[1].trim(), text: body, type };
  });
  const name = filename.match(/WhatsApp Chat (?:with|-)\s*(.+?)\.txt$/i)?.[1] ?? filename.match(/WhatsApp.*?(?:と|with)\s*(.+?)(?:のチャット)?\.txt$/i)?.[1] ?? null;
  return { platform: "whatsapp", name, messages: out };
}

// ---------------------------------------------------------------- ChatLab JSON
function parseChatLab(doc) {
  const meta = doc.meta ?? {};
  const members = new Map((doc.members ?? []).map((m) => [String(m.platformId), m.accountName ?? m.platformId]));
  const messages = (doc.messages ?? []).map((m) => {
    const ts = Number(m.timestamp);
    return {
      ts: ts > 1e12 ? Math.floor(ts / 1000) : ts,
      senderId: String(m.sender),
      sender: m.accountName ?? members.get(String(m.sender)) ?? String(m.sender),
      text: m.content ?? "",
      type: Number.isInteger(m.type) ? m.type : T.text,
      pid: m.platformMessageId ? String(m.platformMessageId) : null,
      reply: m.replyToMessageId ? String(m.replyToMessageId) : null,
    };
  });
  return { platform: String(meta.platform ?? "chatlab"), name: meta.name ?? null, group: meta.type === "group", ownerId: meta.ownerId ? String(meta.ownerId) : null, messages };
}

// ---------------------------------------------------------------- main
if (!file) {
  console.log(`用法 / usage:  npm run import -- <导出文件> [--me "你在聊天里的名字"] [--name "显示名"] [--date-order dmy|mdy]

支持：LINE 的「トーク履歴を送信 / 发送聊天记录」.txt、WhatsApp「导出聊天（不含媒体）」.txt、ChatLab JSON。`);
  process.exit(0);
}
if (!fs.existsSync(file)) die(`找不到文件：${file}`);
const textIn = fs.readFileSync(file, "utf8");
const base = path.basename(file);

let chat;
if (/^\s*\{/.test(textIn)) {
  let doc;
  try { doc = JSON.parse(textIn); } catch (e) { die(`不是合法的 JSON：${e.message}`); }
  if (!doc.messages || !doc.meta) die("这个 JSON 不是 ChatLab 格式（需要 meta 和 messages）");
  chat = parseChatLab(doc);
} else if (/^﻿?\[LINE\]/.test(textIn)) {
  chat = parseLine(textIn);
} else {
  chat = parseWhatsApp(textIn, base);
  if (!chat) die("认不出这个文件的格式。支持 LINE / WhatsApp 导出的 .txt 和 ChatLab JSON。");
}
const msgs = chat.messages.filter((m) => Number.isFinite(m.ts) && m.ts > 0);
if (!msgs.length) die("文件里没有读到消息");

// who is "me": --me, ChatLab's ownerId, or — in a two-person chat — whoever isn't the chat partner
const people = [...new Set(msgs.filter((m) => m.type !== T.system).map((m) => m.senderId ?? m.sender))];
const isGroup = chat.group ?? people.length > 2;
let me = opt("me") ?? chat.ownerId ?? null;
if (!me && !isGroup && chat.name) me = people.find((p) => p !== chat.name) ?? null;
if (me && !people.includes(me)) {
  const byName = msgs.find((m) => m.sender === me);
  if (byName?.senderId) me = byName.senderId;
  else if (!byName) die(`聊天里没有叫「${me}」的人。出现过的名字：${people.join("、")}`);
}
if (!me) die(`分不出哪个是你。请加上 --me "你的名字"。出现过的名字：${people.join("、")}`);
const name = opt("name") ?? chat.name ?? people.find((p) => p !== me) ?? base;

// stable conversation id → re-importing the same chat appends to the same file
const id = `${chat.platform.replace(/[^a-z0-9]/gi, "").toLowerCase() || "chat"}_${crypto.createHash("sha1").update(`${chat.platform}|${name}|${me}`).digest("hex").slice(0, 10)}`;
fs.mkdirSync(CHATS_DIR, { recursive: true, mode: 0o700 });
const dbFile = path.join(CHATS_DIR, `${id}.db`);
const fresh = !fs.existsSync(dbFile);
const d = new DatabaseSync(dbFile);
if (fresh) {
  d.exec(`CREATE TABLE meta(name TEXT NOT NULL, platform TEXT NOT NULL, type TEXT NOT NULL, imported_at INTEGER NOT NULL, group_id TEXT, group_avatar TEXT, owner_id TEXT, schema_version INTEGER DEFAULT 10, session_gap_threshold INTEGER);
    CREATE TABLE member(id INTEGER PRIMARY KEY AUTOINCREMENT, platform_id TEXT NOT NULL UNIQUE, account_name TEXT, group_nickname TEXT, aliases TEXT DEFAULT '[]', avatar TEXT, roles TEXT DEFAULT '[]');
    CREATE TABLE message(id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, sender_account_name TEXT, sender_group_nickname TEXT, ts INTEGER NOT NULL, type INTEGER NOT NULL, content TEXT, reply_to_message_id TEXT DEFAULT NULL, platform_message_id TEXT DEFAULT NULL);
    CREATE INDEX idx_message_ts ON message(ts); CREATE UNIQUE INDEX idx_message_platform_id ON message(platform_message_id);`);
  d.prepare("INSERT INTO meta(name,platform,type,imported_at,owner_id) VALUES(?,?,?,?,?)").run(name, chat.platform, isGroup ? "group" : "private", Math.floor(Date.now() / 1000), me);
} else {
  d.prepare("UPDATE meta SET imported_at=?").run(Math.floor(Date.now() / 1000));
}
fs.chmodSync(dbFile, 0o600);

const memberId = new Map(d.prepare("SELECT id, platform_id FROM member").all().map((r) => [r.platform_id, Number(r.id)]));
const addMember = d.prepare("INSERT INTO member(platform_id,account_name) VALUES(?,?)");
const member = (pid, display) => {
  if (!memberId.has(pid)) { addMember.run(pid, pid === me ? "我" : display); memberId.set(pid, Number(d.prepare("SELECT last_insert_rowid() id").get().id)); }
  return memberId.get(pid);
};
const exists = d.prepare("SELECT 1 FROM message WHERE platform_message_id=?");
const ins = d.prepare("INSERT INTO message(sender_id,sender_account_name,ts,type,content,reply_to_message_id,platform_message_id) VALUES(?,?,?,?,?,?,?)");

// exports without message ids get a content id: same time + sender + text (+ how many times that triple already appeared)
const seen = new Map();
msgs.sort((a, b) => a.ts - b.ts);
let added = 0, dup = 0;
d.exec("BEGIN");
try {
  for (const m of msgs) {
    const pidSender = m.senderId ?? m.sender;
    let pid = m.pid;
    if (!pid) {
      const k = `${m.ts}|${pidSender}|${m.text}`;
      const n = (seen.get(k) ?? 0) + 1; seen.set(k, n);
      pid = `${chat.platform}:${crypto.createHash("sha1").update(`${k}|${n}`).digest("hex").slice(0, 16)}`;
    }
    if (exists.get(pid)) { dup++; continue; }
    ins.run(member(pidSender, m.sender), pidSender === me ? "我" : m.sender, m.ts, m.type, String(m.text).replace(/\s+$/, ""), m.reply ?? null, pid);
    added++;
  }
  d.exec("COMMIT");
} catch (e) {
  d.exec("ROLLBACK");
  die(`写入失败，什么都没改：${e.message}`);
}
const total = Number(d.prepare("SELECT COUNT(*) n FROM message").get().n);
d.close();

writeState({ ok: true, sessions: [{ id, name, new: added }] });
const fmt = (s) => new Date(s * 1000).toLocaleString("sv-SE").slice(0, 16);
console.log(`✓ ${name}（${chat.platform}${isGroup ? "，群聊" : ""}）：新增 ${added} 条，已存在 ${dup} 条，共 ${total} 条
  时间范围 ${fmt(msgs[0].ts)} → ${fmt(msgs[msgs.length - 1].ts)}
  你 = ${me === "我" ? me : `「${me}」`}${isGroup ? "\n  群聊目前不会被 AI 整理，只能在 App 里查看。" : ""}
下一步：npm run organize（用你自己的 API 密钥整理成记录）`);
