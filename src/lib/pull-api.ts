import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { getSetting, setSettings } from "./db";
import { plan, read, write, writeState } from "../../scripts/lib/import-core.mjs";

// Client for the ChatLab Pull protocol (https://docs.chatlab.fun/cn/standard/chatlab-pull): any tool that exposes
// GET /sessions and GET /sessions/:id/messages?format=chatlab&since=… can feed Radar.
type PSession = { id: string; name: string; platform: string; type: string; messageCount?: number };
const cfg = () => ({ url: getSetting("pull_api_url").replace(/\/+$/, ""), token: getSetting("pull_api_token") });

async function get(p: string, over?: { url?: string; token?: string }) {
  const c = { ...cfg(), ...Object.fromEntries(Object.entries(over ?? {}).filter(([, v]) => v)) };
  if (!c.url) throw new Error("还没有填数据源地址");
  let r: Response;
  try {
    r = await fetch(`${c.url}${p}`, { headers: c.token ? { Authorization: `Bearer ${c.token}` } : {}, signal: AbortSignal.timeout(120_000) });
  } catch { throw new Error(`连不上 ${c.url}：先打开那个工具，确认它的服务在运行`); }
  if (r.status === 401 || r.status === 403) throw new Error("数据源拒绝了令牌");
  if (!r.ok) throw new Error(`数据源返回 HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function status(over?: { url?: string; token?: string }) {
  const sessions: PSession[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const j = JSON.parse((await get(`/sessions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, over)).toString("utf8"));
    sessions.push(...(j.sessions ?? []));
    if (!j.page?.hasMore || !j.page?.nextCursor) break;
    cursor = j.page.nextCursor;
  }
  return { version: null, sessions: sessions.map((x) => ({ id: x.id, name: x.name, platform: x.platform, type: x.type === "group" ? "group" : "private", messages: x.messageCount ?? null })) };
}

const localId = (id: string) => `pull_${crypto.createHash("sha1").update(`${cfg().url}|${id}`).digest("hex").slice(0, 12)}`;
export const selected = (): string[] => { try { return JSON.parse(getSetting("pull_sessions") || "[]"); } catch { return []; } };
const lastTs = (id: string) => {
  const f = path.join(CHATS_DIR, `${localId(id)}.db`);
  if (!fs.existsSync(f)) return 0;
  const d = new DatabaseSync(f, { readOnly: true });
  const r = d.prepare("SELECT MAX(ts) t FROM message").get() as { t: number | null };
  d.close();
  return Number(r.t ?? 0);
};

/** Pull new messages for the chosen sessions (since the newest one already here), page by page. */
export async function sync(ids = selected()) {
  const out: { id: string; name: string; added: number; error?: string }[] = [];
  for (const id of ids) {
    try {
      let since = lastTs(id), added = 0, name = id;
      for (let page = 0; page < 200; page++) {
        const buf = await get(`/sessions/${encodeURIComponent(id)}/messages?format=chatlab&since=${since}&limit=5000`);
        const { chats } = read(buf, "pull.json");
        const chat = chats[0];
        const doc = JSON.parse(buf.toString("utf8").trim().startsWith("{\"_type\"") ? "{}" : buf.toString("utf8"));
        if (chat?.messages.length) {
          const p = plan(chat, { id: localId(id), name: chat.name ?? undefined }, CHATS_DIR);
          if (!p.ok) throw new Error(p.error);
          name = p.name; added += write(chat, p, CHATS_DIR).added;
        }
        if (!doc.sync?.hasMore || !doc.sync?.nextSince || doc.sync.nextSince <= since) break;
        since = doc.sync.nextSince;
      }
      out.push({ id: localId(id), name, added });
    } catch (e) {
      out.push({ id, name: id, added: 0, error: (e as Error).message });
    }
  }
  closeReal();
  const ok = out.some((x) => !x.error);
  writeState(DATA_DIR, { ok, error: ok ? null : out[0]?.error ?? null, file: "Pull 数据源", sessions: out.filter((x) => !x.error).map((x) => ({ id: x.id, name: x.name, new: x.added })) });
  setSettings({ pull_sessions: JSON.stringify(ids) });
  return out;
}
