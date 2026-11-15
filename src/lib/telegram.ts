import "server-only";
import fs from "node:fs";
import path from "node:path";
// everything from the package root: sub-path imports can load a second copy of a class and break its type checks
import { Api, Logger, sessions, TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { LogLevel } from "telegram/extensions/Logger";
const { StringSession } = sessions;
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { getSetting, nowStr, setSettings } from "./db";
import { plan, write, writeState, type Chat, type Msg } from "../../scripts/lib/import-core.mjs";

// Telegram through its official API (MTProto, via the MIT-licensed gramjs). The user brings their own api_id/api_hash
// from my.telegram.org and logs in here with the code Telegram sends them. The login lives only in DATA_DIR
// (telegram.session, readable by you alone) and is never logged. ReadMe only reads: no sending, no marking as read.

const SESSION = path.join(DATA_DIR, "telegram.session");
const quiet = () => new Logger(LogLevel.NONE);
const creds = () => ({ apiId: Number(getSetting("tg_api_id") || 0), apiHash: getSetting("tg_api_hash") });
export const selected = (): string[] => { try { return JSON.parse(getSetting("tg_chats") || "[]"); } catch { return []; } };
const marks = (): Record<string, number> => { try { return JSON.parse(getSetting("tg_marks") || "{}"); } catch { return {}; } };
const readSession = () => { try { return fs.readFileSync(SESSION, "utf8").trim(); } catch { return ""; } };
const saveSession = (s: string) => { fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); fs.writeFileSync(SESSION, s, { mode: 0o600 }); };
const localId = (id: string) => `telegram_${id.replace(/[^\w-]/g, "")}`;
const friendly = (e: unknown) => {
  const m = String((e as Error)?.message ?? e);
  if (/PHONE_CODE_INVALID/.test(m)) return "验证码不对";
  if (/PHONE_CODE_EXPIRED/.test(m)) return "验证码过期了，重新发一次";
  if (/PASSWORD_HASH_INVALID/.test(m)) return "两步验证密码不对";
  if (/API_ID_INVALID/.test(m)) return "api_id 或 api_hash 不对，到 my.telegram.org 再核对一下";
  if (/PHONE_NUMBER_INVALID/.test(m)) return "手机号格式不对，带上国家区号，比如 +81 90…";
  if (/FLOOD_WAIT_(\d+)/.test(m)) return `Telegram 让你等 ${m.match(/FLOOD_WAIT_(\d+)/)![1]} 秒再试`;
  return m.slice(0, 200);
};

// one client per server process; the login steps and the live listener share it
const g = globalThis as unknown as { __tg?: { client: TelegramClient; phone?: string; hash?: string; live?: boolean } };
async function client(fresh = false) {
  const { apiId, apiHash } = creds();
  if (!apiId || !apiHash) throw new Error("先填 api_id 和 api_hash");
  if (g.__tg && !fresh) return g.__tg.client;
  if (g.__tg) { try { await g.__tg.client.disconnect(); } catch { /* already closed */ } }
  const c = new TelegramClient(new StringSession(fresh ? "" : readSession()), apiId, apiHash, { connectionRetries: 3, baseLogger: quiet() });
  await c.connect();
  g.__tg = { client: c };
  return c;
}

export async function status() {
  const { apiId, apiHash } = creds();
  const base = { hasKeys: !!(apiId && apiHash), on: getSetting("tg_on") === "on", selected: selected(), last: getSetting("tg_last") || null, result: getSetting("tg_result") || null };
  if (!base.hasKeys || !readSession()) return { ...base, loggedIn: false };
  try {
    const c = await client();
    if (!(await c.checkAuthorization())) return { ...base, loggedIn: false };
    const dialogs = await c.getDialogs({ limit: 200 });
    return { ...base, loggedIn: true, live: !!g.__tg?.live, chats: dialogs.filter((d) => !d.isChannel || d.isGroup).map((d) => ({ id: String(d.id), name: d.title ?? d.name ?? "Telegram", group: !!d.isGroup, unread: d.unreadCount })) };
  } catch (e) { return { ...base, loggedIn: false, error: friendly(e) }; }
}

export async function sendCode(phone: string) {
  try {
    const c = await client(true);
    const r = await c.sendCode(creds(), phone.trim());
    g.__tg = { client: c, phone: phone.trim(), hash: r.phoneCodeHash };
    return { ok: true };
  } catch (e) { return { ok: false, error: friendly(e) }; }
}

export async function signIn(code: string) {
  const t = g.__tg;
  if (!t?.phone || !t.hash) return { ok: false, error: "先发验证码" };
  try {
    await t.client.invoke(new Api.auth.SignIn({ phoneNumber: t.phone, phoneCodeHash: t.hash, phoneCode: code.trim() }));
  } catch (e) {
    if (/SESSION_PASSWORD_NEEDED/.test(String((e as Error).message))) return { ok: false, needPassword: true };
    return { ok: false, error: friendly(e) };
  }
  saveSession(String(t.client.session.save()));
  return { ok: true };
}

