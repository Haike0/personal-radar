// Read Messages (iMessage / SMS) from this Mac's own ~/Library/Messages/chat.db, read-only.
// macOS only lets a program read it after the user grants Full Disk Access to whatever runs Radar (Terminal, or node);
// Radar never tries to get around that: it reports `noAccess` and the app shows the steps.
// Newer macOS often leaves `text` empty and keeps the words in `attributedBody` (an archived NSAttributedString).
// Only conversations you've written in are read by default: one-way texts (codes, banks, ads) stay out.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const T = { text: 0, image: 1, file: 4, system: 80, recall: 81 };
const APPLE_EPOCH = 978307200; // 2001-01-01
export const DEFAULT_DB = path.join(os.homedir(), "Library", "Messages", "chat.db");
const short = (s, n = 12) => crypto.createHash("sha1").update(s).digest("hex").slice(0, n);
export const chatId = (guid) => `imessage_${short(guid, 10)}`;

/** The plain text inside an attributedBody blob (typedstream archive of an NSAttributedString). */
export function bodyText(blob) {
  if (!blob) return "";
  const b = Buffer.from(blob);
  const at = b.indexOf("NSString");
  if (at < 0) return "";
  let i = b.indexOf(0x2b, at + 8); // '+' starts the string payload
  if (i < 0 || i > at + 16) return "";
  i++;
  let len = b[i++];
  if (len === 0x81) { len = b.readUInt16LE(i); i += 2; }
  else if (len === 0x82) { len = b.readUIntLE(i, 3); i += 3; }
  else if (len === 0x83) { len = b.readUInt32LE(i); i += 4; }
  return b.subarray(i, i + len).toString("utf8");
}

export function open(file = DEFAULT_DB) {
  try {
    if (!fs.existsSync(file)) return { error: "这台电脑上没有「信息」App 的数据（~/Library/Messages/chat.db）" };
    const d = new DatabaseSync(file, { readOnly: true });
    d.prepare("SELECT 1 FROM message LIMIT 1").get();
    return { d };
  } catch (e) {
    const m = String(e.message);
    if (/authoriz|permission|not permitted|unable to open|SQLITE_CANTOPEN|disk I\/O/i.test(m)) return { noAccess: true, error: "没有读取权限：需要给运行 Radar 的程序打开「完全磁盘访问」" };
    return { error: m };
  }
}

/** Names from the Contacts app (phone numbers compared by their last 8 digits). Empty when Contacts can't be read. */
function contacts() {
  const out = new Map();
  const base = path.join(os.homedir(), "Library", "Application Support", "AddressBook");
  const files = [path.join(base, "AddressBook-v22.abcddb")];
  try { for (const s of fs.readdirSync(path.join(base, "Sources"))) files.push(path.join(base, "Sources", s, "AddressBook-v22.abcddb")); } catch { /* none */ }
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      const d = new DatabaseSync(f, { readOnly: true });
      const name = (r) => [r.ZLASTNAME, r.ZFIRSTNAME].filter(Boolean).join(/[一-鿿]/.test(`${r.ZLASTNAME ?? ""}${r.ZFIRSTNAME ?? ""}`) ? "" : " ").trim() || r.ZORGANIZATION || r.ZNICKNAME || "";
      for (const r of d.prepare("SELECT r.ZFIRSTNAME, r.ZLASTNAME, r.ZORGANIZATION, r.ZNICKNAME, p.ZFULLNUMBER n FROM ZABCDRECORD r JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK").all()) {
        const k = String(r.n ?? "").replace(/\D/g, "").slice(-8); if (k && name(r)) out.set(k, name(r));
      }
      for (const r of d.prepare("SELECT r.ZFIRSTNAME, r.ZLASTNAME, r.ZORGANIZATION, r.ZNICKNAME, e.ZADDRESS a FROM ZABCDRECORD r JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK").all()) {
        const k = String(r.a ?? "").toLowerCase(); if (k && name(r)) out.set(k, name(r));
      }
      d.close();
    } catch { /* locked or different version */ }
  }
  return out;
}
const keyOf = (handle) => (handle.includes("@") ? handle.toLowerCase() : handle.replace(/\D/g, "").slice(-8));

/**
 * New messages since ROWID `after`, grouped into import-core chats. `groups`: include group chats;
 * `oneWay`: include conversations you never wrote in (verification codes and the like are skipped otherwise).
 */
