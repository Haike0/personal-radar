// Chat export → Radar's local chat store. Shared by `npm run import` and the in-app importer.
//
// read(buffer, filename)        → { format, chats: [parsed chat…] }   (a zip is opened, a Telegram account export can hold many chats)
// plan(chat, { me, name }, dir) → what would be written: who is "me", conversation id, counts, new vs. already imported
// write(chat, plan, dir)        → appends only new messages; never deletes or rewrites existing ones
//
// Each conversation is one SQLite file (meta / member / message), the same simple layout ChatLab uses, so a chat can
// move between the two tools. Message type numbers follow the ChatLab Format spec.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isZip, readZip } from "./zip.mjs";

export const T = { text: 0, image: 1, voice: 2, video: 3, file: 4, sticker: 5, link: 7, location: 8, call: 23, share: 24, system: 80, recall: 81, other: 99 };

export const FORMATS = [
  { id: "line", label: "LINE", hint: "トーク履歴を送信 / 发送聊天记录（.txt）" },
  { id: "whatsapp", label: "WhatsApp", hint: "导出聊天 → 不含媒体（.txt 或 .zip）" },
  { id: "telegram", label: "Telegram", hint: "Telegram Desktop → 导出聊天记录 → JSON（result.json）" },
  { id: "discord", label: "Discord", hint: "JSON 导出" },
  { id: "instagram", label: "Instagram / Messenger", hint: "下载你的信息 → JSON（message_1.json）" },
  { id: "qq", label: "QQ", hint: "旧版 QQ「导出消息记录」的 .txt，或常见的 QQ 导出 JSON" },
  { id: "googlechat", label: "Google Chat", hint: "Google Takeout 只选 Google Chat（.zip）" },
  { id: "chatlab", label: "通用聊天格式（JSON / JSONL）", hint: "很多开源导出工具都支持" },
  { id: "text", label: "Markdown / 文本聊天记录", hint: "每条带时间和发送人的 .md / .txt，或打包成 .zip" },
];

const p2 = (n) => String(n).padStart(2, "0");
const epochOf = (y, mo, d, h, mi, s = 0) => Math.floor(new Date(`${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(s)}`).getTime() / 1000);
const to24 = (h, ampm) => { h = Number(h); if (!ampm) return h; const pm = /p|午後|下午|晚上/i.test(ampm); return (h % 12) + (pm ? 12 : 0); };
const linkOnly = (t) => /^https?:\/\/\S+$/.test(t);

// ---------------------------------------------------------------- LINE (.txt)
// [LINE] 佐藤さんとのトーク履歴 / [LINE] Chat history with Sato / [LINE] 与佐藤的聊天记录   (groups: [LINE] 〇〇のトーク履歴)
// 保存日時：2026/11/07 10:00
// 2026/11/05(水)              ← day line; also "2026.11.05 星期三", "Wed, 11/05/2026"
// 21:03<TAB>佐藤さん<TAB>本文  ← message; text with line breaks is wrapped in "…"
function parseLine(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const title = lines[0] ?? "";
  const pick = (re) => title.match(re)?.[1]?.trim() ?? null;
  const partner = pick(/^\[LINE\]\s*(.+?)とのトーク履歴/) ?? pick(/^\[LINE\]\s*Chat (?:history )?with\s+(.+)$/i)
    ?? pick(/^\[LINE\]\s*与(.+?)的聊天记录/) ?? pick(/^\[LINE\]\s*(?:和|與)(.+?)的聊天記錄/);
  const groupName = partner ? null : pick(/^\[LINE\]\s*(.+?)のトーク履歴/) ?? pick(/^\[LINE\]\s*(.+?)(?:的聊天记录|的聊天記錄)$/);
  let day = null, open = null;
  const out = [];
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/‎/g, "");
    let m;
    if (open) {
      if (line.endsWith('"')) { open.text += "\n" + line.slice(0, -1); open = null; } else open.text += "\n" + line;
      continue;
    }
    if ((m = line.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:\s*[（(][^)）]*[)）]|\s+\S+)?\s*$/))) { day = [m[1], m[2], m[3]]; continue; }
    if ((m = line.match(/^[A-Za-z]{3},?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/))) { day = [m[3], m[1], m[2]]; continue; }
    if (day && (m = line.match(/^(?:(午前|午後|上午|下午|AM|PM) ?)?(\d{1,2}):(\d{2})(?: ?([AP]M))?\t([^\t]*)\t?(.*)$/i))) {
      const [, pre, h, mi, post, sender, body] = m;
      const msg = { ts: epochOf(day[0], day[1], day[2], to24(h, pre || post), mi), sender: sender.trim(), text: body };
      if (body.startsWith('"') && !(body.length > 1 && body.endsWith('"'))) { msg.text = body.slice(1); open = msg; }
      else if (body.length > 1 && body.startsWith('"') && body.endsWith('"')) msg.text = body.slice(1, -1);
      out.push(msg);
      continue;
    }
    if (day && out.length && line.trim() && !/^保存日時|^Saved/.test(line)) out[out.length - 1].text += "\n" + line;
  }
  for (const msg of out) {
    const t = msg.text.trim();
    if (!msg.sender) { msg.sender = "SYSTEM"; msg.type = T.system; continue; }
    msg.type = /^\[(写真|Photo|照片|图片|圖片|アルバム|Album)\]/i.test(t) ? T.image
      : /^\[(スタンプ|Sticker|贴图|貼圖|表情贴)\]$/i.test(t) ? T.sticker
      : /^\[(動画|Video|视频|影片)\]$/i.test(t) ? T.video
      : /^\[(ボイスメッセージ|Voice message|语音|語音|音声)\]$/i.test(t) ? T.voice
      : /^\[(ファイル|File|文件|檔案)\]/i.test(t) ? T.file
      : /^\[(位置情報|Location|位置)\]/i.test(t) ? T.location
      : /^☎|^(通話時間|Call time|通话时长|不在着信|Missed call|未接来电)/i.test(t) ? T.call
      : /メッセージの送信を取り消しました|unsent a message|撤回了一条消息/i.test(t) ? T.recall
      : linkOnly(t) ? T.link : T.text;
  }
  return [{ platform: "line", name: partner ?? groupName, group: groupName ? true : undefined, messages: out }];
}

