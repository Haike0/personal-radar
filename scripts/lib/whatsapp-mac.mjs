// Read WhatsApp Desktop for Mac's own message store, read-only. The app keeps chats in plain SQLite (Core Data)
// under ~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite, with the same tables as
// WhatsApp for iPhone: ZWACHATSESSION (chats), ZWAMESSAGE (messages), ZWAGROUPMEMBER (group members).
// NOT TESTED against a real install yet (built from the published schema); the tests use a made-up database.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const T = { text: 0, image: 1, voice: 2, video: 3, file: 4, sticker: 5, link: 7, location: 8, share: 24, system: 80, other: 99 };
const APPLE_EPOCH = 978307200;
export const CONTAINER = path.join(os.homedir(), "Library", "Group Containers", "group.net.whatsapp.WhatsApp.shared");
const short = (s, n = 12) => crypto.createHash("sha1").update(s).digest("hex").slice(0, n);
export const chatId = (jid) => `whatsapp_${short(jid, 10)}`;
// ZMESSAGETYPE values as WhatsApp uses them
const KIND = { 0: [T.text, ""], 1: [T.image, "[图片]"], 2: [T.video, "[视频]"], 3: [T.voice, "[语音]"], 4: [T.share, "[名片]"], 5: [T.location, "[位置]"], 6: [T.system, ""], 7: [T.link, ""], 8: [T.file, "[文件]"], 10: [T.system, ""], 11: [T.image, "[GIF]"], 14: [T.system, "[消息已删除]"], 15: [T.sticker, "[表情]"] };

/** The ChatStorage.sqlite file, if WhatsApp Desktop is installed and Radar may read it. */
export function find(container = CONTAINER) {
  for (const f of ["ChatStorage.sqlite", path.join("Message", "ChatStorage.sqlite")]) { const p = path.join(container, f); if (fs.existsSync(p)) return p; }
  return null;
}
export function open(file) {
  if (!file) return { error: "没找到 WhatsApp 电脑版的数据：先在这台 Mac 上安装并登录 WhatsApp" };
  try { const d = new DatabaseSync(file, { readOnly: true }); d.prepare("SELECT 1 FROM ZWAMESSAGE LIMIT 1").get(); return { d }; }
  catch (e) { return /authoriz|permission|not permitted|unable to open/i.test(String(e.message)) ? { noAccess: true, error: "没有读取权限：需要给运行 Radar 的程序打开「完全磁盘访问」" } : { error: String(e.message) }; }
}

/** New messages after Z_PK `after`, as import-core chats. Group chats only when `groups`. */
export function read({ file = find(), after = 0, groups = false } = {}) {
  const o = open(file);
  if (!o.d) return { ...o, chats: [], max: after };
  const d = o.d;
  try {
    const chats = new Map();
    for (const c of d.prepare("SELECT Z_PK id, ZCONTACTJID jid, ZPARTNERNAME name, ZSESSIONTYPE type FROM ZWACHATSESSION").all()) {
      const jid = String(c.jid ?? "");
      const isGroup = Number(c.type) === 1 || jid.endsWith("@g.us");
      if (!jid || jid.endsWith("@status") || jid.endsWith("@broadcast") || (isGroup && !groups)) continue;
      chats.set(Number(c.id), { id: chatId(jid), platform: "whatsapp", group: isGroup, ownerId: "me", name: String(c.name || "WhatsApp"), messages: [] });
    }
    const members = new Map();
    try { for (const m of d.prepare("SELECT Z_PK id, ZMEMBERJID jid, ZCONTACTNAME name FROM ZWAGROUPMEMBER").all()) members.set(Number(m.id), { jid: String(m.jid ?? ""), name: String(m.name ?? "") }); } catch { /* older layout */ }
    const rows = d.prepare(`SELECT Z_PK pk, ZCHATSESSION chat, ZISFROMME me, ZFROMJID fromjid, ZGROUPMEMBER member, ZTEXT text, ZMESSAGEDATE at, ZMESSAGETYPE type, ZSTANZAID stanza, ZPUSHNAME push
      FROM ZWAMESSAGE WHERE Z_PK > ? ORDER BY Z_PK`).all(after);
    let max = after, unnamed = 0;
    const label = new Map();
    for (const r of rows) {
      max = Math.max(max, Number(r.pk));
      const chat = chats.get(Number(r.chat));
      if (!chat) continue;
      const [type, placeholder] = KIND[Number(r.type)] ?? [T.other, "[消息]"];
      const text = String(r.text ?? "").trim() || placeholder;
      if (!text) continue;
      let sender = chat.name, sid = `wa_${short(String(r.fromjid ?? chat.id))}`;
      if (Number(r.me)) { sender = "我"; sid = "me"; }
      else if (chat.group) {
        const m = members.get(Number(r.member));
        const key = m?.jid || String(r.fromjid ?? "");
        sid = `wa_${short(key || "unknown")}`;
        sender = m?.name || String(r.push ?? "") || label.get(key) || (label.set(key, `群成员 ${++unnamed}`), label.get(key));
      }
      chat.messages.push({ ts: Math.floor(Number(r.at)) + APPLE_EPOCH, senderId: sid, sender, text, type, pid: `whatsapp:${r.stanza || `pk${r.pk}`}`, reply: null });
    }
    return { chats: [...chats.values()].filter((c) => c.messages.length), max };
  } finally { d.close(); }
}

export function inspect(file = find()) {
  const o = open(file);
  if (!o.d) return { ok: false, ...o };
  try {
    const r = o.d.prepare("SELECT COUNT(*) n, SUM(ZSESSIONTYPE = 1) g FROM ZWACHATSESSION").get();
    return { ok: true, chats: Number(r.n), groups: Number(r.g ?? 0) };
  } finally { o.d.close(); }
}
