import "server-only";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { getSetting, setSettings } from "./db";
import { fromChatLab, plan, write, writeState } from "../../scripts/lib/import-core.mjs";

// Optional bridge to ChatLab (https://chatlab.fun) through its documented local API (ChatLab → 设置 → ChatLab API).
// Selected conversations are copied into Radar's own chat store via the export endpoint; re-syncing only adds new messages.
// Nothing is written back to ChatLab.

type Session = { id: string; name: string; platform: string; type: string; messageCount?: number; lastTimestamp?: number | null };
const cfg = () => ({ url: (getSetting("chatlab_api_url") || "http://127.0.0.1:3110").replace(/\/+$/, ""), token: getSetting("chatlab_api_token") });

async function call<T>(p: string, over?: { url?: string; token?: string }): Promise<T> {
  const c = { ...cfg(), ...Object.fromEntries(Object.entries(over ?? {}).filter(([, v]) => v)) };
  if (!c.token) throw new Error("还没有填 ChatLab API 令牌");
  let r: Response;
  try {
    r = await fetch(`${c.url}/api/v1${p}`, { headers: { Authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new Error(`连不上 ${c.url}：先打开 ChatLab，并在「设置 → ChatLab API」里启用服务`);
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Error("ChatLab 拒绝了令牌：在 ChatLab「设置 → ChatLab API」里复制最新的令牌");
  if (!r.ok || j.success === false) throw new Error(j.error?.message ?? `ChatLab 返回 HTTP ${r.status}`);
  return (j.data ?? j) as T;
}

export async function status(over?: { url?: string; token?: string }) {
  const s = await call<{ version?: string; sessionCount?: number }>("/status", over);
  const sessions = await call<Session[]>("/sessions", over);
  return { version: s.version ?? null, sessions: sessions.map((x) => ({ id: x.id, name: x.name, platform: x.platform, type: x.type, messages: x.messageCount ?? null, last: x.lastTimestamp ?? null })) };
}

const localId = (id: string) => `chatlab_${id.replace(/[^A-Za-z0-9._@-]/g, "_")}`.slice(0, 120);
export const selected = (): string[] => { try { return JSON.parse(getSetting("chatlab_sessions") || "[]"); } catch { return []; } };

/** Copy the selected ChatLab conversations (new messages only) into Radar. */
export async function sync(ids = selected()) {
  const out: { id: string; name: string; added: number; error?: string }[] = [];
  for (const id of ids) {
    try {
      const doc = await call<{ meta?: { name?: string }; messages?: unknown[] }>(`/sessions/${encodeURIComponent(id)}/export`);
      if (!doc?.messages) throw new Error("ChatLab 的导出接口没有返回消息");
      const chat = fromChatLab(doc);
      const p = plan(chat, { id: localId(id) }, CHATS_DIR);
      if (!p.ok) throw new Error(p.error);
      const r = write(chat, p, CHATS_DIR);
      out.push({ id: p.id, name: p.name, added: r.added });
    } catch (e) {
      out.push({ id, name: id, added: 0, error: (e as Error).message });
    }
  }
  closeReal();
  const ok = out.some((x) => !x.error);
  writeState(DATA_DIR, { ok, error: ok ? null : out[0]?.error ?? null, file: "ChatLab", sessions: out.filter((x) => !x.error).map((x) => ({ id: x.id, name: x.name, new: x.added })) });
  setSettings({ chatlab_sessions: JSON.stringify(ids) });
  return out;
}