// ---------------------------------------------------------------- WhatsApp (.txt, often inside a .zip)
// iOS:     [05/11/2026, 21:03:12] Name: text
// Android: 05/11/2026, 21:03 - Name: text   (12-hour clocks add "PM"; D/M/Y vs M/D/Y depends on the phone's region)
const WA = /^\[?(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?|午前|午後|上午|下午)?\]?\s*(?:-\s*)?(.*)$/;
// WhatsApp puts some notices under the chat partner's name (iOS), so recognise them by their text
const WA_NOTICE = /end-to-end encrypted|エンドツーエンド暗号化|端到端加密|security code (with|changed)|セキュリティコードが変更|disappearing messages|消えるメッセージ|created group|joined using this group's invite link|changed the (subject|group description|group icon)|changed this group's|^‎?(You )?(added|removed|left)\b/i;
function parseWhatsApp(text, filename, opts) {
  const lines = text.replace(/^﻿/, "").replace(/[‎‏‪-‮]/g, "").replace(/[  ]/g, " ").split(/\r?\n/);
  const raw = [];
  for (const line of lines) {
    const m = line.match(WA);
    if (m && (m[8] !== undefined)) raw.push({ a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), h: m[4], mi: m[5], s: m[6] ?? 0, ampm: m[7], rest: m[8] });
    else if (raw.length) raw[raw.length - 1].rest += "\n" + line;
  }
  if (raw.length < 1) return null;
  const yFirst = raw[0].a > 31;
  let order = opts.dateOrder;
  if (!order && !yFirst) order = raw.some((r) => r.a > 12) ? "dmy" : raw.some((r) => r.b > 12) ? "mdy" : "dmy";
  const messages = raw.map((r) => {
    const [y, mo, d] = yFirst ? [r.a, r.b, r.c] : order === "mdy" ? [r.c, r.a, r.b] : [r.c, r.b, r.a];
    const ts = epochOf(y < 100 ? 2000 + y : y, mo, d, to24(r.h, r.ampm), r.mi, r.s);
    const m = r.rest.match(/^([^:\n]{1,60}?):\s([\s\S]*)$/);
    if (!m) return { ts, sender: "SYSTEM", text: r.rest, type: T.system };
    const body = m[2].replace(/\s+$/, ""), t = body.trim();
    if (WA_NOTICE.test(t)) return { ts, sender: "SYSTEM", text: body, type: T.system };
    const type = /^<(Media omitted|メディアなし|省略影音|媒体已省略|Medien ausgeschlossen)>$/i.test(t) || /^(image|photo|GIF) omitted$/i.test(t) || /\.(jpe?g|png|webp|heic) \(file attached\)$/i.test(t) ? T.image
      : /^sticker omitted$/i.test(t) || /\.webp \(file attached\)$/i.test(t) ? T.sticker
      : /^video omitted$/i.test(t) || /\.mp4 \(file attached\)$/i.test(t) ? T.video
      : /^audio omitted$/i.test(t) || /\.opus \(file attached\)$/i.test(t) ? T.voice
      : /^(document|Contact card) omitted$/i.test(t) || /\(file attached\)$/i.test(t) ? T.file
      : /^(This message was deleted|You deleted this message|このメッセージは削除されました|此消息已删除)$/i.test(t) ? T.recall
      : /^location: https?:\/\//i.test(t) ? T.location
      : linkOnly(t) ? T.link : T.text;
    return { ts, sender: m[1].trim(), text: body, type };
  });
  const base = path.basename(filename).replace(/\.(txt|zip)$/i, "");
  const name = base.match(/^WhatsApp Chat (?:with|-)\s*(.+)$/i)?.[1] ?? base.match(/^WhatsApp(?:\s*チャット)?\s*[-–]\s*(.+)$/i)?.[1]
    ?? base.match(/^(.+?)とのWhatsAppチャット$/)?.[1] ?? base.match(/^与(.+?)的 WhatsApp 聊天$/)?.[1] ?? null;
  return [{ platform: "whatsapp", name, messages }];
}

