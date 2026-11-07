import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { getSetting, setSettings } from "./db";
import { plan, write, writeState, type Chat, type Msg } from "../../scripts/lib/import-core.mjs";

// Optional bridge to Beeper Desktop (https://www.beeper.com), a free app that connects WhatsApp, Telegram, Signal,
// Instagram, iMessage (macOS) and more in one place. Its Desktop API runs only on this computer (default port 23373):
// Settings → Developers → enable Desktop API, then Settings → Integrations → Approved connections → + to create a token.
// Radar only reads: chats you pick are copied into Radar's own store, and re-syncing adds new messages only.

type BChat = { id: string; title: string; network: string; type: "single" | "group"; accountID: string };
type BMsg = { id: string; chatID: string; senderID: string; senderName?: string; timestamp: string; text?: string; type?: string; isSender?: boolean; isDeleted?: boolean; isHidden?: boolean; linkedMessageID?: string };
type Page<T> = { items: T[]; hasMore: boolean; oldestCursor: string | null };

const cfg = () => ({ url: (getSetting("beeper_api_url") || "http://localhost:23373").replace(/\/+$/, ""), token: getSetting("beeper_api_token") });
async function call<T>(p: string, over?: { url?: string; token?: string }): Promise<T> {
  const c = { ...cfg(), ...Object.fromEntries(Object.entries(over ?? {}).filter(([, v]) => v)) };
  if (!c.token) throw new Error("还没有填 Beeper 的访问令牌");
  let r: Response;
  try {
    r = await fetch(`${c.url}${p}`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new Error(`连不上 ${c.url}：先打开 Beeper，并在「设置 → Developers」里打开 Desktop API`);
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Error("Beeper 拒绝了令牌：在 Beeper「设置 → Integrations → Approved connections」重新创建一个");
  if (!r.ok) throw new Error(j.message ?? j.error ?? `Beeper 返回 HTTP ${r.status}`);
  return j as T;
}

export async function status(over?: { url?: string; token?: string }) {
  const chats: BChat[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) { // up to 2000 chats
    const q: string = `/v1/chats?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const pg: Page<BChat> = await call<Page<BChat>>(q, over);
    chats.push(...pg.items);
    if (!pg.hasMore || !pg.oldestCursor) break;
    cursor = pg.oldestCursor;
  }
  return { version: null, sessions: chats.map((c) => ({ id: c.id, name: c.title, platform: c.network, type: c.type === "group" ? "group" : "private", messages: null })) };
}

const TYPE: Record<string, number> = { TEXT: 0, NOTICE: 80, IMAGE: 1, VIDEO: 3, VOICE: 2, AUDIO: 2, FILE: 4, STICKER: 5, LOCATION: 8 };
const LABEL: Record<number, string> = { 1: "[图片]", 2: "[语音]", 3: "[视频]", 4: "[文件]", 5: "[表情]", 8: "[位置]" };
const localId = (chatID: string) => `beeper_${crypto.createHash("sha1").update(chatID).digest("hex").slice(0, 12)}`;
export const selected = (): string[] => { try { return JSON.parse(getSetting("beeper_chats") || "[]"); } catch { return []; } };

/** Copy the chosen Beeper chats into Radar, newest first, stopping where earlier syncs left off. */
export async function sync(ids = selected(), maxMessages = 30000) {
  const meta = new Map((await status()).sessions.map((s) => [s.id, s]));
  const out: { id: string; name: string; added: number; error?: string }[] = [];
  for (const chatID of ids) {
    try {
      const m = meta.get(chatID);
      if (!m) throw new Error("Beeper 里找不到这个聊天了");
      const file = path.join(CHATS_DIR, `${localId(chatID)}.db`);
      const local = fs.existsSync(file) ? new DatabaseSync(file, { readOnly: true }) : null;
      const known = local?.prepare("SELECT 1 FROM message WHERE platform_message_id=?");
      const msgs: Msg[] = [];
      let cursor: string | null = null, reached = false;
      while (msgs.length < maxMessages && !reached) {
        const q: string = `/v1/chats/${encodeURIComponent(chatID)}/messages?direction=before${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const pg: Page<BMsg> = await call<Page<BMsg>>(q);
        for (const x of pg.items) {
          if (x.type === "REACTION" || x.isHidden) continue;
          const pid = `beeper:${x.id}`;
          if (known?.get(pid)) { reached = true; continue; }
          const type = x.isDeleted ? 81 : TYPE[x.type ?? "TEXT"] ?? 99;
          msgs.push({ ts: Math.floor(Date.parse(x.timestamp) / 1000), senderId: x.isSender ? "me" : x.senderID, sender: x.isSender ? "我" : x.senderName || x.senderID,
            text: x.text || LABEL[type] || "", type, pid, reply: x.linkedMessageID ? `beeper:${x.linkedMessageID}` : null });
        }
        if (!pg.hasMore || !pg.oldestCursor) break;
        cursor = pg.oldestCursor;
      }
      local?.close();
      const chat: Chat = { platform: m.platform.toLowerCase().replace(/[^a-z0-9]/g, "") || "beeper", name: m.name, group: m.type === "group", ownerId: "me", messages: msgs };
      if (!msgs.length) { out.push({ id: localId(chatID), name: m.name, added: 0 }); continue; }
      const p = plan(chat, { id: localId(chatID), me: "me" }, CHATS_DIR);
      if (!p.ok) throw new Error(p.error);
      const r = write(chat, p, CHATS_DIR);
      out.push({ id: p.id, name: p.name, added: r.added });
    } catch (e) {
      out.push({ id: chatID, name: meta.get(chatID)?.name ?? chatID, added: 0, error: (e as Error).message });
    }
  }
  closeReal();
  const ok = out.some((x) => !x.error);
  writeState(DATA_DIR, { ok, error: ok ? null : out[0]?.error ?? null, file: "Beeper", sessions: out.filter((x) => !x.error).map((x) => ({ id: x.id, name: x.name, new: x.added })) });
  setSettings({ beeper_chats: JSON.stringify(ids) });
  return out;
}
