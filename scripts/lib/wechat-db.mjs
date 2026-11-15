// Read WeChat 4.x databases that are already plain SQLite files on this computer (contact.db + message_N.db).
// Radar only opens plain SQLite files, read-only; an encrypted file is reported and left alone.
// Layout (WCDB): one table per conversation, Msg_<md5(username)>, in one or more message_N.db files;
// Name2Id maps real_sender_id → username; message_content is text, or zstd bytes when WCDB_CT_message_content = 4;
// local_type keeps the base type in the low 32 bits and the app-message subtype in the high bits (49 + 57 = quote reply).
// Usernames (wxid) never leave this module: chats and senders get hashed ids, and nameless senders get a neutral label.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const T = { text: 0, image: 1, voice: 2, video: 3, file: 4, sticker: 5, link: 7, location: 8, call: 23, share: 24, system: 80, recall: 81, other: 99 };
const SYSTEM_ACCOUNTS = new Set(["filehelper", "weixin", "fmessage", "medianote", "floatbottle", "qqmail", "newsapp", "notifymessage", "notification_messages", "brandsessionholder", "brandservicesessionholder", "opencustomerservicemsg", "qqsafe", "tmessage", "mphelper", "exmail_tool"]);
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const short = (s, n = 12) => crypto.createHash("sha1").update(s).digest("hex").slice(0, n);
export const chatId = (username) => `wechat_${short(username, 10)}`;
const senderId = (username) => `wx_${short(username)}`;

/** Find contact.db and message_N.db anywhere up to 4 levels below the chosen folder. */
export function scan(dir) {
  const out = { contact: null, messages: [] };
  const walk = (d, depth) => {
    let list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const f of list) {
      const p = path.join(d, f.name);
      if (f.isDirectory() && depth < 4) walk(p, depth + 1);
      else if (f.isFile() && f.name === "contact.db" && !out.contact) out.contact = p;
      else if (f.isFile() && /^message_\d+\.db$/.test(f.name)) out.messages.push(p);
    }
  };
  walk(dir, 0);
  out.messages.sort();
  return out;
}

const open = (file) => new DatabaseSync(file, { readOnly: true });
export const ENCRYPTED = "这个文件夹里的库还是加密的，Radar 不处理解密";
/** A plain SQLite file starts with "SQLite format 3\0"; anything else (an encrypted database) is left alone. */
export function isPlain(file) {
  try { const fd = fs.openSync(file, "r"); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd); return b.toString("latin1") === "SQLite format 3\0"; }
  catch { return false; }
}
const encrypted = (files) => [files.contact, ...files.messages].filter(Boolean).some((f) => !isPlain(f));