// ---------------------------------------------------------------- Telegram Desktop (result.json)
const tgText = (t) => (Array.isArray(t) ? t.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("") : String(t ?? ""));
function telegramChat(c, myName) {
  const group = !/^(personal_chat|bot_chat|saved_messages)$/.test(String(c.type ?? ""));
  const messages = (c.messages ?? []).map((m) => {
    const ts = Number(m.date_unixtime) || Math.floor(Date.parse(m.date) / 1000);
    if (m.type === "service") return { ts, senderId: String(m.actor_id ?? "SYSTEM"), sender: m.actor ?? "SYSTEM", text: m.action ?? "", type: T.system, pid: `tg:${c.id}:${m.id}` };
    const media = m.media_type;
    const type = m.photo ? T.image : media === "sticker" || media === "animation" ? T.sticker : media === "voice_message" || media === "audio_file" ? T.voice
      : media === "video_file" || media === "video_message" ? T.video : m.file ? T.file : m.location_information ? T.location : media === "phone_call" ? T.call : T.text;
    let text = tgText(m.text);
    if (!text && type !== T.text) text = { [T.image]: "[图片]", [T.sticker]: m.sticker_emoji ? `[表情] ${m.sticker_emoji}` : "[表情]", [T.voice]: "[语音]", [T.video]: "[视频]", [T.file]: "[文件]", [T.location]: "[位置]", [T.call]: "[通话]" }[type] ?? "";
    return { ts, senderId: String(m.from_id ?? m.from ?? "unknown"), sender: m.from ?? "未知", text, type: linkOnly(text.trim()) ? T.link : type, pid: `tg:${c.id}:${m.id}`, reply: m.reply_to_message_id ? `tg:${c.id}:${m.reply_to_message_id}` : null };
  });
  const me = myName ? messages.find((m) => m.sender === myName)?.senderId : null;
  return { platform: "telegram", name: c.name ?? null, group, ownerId: me ?? null, messages };
}
function parseTelegram(doc) {
  const my = doc.personal_information ? [doc.personal_information.first_name, doc.personal_information.last_name].filter(Boolean).join(" ") : null;
  const list = doc.chats?.list ?? (doc.messages ? [doc] : []);
  return list.filter((c) => Array.isArray(c.messages) && c.messages.length).map((c) => telegramChat(c, my));
}

// ---------------------------------------------------------------- Discord (JSON export)
function parseDiscord(doc) {
  const dm = /^Direct/.test(String(doc.channel?.type ?? ""));
  const messages = (doc.messages ?? []).map((m) => {
    const ts = Math.floor(Date.parse(m.timestamp) / 1000);
    const att = (m.attachments ?? [])[0];
    let type = /^(Default|Reply)$/.test(m.type ?? "Default") ? T.text : T.system;
    let text = String(m.content ?? "");
    if (!text && att) { type = /\.(png|jpe?g|gif|webp)$/i.test(att.fileName ?? att.url ?? "") ? T.image : T.file; text = type === T.image ? "[图片]" : `[文件] ${att.fileName ?? ""}`.trim(); }
    if (!text && (m.stickers ?? []).length) { type = T.sticker; text = "[表情]"; }
    return { ts, senderId: String(m.author?.id ?? "unknown"), sender: m.author?.nickname || m.author?.name || "未知", text, type: type === T.text && linkOnly(text.trim()) ? T.link : type,
      pid: `discord:${m.id}`, reply: m.reference?.messageId ? `discord:${m.reference.messageId}` : null };
  });
  const name = dm ? doc.channel?.name ?? null : [doc.guild?.name, doc.channel?.name].filter(Boolean).join(" / ") || null;
  return [{ platform: "discord", name, group: dm ? (doc.channel?.type === "DirectGroupTextChat") : true, messages }];
}

// ---------------------------------------------------------------- Instagram / Facebook Messenger (message_N.json)
// Meta writes UTF-8 bytes as \u00XX escapes; undo that.
const metaFix = (s) => (typeof s === "string" && /[\u0080-ÿ]/.test(s) && !/[^\u0000-ÿ]/.test(s) ? Buffer.from(s, "latin1").toString("utf8") : s);
function parseInstagram(doc, filename) {
  const people = (doc.participants ?? []).map((p) => metaFix(p.name));
  const messages = (doc.messages ?? []).map((m) => {
    const ts = Math.floor(Number(m.timestamp_ms) / 1000);
    let text = metaFix(m.content ?? ""), type = T.text;
    if (m.is_unsent) { type = T.recall; text = text || "[已撤回]"; }
    else if (m.photos?.length && !text) { type = T.image; text = "[图片]"; }
    else if (m.videos?.length && !text) { type = T.video; text = "[视频]"; }
    else if (m.audio_files?.length && !text) { type = T.voice; text = "[语音]"; }
    else if (m.sticker && !text) { type = T.sticker; text = "[表情]"; }
    else if (m.share?.link) { type = text ? T.text : T.link; text = text || m.share.link; }
    else if (m.call_duration != null) { type = T.call; text = text || "[通话]"; }
    return { ts, sender: metaFix(m.sender_name ?? "未知"), text, type };
  });
  const platform = /messenger|facebook/i.test(`${filename} ${doc.thread_path ?? ""}`) ? "messenger" : "instagram";
  return [{ platform, name: metaFix(doc.title) ?? null, group: people.length > 2, messages, participants: people }];
}