export async function password(pw: string) {
  const t = g.__tg;
  if (!t) return { ok: false, error: "先发验证码" };
  let failure: string | null = null;
  try {
    await t.client.signInWithPassword(creds(), { password: async () => pw, onError: async (e) => { failure = friendly(e); return true; } });
  } catch (e) { failure ??= friendly(e); }
  if (failure) return { ok: false, error: failure };
  saveSession(String(t.client.session.save()));
  return { ok: true };
}

export async function logout() {
  try { if (g.__tg) await g.__tg.client.disconnect(); } catch { /* fine */ }
  g.__tg = undefined;
  try { fs.rmSync(SESSION); } catch { /* none */ }
  setSettings({ tg_on: "off" });
}

function toMsg(m: Api.Message, chatName: string): Msg | null {
  const text = m.message?.trim() || (m.photo ? "[图片]" : m.sticker ? "[表情]" : m.voice ? "[语音]" : m.video ? "[视频]" : m.document ? "[文件]" : m.geo ? "[位置]" : "");
  if (!text) return null;
  const fromId = m.senderId ? String(m.senderId) : "unknown";
  const sender = m.out ? "我" : ((m.sender as { firstName?: string; lastName?: string; title?: string } | undefined) ? [(m.sender as { firstName?: string }).firstName, (m.sender as { lastName?: string }).lastName].filter(Boolean).join(" ") || (m.sender as { title?: string }).title || chatName : chatName);
  return { ts: m.date, senderId: m.out ? "me" : `tg_${fromId}`, sender, text, type: m.photo ? 1 : m.sticker ? 5 : m.voice ? 2 : m.video ? 3 : m.document ? 4 : 0, pid: `telegram:${m.id}`, reply: m.replyTo?.replyToMsgId ? `telegram:${m.replyTo.replyToMsgId}` : null };
}

function store(id: string, name: string, group: boolean, msgs: Msg[]) {
  if (!msgs.length) return 0;
  const chat: Chat = { platform: "telegram", name, group, ownerId: "me", messages: msgs };
  const p = plan(chat, { id: localId(id), me: "me", name }, CHATS_DIR);
  if (!p.ok) return 0;
  return write(chat, p, CHATS_DIR).added;
}

/** Fetch what's new in the chosen chats (the first time: up to `history` messages back). */
export async function sync(history = 3000) {
  const ids = selected();
  if (!ids.length) return { ok: false, error: "还没选要同步的聊天" };
  try {
    const c = await client();
    const m = marks();
    const dialogs = new Map((await c.getDialogs({ limit: 200 })).map((d) => [String(d.id), d]));
    let added = 0;
    const sessions: { id: string; name: string; new: number }[] = [];
    for (const id of ids) {
      const d = dialogs.get(id);
      if (!d) continue;
      const name = d.title ?? "Telegram";
      const msgs: Msg[] = [];
      let top = m[id] ?? 0;
      for await (const x of c.iterMessages(d.entity, { limit: m[id] ? undefined : history, minId: m[id] ?? 0 })) {
        if (!(x instanceof Api.Message)) continue;
        top = Math.max(top, x.id);
        const msg = toMsg(x, name);
        if (msg) msgs.push(msg);
      }
      const n = store(id, name, !!d.isGroup, msgs);
      m[id] = top;
      if (n) { added += n; sessions.push({ id: localId(id), name, new: n }); }
    }
    closeReal();
    setSettings({ tg_marks: JSON.stringify(m), tg_last: nowStr(), tg_result: added ? `新增 ${added} 条（${sessions.length} 个聊天）` : "没有新消息" });
    if (added) writeState(DATA_DIR, { ok: true, file: "Telegram", sessions });
    return { ok: true, added };
  } catch (e) {
    const error = friendly(e);
    setSettings({ tg_last: nowStr(), tg_result: `出错：${error}` });
    return { ok: false, error };
  }
}

/** New messages in the chosen chats arrive the moment they're sent (while ReadMe is running). */
export async function startLive() {
  if (g.__tg?.live || getSetting("tg_on") !== "on" || !readSession()) return false;
  const c = await client();
  if (!(await c.checkAuthorization())) return false;
  c.addEventHandler(async (ev: NewMessageEvent) => {
    try {
      const id = String(ev.chatId ?? "");
      if (!selected().includes(id)) return;
      const chat = await ev.message.getChat();
      const name = (chat as { title?: string; firstName?: string } | undefined)?.title ?? (chat as { firstName?: string } | undefined)?.firstName ?? "Telegram";
      const msg = toMsg(ev.message, name);
      if (msg && store(id, name, ev.isGroup ?? false, [msg])) { closeReal(); const m = marks(); m[id] = Math.max(m[id] ?? 0, ev.message.id); setSettings({ tg_marks: JSON.stringify(m) }); }
    } catch { /* one bad message must not stop the listener */ }
  }, new NewMessage({}));
  g.__tg!.live = true;
  return true;
}