function zstd(buf) {
  if (typeof zlib.zstdDecompressSync !== "function") throw new Error("解压微信消息需要 Node.js 22.15 或更新版本");
  return zlib.zstdDecompressSync(Buffer.from(buf)).toString("utf8");
}
function body(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return v[0] === 0x28 && v[1] === 0xb5 && v[2] === 0x2f && v[3] === 0xfd ? zstd(v) : Buffer.from(v).toString("utf8");
  return String(v);
}
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`)); return m ? m[1].trim() : ""; };
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** One WeChat message → Radar's text and type. */
export function convert(base, sub, text) {
  switch (base) {
    case 1: return { type: T.text, text };
    case 3: return { type: T.image, text: "[图片]" };
    case 34: return { type: T.voice, text: "[语音]" };
    case 43: return { type: T.video, text: "[视频]" };
    case 47: return { type: T.sticker, text: "[表情]" };
    case 48: return { type: T.location, text: "[位置]" };
    case 42: return { type: T.share, text: "[名片]" };
    case 50: return { type: T.call, text: "[通话]" };
    case 10000: case 10002: {
      const plain = unxml(text.replace(/<[^>]+>/g, "")).trim();
      return { type: /撤回/.test(plain) ? T.recall : T.system, text: plain || "[系统消息]" };
    }
    case 49: {
      const title = unxml(tag(text, "title"));
      if (sub === 57) return { type: T.text, text: title, reply: tag(text, "svrid") || null };
      if (sub === 5 || sub === 4) return { type: T.link, text: title ? `[链接] ${title}` : "[链接]" };
      if (sub === 6) return { type: T.file, text: title ? `[文件] ${title}` : "[文件]" };
      if (sub === 19) return { type: T.share, text: "[聊天记录]" };
      if (sub === 2000) return { type: T.other, text: "[转账]" };
      if (sub === 2001) return { type: T.other, text: "[红包]" };
      if (sub === 62) return { type: T.system, text: title || "[拍一拍]" };
      return { type: T.share, text: title ? `[分享] ${title}` : "[分享]" };
    }
    default: return { type: T.other, text: "[消息]" };
  }
}

/** Names for usernames: your remark first, then their nickname. */
function names(contactFile) {
  const out = new Map(), kind = new Map();
  if (!contactFile) return { out, kind };
  const d = open(contactFile);
  try {
    for (const t of ["stranger", "contact"]) { // contact wins over stranger
      try {
        for (const r of d.prepare(`SELECT username, remark, nick_name, local_type FROM ${t}`).all()) {
          const n = String(r.remark || r.nick_name || "").trim();
          if (n) out.set(r.username, n);
          if (t === "contact") kind.set(r.username, Number(r.local_type));
        }
      } catch { /* table missing in this version */ }
    }
  } finally { d.close(); }
  return { out, kind };
}

/**
 * Read every conversation (or only `only`), messages newer than `since[chatId]` (seconds; a day of overlap is added by
 * the caller), as import-core chats. `groups`: also read group chats.
 */
export function read(dir, { since = {}, groups = false, only = null } = {}) {
  const files = scan(dir);
  if (!files.messages.length) throw new Error("这个文件夹里没找到 message_0.db 这类消息库");
  if (encrypted(files)) throw new Error(ENCRYPTED);
  const { out: nameOf } = names(files.contact);
  const chats = new Map(); // username → chat
  let me = null;
  const meVotes = new Map();
  for (const file of files.messages) {
    const d = open(file);
    try {
      const n2i = new Map(d.prepare("SELECT rowid id, user_name FROM Name2Id").all().map((r) => [Number(r.id), String(r.user_name)]));
      const byTable = new Map([...n2i.values()].map((u) => [`Msg_${md5(u)}`, u]));
      const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg\\_%' ESCAPE '\\'").all().map((r) => String(r.name));
      for (const tname of tables) {
        const username = byTable.get(tname);
        if (!username) continue;
        const isGroup = username.endsWith("@chatroom");
        if (isGroup && !groups) continue;
        if (!isGroup && (SYSTEM_ACCOUNTS.has(username) || username.startsWith("gh_"))) continue;
        if (only && !only.has(chatId(username))) continue;
        const id = chatId(username);
        const from = Number(since[id] ?? 0);
        const rows = d.prepare(`SELECT local_id, CAST(server_id AS TEXT) sid, CAST(local_type AS TEXT) lt, real_sender_id, create_time, message_content
          FROM "${tname}" WHERE create_time >= ? ORDER BY create_time, local_id`).all(from);
        if (!rows.length) continue;
        let chat = chats.get(username);
        if (!chat) { chat = { platform: "wechat", name: nameOf.get(username) || (isGroup ? "群聊" : "微信好友"), group: isGroup, ownerId: null, messages: [], id, _user: username }; chats.set(username, chat); }
        for (const r of rows) {
          const lt = BigInt(r.lt), base = Number(lt & 0xffffffffn), sub = Number(lt >> 32n);
          const who = n2i.get(Number(r.real_sender_id)) ?? "";
          let text = body(r.message_content);
          // in groups, other people's text starts with "username:\n"
          if (isGroup) { const m = text.match(/^([\w@.-]+):\n/); if (m) text = text.slice(m[0].length); }
          if (!isGroup && who && who !== username) meVotes.set(who, (meVotes.get(who) ?? 0) + 1);
          const c = convert(base, sub, text);
          chat.messages.push({
            ts: Number(r.create_time), senderId: who ? senderId(who) : "wx_system", _who: who, sender: "", text: c.text, type: who || c.type === T.recall ? c.type : T.system,
            pid: r.sid && r.sid !== "0" ? `wechat:${r.sid}` : `wechat:l${r.local_id}:${r.create_time}`, reply: c.reply ? `wechat:${c.reply}` : null,
          });
        }
      }
    } finally { d.close(); }
  }
  me = [...meVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const meId = me ? senderId(me) : "wx_me";
  const label = new Map(); let unnamed = 0;
  for (const chat of chats.values()) {
    chat.ownerId = meId;
    for (const m of chat.messages) {
      if (m._who === me) m.sender = "我";
      else if (!m._who) m.sender = "系统";
      else m.sender = nameOf.get(m._who) || (chat.group ? (label.get(m._who) ?? (label.set(m._who, `群成员 ${++unnamed}`), label.get(m._who))) : chat.name);
      delete m._who;
    }
    delete chat._user;
  }
  return { me: meId, chats: [...chats.values()], files: { contact: !!files.contact, messages: files.messages.length } };
}

/** What's in the folder: how many private and group chats, without reading messages. */
export function inspect(dir) {
  const files = scan(dir);
  if (!files.messages.length) return { ok: false, error: "这个文件夹里没找到 message_0.db 这类消息库", files: { contact: !!files.contact, messages: 0 } };
  if (encrypted(files)) return { ok: false, encrypted: true, error: ENCRYPTED, files: { contact: !!files.contact, messages: files.messages.length } };
  const { out: nameOf } = names(files.contact);
  const seen = new Map();
  for (const file of files.messages) {
    const d = open(file);
    try {
      const users = d.prepare("SELECT user_name FROM Name2Id").all().map((r) => String(r.user_name));
      const tables = new Set(d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg\\_%' ESCAPE '\\'").all().map((r) => String(r.name)));
      for (const u of users) {
        if (!tables.has(`Msg_${md5(u)}`) || SYSTEM_ACCOUNTS.has(u) || u.startsWith("gh_")) continue;
        const n = Number(d.prepare(`SELECT COUNT(*) n FROM "Msg_${md5(u)}"`).get().n);
        const prev = seen.get(u) ?? { id: chatId(u), name: nameOf.get(u) || (u.endsWith("@chatroom") ? "群聊" : "微信好友"), group: u.endsWith("@chatroom"), messages: 0 };
        prev.messages += n; seen.set(u, prev);
      }
    } finally { d.close(); }
  }
  const list = [...seen.values()].sort((a, b) => b.messages - a.messages);
  return { ok: true, files: { contact: !!files.contact, messages: files.messages.length }, private: list.filter((x) => !x.group), groups: list.filter((x) => x.group) };
}