// ---------------------------------------------------------------- ChatLab Format (JSON / JSONL)
function chatlabChat(meta, members, msgs) {
  const names = new Map((members ?? []).map((m) => [String(m.platformId), m.accountName ?? m.platformId]));
  const messages = msgs.map((m) => {
    const ts = Number(m.timestamp);
    return { ts: ts > 1e12 ? Math.floor(ts / 1000) : ts, senderId: String(m.sender), sender: m.accountName ?? names.get(String(m.sender)) ?? String(m.sender),
      text: m.content ?? "", type: Number.isInteger(m.type) ? m.type : T.text, pid: m.platformMessageId ? String(m.platformMessageId) : null, reply: m.replyToMessageId ? String(m.replyToMessageId) : null };
  });
  return { platform: String(meta?.platform ?? "chatlab"), name: meta?.name ?? null, group: meta?.type === "group", ownerId: meta?.ownerId ? String(meta.ownerId) : null, messages };
}
function parseChatLabJsonl(text) {
  let meta = null; const members = [], msgs = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { throw new Error(`第 ${i + 1} 行不是合法 JSON`); }
    if (o._type === "header") meta = o.meta ?? o;
    else if (o._type === "member") members.push(o);
    else if (o._type === "message") msgs.push(o);
  }
  if (!meta) throw new Error("JSONL 缺少 header 行");
  return [chatlabChat(meta, members, msgs)];
}


// ---------------------------------------------------------------- QQ export JSON (chatInfo + messages layout)
// { chatInfo: { name, type|chatType, selfUid|selfUin, selfName }, statistics: { senders: [...] }, messages: [{ msgId|id|seq, sender: {uid, uin, name} | "id", timestamp, content: string | {text, elements} }] }
const QCE_KIND = { image: T.image, pic: T.image, face: T.sticker, marketface: T.sticker, sticker: T.sticker, file: T.file, video: T.video, ptt: T.voice, voice: T.voice, record: T.voice, location: T.location };
function parseQce(doc) {
  const info = doc.chatInfo ?? {};
  const selfIds = new Set([info.selfUid, info.selfUin].filter(Boolean).map(String));
  const names = new Map();
  for (const s of [...(doc.statistics?.senders ?? []), ...(info.members ?? [])]) {
    const name = s.remark || s.cardName || s.name || s.nick;
    for (const id of [s.uid, s.uin].filter(Boolean)) if (name) names.set(String(id), name);
  }
  let owner = null;
  const messages = (doc.messages ?? []).map((m) => {
    const s = m.sender;
    const ids = typeof s === "object" && s ? [s.uid, s.uin].filter(Boolean).map(String) : [String(s || m.senderUin || m.senderUid || "")];
    const id = ids[0] || "SYSTEM";
    if (ids.some((x) => selfIds.has(x))) owner = id;
    const sender = (typeof s === "object" && s ? s.name || s.nick : null) || names.get(id) || id;
    let ts = Number(m.timestamp ?? m.time ?? 0); if (ts > 1e12) ts = Math.floor(ts / 1000);
    const c = m.content;
    let text = typeof c === "string" ? c : c?.text ?? "";
    let type = T.text;
    if (c && typeof c === "object" && !text) {
      for (const el of c.elements ?? []) if (el?.type === "text") text += el.data?.text ?? el.data?.content ?? "";
      if (!text) { const k = String(c.elements?.[0]?.type ?? "").toLowerCase(); type = QCE_KIND[k] ?? T.other; text = { [T.image]: "[图片]", [T.sticker]: "[表情]", [T.file]: "[文件]", [T.video]: "[视频]", [T.voice]: "[语音]", [T.location]: "[位置]" }[type] ?? "[消息]"; }
    }
    if (m.type === "system" || m.isSystem) type = T.system;
    const pid = m.msgId ?? m.id ?? m.seq;
    return { ts, senderId: id, sender, text, type: type === T.text && linkOnly(text.trim()) ? T.link : type, pid: pid != null ? `qq:${pid}` : null };
  });
  const raw = String(info.chatType ?? info.type ?? "").toLowerCase();
  return [{ platform: "qq", name: info.name || info.peerName || null, group: /group|room/.test(raw) ? true : /private|friend|c2c|single/.test(raw) ? false : undefined, ownerId: owner, messages }];
}