export function read({ file = DEFAULT_DB, after = 0, groups = false, oneWay = false } = {}) {
  const o = open(file);
  if (!o.d) return { ...o, chats: [], max: after };
  const d = o.d;
  try {
    const names = contacts();
    const wrote = new Set(d.prepare("SELECT DISTINCT cmj.chat_id id FROM message m JOIN chat_message_join cmj ON cmj.message_id = m.ROWID WHERE m.is_from_me = 1").all().map((r) => Number(r.id)));
    const chatRows = d.prepare("SELECT ROWID id, guid, style, chat_identifier, display_name FROM chat").all();
    const members = new Map();
    for (const r of d.prepare("SELECT chj.chat_id, h.id FROM chat_handle_join chj JOIN handle h ON h.ROWID = chj.handle_id").all()) members.set(Number(r.chat_id), [...(members.get(Number(r.chat_id)) ?? []), String(r.id)]);
    const label = (handle) => names.get(keyOf(handle)) ?? handle;
    const chats = new Map();
    for (const c of chatRows) {
      const isGroup = Number(c.style) === 43;
      if (isGroup && !groups) continue;
      if (!oneWay && !wrote.has(Number(c.id))) continue;
      const who = members.get(Number(c.id)) ?? [String(c.chat_identifier)];
      chats.set(Number(c.id), { id: chatId(String(c.guid)), platform: "imessage", group: isGroup, ownerId: "me", messages: [],
        name: String(c.display_name || "") || (isGroup ? who.map(label).join("、") : label(who[0])) });
    }
    const rows = d.prepare(`SELECT m.ROWID rid, m.guid, m.text, m.attributedBody ab, m.is_from_me me, CAST(m.date / 1000000000 AS INTEGER) sec, CAST(m.date AS TEXT) raw,
        m.item_type, m.associated_message_type amt, m.cache_has_attachments att, m.thread_originator_guid reply, m.date_retracted retracted, h.id handle, cmj.chat_id
      FROM message m JOIN chat_message_join cmj ON cmj.message_id = m.ROWID LEFT JOIN handle h ON h.ROWID = m.handle_id
      WHERE m.ROWID > ? ORDER BY m.ROWID`).all(after);
    let max = after;
    for (const r of rows) {
      max = Math.max(max, Number(r.rid));
      const chat = chats.get(Number(r.chat_id));
      if (!chat) continue;
      if (Number(r.amt) >= 2000 && Number(r.amt) <= 3007) continue; // tapback reactions
      const sec = String(r.raw).length > 12 ? Number(r.sec) : Number(r.raw); // very old databases store seconds
      let text = String(r.text ?? "") || bodyText(r.ab);
      text = text.replace(/￼/g, "").trim();
      let type = T.text;
      if (Number(r.item_type) !== 0) { type = T.system; text = text || "[系统消息]"; }
      else if (Number(r.retracted)) { type = T.recall; text = "[撤回了一条消息]"; }
      else if (!text && Number(r.att)) { type = T.file; text = "[附件]"; }
      if (!text) continue;
      const handle = String(r.handle ?? "");
      chat.messages.push({ ts: sec + APPLE_EPOCH, senderId: Number(r.me) ? "me" : `im_${short(handle || "unknown")}`, sender: Number(r.me) ? "我" : label(handle) || chat.name,
        text, type, pid: `imessage:${r.guid}`, reply: r.reply ? `imessage:${r.reply}` : null });
    }
    return { chats: [...chats.values()].filter((c) => c.messages.length), max };
  } finally { d.close(); }
}

/** Counts only, for the settings card. */
export function inspect(file = DEFAULT_DB) {
  const o = open(file);
  if (!o.d) return { ok: false, ...o };
  try {
    const c = o.d.prepare("SELECT COUNT(*) chats, SUM(style = 43) groups FROM chat").get();
    const two = o.d.prepare("SELECT COUNT(DISTINCT cmj.chat_id) n FROM message m JOIN chat_message_join cmj ON cmj.message_id = m.ROWID WHERE m.is_from_me = 1").get();
    return { ok: true, chats: Number(c.chats), groups: Number(c.groups ?? 0), conversations: Number(two.n) };
  } finally { o.d.close(); }
}