// ---------------------------------------------------------------- QQ message manager (.txt, old QQ)
// 消息对象:张三   then blocks of  "2016-05-01 12:00:00 张三" + body lines
function parseQqTxt(text) {
  const chats = [];
  let cur = null, last = null;
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(/^消息对象[:：]\s*(.+)$/))) { cur = { platform: "qq", name: m[1].trim(), messages: [] }; chats.push(cur); last = null; continue; }
    if (/^消息分组[:：]|^={10,}|^消息记录（/.test(line)) continue;
    if ((m = line.match(/^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2}):(\d{2}) (.+)$/))) {
      if (!cur) { cur = { platform: "qq", name: null, messages: [] }; chats.push(cur); }
      const sender = m[7].replace(/\(\d{5,}\)$|<[^>]+>$/, "").trim();
      last = { ts: epochOf(m[1], m[2], m[3], m[4], m[5], m[6]), sender, text: "" };
      cur.messages.push(last);
      continue;
    }
    if (last) last.text += (last.text ? "\n" : "") + line;
  }
  for (const c of chats) for (const msg of c.messages) {
    msg.text = msg.text.replace(/\n+$/, "");
    const t = msg.text.trim();
    msg.type = /^\[图片\]$/.test(t) ? T.image : /^\[表情\]$/.test(t) ? T.sticker : /^\[文件\]/.test(t) ? T.file : linkOnly(t) ? T.link : T.text;
  }
  return chats.filter((c) => c.messages.length);
}

// ---------------------------------------------------------------- Google Chat (Google Takeout .zip)
// Google Chat/Groups/<DM or Space>/messages.json  + group_info.json;  Google Chat/Users/User */user_info.json = you
function parseGoogleChat(entries) {
  const meEntry = entries.find((e) => /Google Chat\/Users\/[^/]+\/user_info\.json$/.test(e.name));
  let myEmail = null;
  try { myEmail = JSON.parse(meEntry.read().toString("utf8")).user?.email ?? null; } catch {}
  const groups = new Map();
  for (const e of entries) {
    const m = e.name.match(/Google Chat\/Groups\/([^/]+)\/(messages|group_info)\.json$/);
    if (m) groups.set(m[1], { ...(groups.get(m[1]) ?? {}), [m[2]]: e });
  }
  const chats = [];
  for (const [dir, g] of groups) {
    if (!g.messages) continue;
    let info = {};
    try { info = g.group_info ? JSON.parse(g.group_info.read().toString("utf8")) : {}; } catch {}
    const doc = JSON.parse(g.messages.read().toString("utf8"));
    const members = (info.members ?? []).filter((x) => x.email !== myEmail);
    const messages = (doc.messages ?? []).map((m, i) => {
      const d = String(m.created_date ?? "").replace(/[\u202f\u00a0]/g, " ").replace(/^[A-Za-z]+,\s*/, "").replace(" at ", " ");
      const ts = Math.floor(Date.parse(d) / 1000);
      const email = m.creator?.email ?? m.creator?.name ?? "unknown";
      const text = m.text ?? (m.attached_files?.length ? "[文件]" : "");
      return { ts, senderId: email, sender: m.creator?.name ?? email, text, type: text === "[文件]" ? T.file : linkOnly(text.trim()) ? T.link : T.text, pid: `gchat:${dir}:${m.message_id ?? i}` };
    });
    const isDM = /^DM /i.test(dir) || members.length <= 1;
    chats.push({ platform: "googlechat", name: info.name || members.map((x) => x.name).join("、") || dir, group: !isDM, ownerId: myEmail, messages });
  }
  return chats;
}


// ---------------------------------------------------------------- Markdown / plain-text chat logs
// What many exporters (and forwarded-chat tools) write, in any of these shapes:
//   - 2026-11-05 21:03:12 [文本] 小雨: 内容          (one line per message, optional bullet / [type])
//   [2026-11-05 21:03] 小雨：内容
//   小雨 2026-11-05 21:03:12  ↵  内容…              (header line, then the text)
//   ## 2026-11-05  ↵  21:03 小雨：内容  /  **小雨** 21:03 ↵ 内容
const TEXT_KIND = { 文本: T.text, 文字: T.text, 图片: T.image, 照片: T.image, 表情: T.sticker, 动画表情: T.sticker, 语音: T.voice, 视频: T.video, 文件: T.file, 链接: T.link, 位置: T.location, 通话: T.call, 系统: T.system, 撤回: T.recall };
const DT = String.raw`(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?[ T](\d{1,2}):(\d{2})(?::(\d{2}))?`;
function parseTextLog(text, filename) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const bullet = String.raw`(?:[-*]\s+|\d{1,6}[.)、]\s+)?`;
  const oneLine = new RegExp(String.raw`^${bullet}\[?${DT}\]?\s*(?:\[([^\]]{1,80})\]\s*)?(?:\*\*)?([^:：\n*\[\]<]{1,40}?)(?:\*\*)?\s*[:：]\s?(.*)$`);
  const stamped = new RegExp(String.raw`^${bullet}\[?${DT}\]?\s*(?:\[([^\]]{1,80})\]\s*)?(.*)$`); // a timestamp but no "sender:" → system line
  const header = new RegExp(String.raw`^(?:[-*]\s+)?(?:\*\*)?([^\n*:：]{1,40}?)(?:\*\*)?\s+\(?${DT}\)?\s*$`); // "导出时间: …" is metadata, not a sender
  const dayHead = /^#{1,4}\s*(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/;
  const timeLine = /^(?:[-*]\s+)?(?:\*\*)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?\s+([^:：\n*]{1,40}?)|([^:：\n*]{1,40}?)(?:\*\*)?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)(?:\*\*)?\s*(?:[:：]\s?(.*))?$/;
  const title = lines.find((l) => /^#\s/.test(l)) ?? "";
  const name = title.match(/^#\s*(?:聊天记录|Chat(?: history)?)\s*[:：]\s*(.+)$/i)?.[1]?.trim() ?? title.match(/^#\s*(?:与|和)(.+?)的聊天记录/)?.[1]?.trim()
    ?? (path.basename(filename).replace(/\.(md|markdown|txt)$/i, "").replace(/^(聊天记录|chat)[_-\s]*/i, "") || null);
  const out = [];
  let day = null, open = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(oneLine)) && m[8]) {
      const tag = (m[7] ?? "").split(/[｜|]/).pop().trim(); // "[群号｜图片]" → 图片
      const kind = tag ? TEXT_KIND[tag] ?? T.text : T.text;
      open = { ts: epochOf(m[1], m[2], m[3], m[4], m[5], m[6] ?? 0), sender: m[8].trim(), text: m[9] ?? "", type: kind };
      out.push(open); continue;
    }
    if ((m = line.match(stamped)) && !line.match(header)) {
      const tag = (m[7] ?? "").split(/[｜|]/).pop().trim();
      open = null;
      out.push({ ts: epochOf(m[1], m[2], m[3], m[4], m[5], m[6] ?? 0), sender: "SYSTEM", text: m[8] ?? "", type: TEXT_KIND[tag] === T.recall ? T.recall : T.system });
      continue;
    }
    if ((m = line.match(header))) { open = { ts: epochOf(m[2], m[3], m[4], m[5], m[6], m[7] ?? 0), sender: m[1].trim(), text: "", type: T.text }; out.push(open); continue; }
    if ((m = line.match(dayHead))) { day = [m[1], m[2], m[3]]; open = null; continue; }
    if (day && (m = line.match(timeLine))) {
      const [h, mi, sec, who] = m[1] ? [m[1], m[2], m[3], m[4]] : [m[6], m[7], m[8], m[5]];
      open = { ts: epochOf(day[0], day[1], day[2], h, mi, sec ?? 0), sender: who.trim(), text: m[9] ?? "", type: T.text };
      out.push(open); continue;
    }
    if (open && line.trim() && !/^#/.test(line) && !/^[-*]\s+\S+[:：]/.test(line)) open.text += (open.text ? "\n" : "") + line.replace(/^\s{2,}/, "").replace(/^>\s?/, "");
  }
  for (const msg of out) {
    const t = msg.text.trim();
    if (msg.type === T.text) msg.type = /^\[(图片|照片)\]$/.test(t) ? T.image : /^\[(表情|动画表情)\]$/.test(t) ? T.sticker : /^\[语音\]/.test(t) ? T.voice : linkOnly(t) ? T.link : T.text;
  }
  return out.length ? [{ platform: "text", name, messages: out }] : null;
}

// ---------------------------------------------------------------- entry points
/** Read an export (Buffer or string) and return its chats. Throws with a readable message when the format is unknown. */
export function read(input, filename = "", opts = {}) {
  let buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  let name = filename;
  if (isZip(buf)) {
    const entries = readZip(buf).filter((e) => !e.name.startsWith("__MACOSX") && /\.(txt|json|jsonl|md|markdown)$/i.test(e.name));
    if (entries.some((e) => /Google Chat\/Groups\/[^/]+\/messages\.json$/.test(e.name))) return { format: "googlechat", chats: parseGoogleChat(entries) };
    const texts = readZip(buf).filter((e) => !e.name.startsWith("__MACOSX") && /\.(md|markdown|txt)$/i.test(e.name) && !/_chat\.txt$/i.test(e.name));
    if (texts.length > 1) {
      const chats = texts.flatMap((e) => parseTextLog(e.read().toString("utf8"), e.name) ?? []);
      if (chats.length) return { format: "text", chats };
    }
    const pickEntry = entries.find((e) => /(^|\/)_chat\.txt$/i.test(e.name)) ?? entries.find((e) => /WhatsApp/i.test(e.name)) ?? entries.find((e) => /message_\d+\.json$|result\.json$/i.test(e.name)) ?? entries[0];
    if (!pickEntry) throw new Error("zip 里没有找到聊天文件（.txt / .json）");
    buf = pickEntry.read();
    if (/_chat\.txt$/i.test(pickEntry.name)) name = filename; // WhatsApp: the partner's name is in the zip's name
    else name = pickEntry.name;
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const head = text.slice(0, 4000);
  if (/^\s*\{/.test(head)) {
    if (/^\s*\{\s*"_type"\s*:/.test(head)) return { format: "chatlab", chats: parseChatLabJsonl(text) };
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error(`JSON 解析失败：${e.message}`); }
    if (doc.chatlab || (doc.meta && doc.messages)) return { format: "chatlab", chats: [chatlabChat(doc.meta, doc.members, doc.messages ?? [])] };
    if (doc.guild && doc.channel && Array.isArray(doc.messages)) return { format: "discord", chats: parseDiscord(doc) };
    if (doc.chatInfo && Array.isArray(doc.messages)) return { format: "qq", chats: parseQce(doc) };
    if (Array.isArray(doc.participants) && Array.isArray(doc.messages) && doc.messages.some((m) => "sender_name" in m)) return { format: "instagram", chats: parseInstagram(doc, name) };
    if (doc.chats?.list || (Array.isArray(doc.messages) && "type" in doc && doc.messages.some((m) => "date" in m))) return { format: "telegram", chats: parseTelegram(doc) };
    throw new Error("认不出这个 JSON：支持通用聊天格式、常见的 QQ 导出、Telegram、Discord、Instagram / Messenger");
  }
  if (/^\[LINE\]/.test(head)) return { format: "line", chats: parseLine(text) };
  if (/消息对象[:：]|^消息记录（此消息记录为文本格式/m.test(head)) return { format: "qq", chats: parseQqTxt(text) };
  const wa = parseWhatsApp(text, name, opts);
  const tl = parseTextLog(text, name);
  const real = (chats) => (chats ? chats[0].messages.filter((m) => m.type !== T.system).length : 0);
  // both can read "2026-11-01 21:03:12 名字: 内容"; on a tie it's WhatsApp only with its own marks ([date…], "date," or "time - ")
  const waMark = /^(\[\d|\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},|.{6,24}\d{1,2}:\d{2}(:\d{2})?\s*([AaPp]\.?\s?[Mm]\.?)?\s+-\s)/m.test(head);
  if (tl && (real(tl) > real(wa) || (real(tl) === real(wa) && !waMark))) return { format: "text", chats: tl };
  if (wa && wa[0].messages.length) return { format: "whatsapp", chats: wa };
  throw new Error("认不出这个文件的格式。支持：LINE / WhatsApp / QQ 的导出，带时间和发送人的 Markdown 或文本记录，Google Chat 的 .zip，以及通用聊天格式、Telegram、Discord、Instagram 的 JSON。");
}

/** Work out who is "me", the conversation id, and how many messages are new. Never writes. */
export function plan(chat, opts = {}, chatsDir) {
  const msgs = chat.messages.filter((m) => Number.isFinite(m.ts) && m.ts > 0);
  if (!msgs.length) return { ok: false, error: "文件里没有读到消息" };
  const idOf = (m) => m.senderId ?? m.sender;
  const counts = new Map();
  for (const m of msgs) if (m.type !== T.system) counts.set(idOf(m), (counts.get(idOf(m)) ?? 0) + 1);
  const names = new Map(msgs.map((m) => [idOf(m), m.sender]));
  const people = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, name: names.get(id) ?? id, messages: n }));
  const isGroup = chat.group ?? people.length > 2;
  let me = opts.me ?? chat.ownerId ?? null;
  // the owner id from the source (ChatLab / Beeper) is trusted even if "me" sent nothing in this batch
  if (me && !counts.has(me)) me = people.find((p) => p.name === me)?.id ?? (chat.ownerId === me ? me : null);
  if (opts.me && !me) return { ok: false, needMe: true, people, error: `聊天里没有叫「${opts.me}」的人` };
  if (!me) me = people.find((p) => /^(我|me|自分)$/i.test(p.name))?.id ?? null; // exporters often write yourself as 我
  if (!me && !isGroup && chat.name) me = people.find((p) => p.name !== chat.name && p.id !== chat.name)?.id ?? null;
  if (!me && !isGroup && chat.participants?.length === 2 && chat.name) me = people.find((p) => p.name !== chat.name)?.id ?? null;
  if (!me) return { ok: false, needMe: true, people, isGroup, error: "分不出哪个是你，请选一下" };
  const name = (opts.name ?? chat.name ?? people.find((p) => p.id !== me)?.name ?? "未命名").trim();
  const id = opts.id ?? `${chat.platform.replace(/[^a-z0-9]/gi, "").toLowerCase() || "chat"}_${crypto.createHash("sha1").update(`${chat.platform}|${name}|${me}`).digest("hex").slice(0, 10)}`;
  assignIds(chat);
  let existing = 0;
  const file = path.join(chatsDir, `${id}.db`);
  if (fs.existsSync(file)) {
    const d = new DatabaseSync(file, { readOnly: true });
    const q = d.prepare("SELECT 1 FROM message WHERE platform_message_id=?");
    for (const m of msgs) if (q.get(m.pid)) existing++;
    d.close();
  }
  const sorted = msgs.map((m) => m.ts).sort((a, b) => a - b);
  return { ok: true, id, name, me, meName: names.get(me) ?? me, isGroup, platform: chat.platform, people, total: msgs.length, existing, fresh: msgs.length - existing, first: sorted[0], last: sorted[sorted.length - 1] };
}

// exports without message ids get a content id: time + sender + text (+ how often that triple already appeared)
function assignIds(chat) {
  if (chat._ids) return;
  const seen = new Map();
  chat.messages.sort((a, b) => a.ts - b.ts);
  for (const m of chat.messages) {
    if (m.pid) continue;
    const k = `${m.ts}|${m.senderId ?? m.sender}|${m.text}`;
    const n = (seen.get(k) ?? 0) + 1; seen.set(k, n);
    m.pid = `${chat.platform}:${crypto.createHash("sha1").update(`${k}|${n}`).digest("hex").slice(0, 16)}`;
  }
  chat._ids = true;
}

/** Append the chat's new messages to its conversation file. */
export function write(chat, p, chatsDir) {
  fs.mkdirSync(chatsDir, { recursive: true, mode: 0o700 });
  assignIds(chat);
  const file = path.join(chatsDir, `${p.id}.db`);
  const fresh = !fs.existsSync(file);
  const d = new DatabaseSync(file);
  try {
    if (fresh) {
      d.exec(`CREATE TABLE meta(name TEXT NOT NULL, platform TEXT NOT NULL, type TEXT NOT NULL, imported_at INTEGER NOT NULL, group_id TEXT, group_avatar TEXT, owner_id TEXT, schema_version INTEGER DEFAULT 10, session_gap_threshold INTEGER);
        CREATE TABLE member(id INTEGER PRIMARY KEY AUTOINCREMENT, platform_id TEXT NOT NULL UNIQUE, account_name TEXT, group_nickname TEXT, aliases TEXT DEFAULT '[]', avatar TEXT, roles TEXT DEFAULT '[]');
        CREATE TABLE message(id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, sender_account_name TEXT, sender_group_nickname TEXT, ts INTEGER NOT NULL, type INTEGER NOT NULL, content TEXT, reply_to_message_id TEXT DEFAULT NULL, platform_message_id TEXT DEFAULT NULL);
        CREATE INDEX idx_message_ts ON message(ts); CREATE UNIQUE INDEX idx_message_platform_id ON message(platform_message_id);`);
      d.prepare("INSERT INTO meta(name,platform,type,imported_at,owner_id) VALUES(?,?,?,?,?)").run(p.name, p.platform, p.isGroup ? "group" : "private", Math.floor(Date.now() / 1000), p.me);
    } else {
      d.prepare("UPDATE meta SET imported_at=?").run(Math.floor(Date.now() / 1000));
    }
    fs.chmodSync(file, 0o600);
    const memberId = new Map(d.prepare("SELECT id, platform_id FROM member").all().map((r) => [r.platform_id, Number(r.id)]));
    const addMember = d.prepare("INSERT INTO member(platform_id,account_name) VALUES(?,?)");
    const member = (pid, display) => {
      if (!memberId.has(pid)) { addMember.run(pid, pid === p.me ? "我" : display); memberId.set(pid, Number(d.prepare("SELECT last_insert_rowid() id").get().id)); }
      return memberId.get(pid);
    };
    const exists = d.prepare("SELECT 1 FROM message WHERE platform_message_id=?");
    const ins = d.prepare("INSERT INTO message(sender_id,sender_account_name,ts,type,content,reply_to_message_id,platform_message_id) VALUES(?,?,?,?,?,?,?)");
    let added = 0, dup = 0;
    d.exec("BEGIN");
    try {
      for (const m of chat.messages) {
        if (!Number.isFinite(m.ts) || m.ts <= 0) continue;
        if (exists.get(m.pid)) { dup++; continue; }
        const sid = m.senderId ?? m.sender;
        ins.run(member(sid, m.sender), sid === p.me ? "我" : m.sender, m.ts, m.type, String(m.text ?? "").replace(/\s+$/, ""), m.reply ?? null, m.pid);
        added++;
      }
      d.exec("COMMIT");
    } catch (e) {
      d.exec("ROLLBACK");
      throw new Error(`写入失败，什么都没改：${e.message}`);
    }
    const total = Number(d.prepare("SELECT COUNT(*) n FROM message").get().n);
    return { added, dup, total };
  } finally {
    d.close();
  }
}

/** Record the last import for the app's status line. */
export function writeState(dataDir, state) {
  try {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(dataDir, "import-state.json"), JSON.stringify({ finishedAt: new Date().toLocaleString("sv-SE").slice(0, 16), ...state }));
  } catch {}
}

/** A ChatLab Format document (e.g. from ChatLab's /api/v1/sessions/:id/export) → one chat. */
export const fromChatLab = (doc) => chatlabChat(doc.meta, doc.members, doc.messages ?? []);
