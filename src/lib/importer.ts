import "server-only";
import crypto from "node:crypto";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { plan, read, write, writeState, type Chat, type Plan } from "../../scripts/lib/import-core.mjs";

// Uploaded files are parsed once and kept in memory for 30 minutes, so the preview and the confirm step see the same data.
type Pending = { at: number; files: { name: string; format?: string; error?: string; chats: Chat[] }[] };
const pending = new Map<string, Pending>();
const sweep = () => { for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60e3) pending.delete(k); };

export type PreviewChat = { key: string; file: string; format: string; name: string | null; plan: Plan };
export function preview(files: { name: string; data: Buffer }[], dateOrder?: "dmy" | "mdy") {
  sweep();
  const token = crypto.randomUUID();
  const p: Pending = { at: Date.now(), files: [] };
  const chats: PreviewChat[] = [];
  const errors: { file: string; error: string }[] = [];
  files.forEach((f, fi) => {
    try {
      const r = read(f.data, f.name, { dateOrder });
      p.files.push({ name: f.name, format: r.format, chats: r.chats });
      r.chats.forEach((c, ci) => chats.push({ key: `${fi}:${ci}`, file: f.name, format: r.format, name: c.name, plan: plan(c, {}, CHATS_DIR) }));
      if (!r.chats.length) errors.push({ file: f.name, error: "文件里没有读到聊天" });
    } catch (e) {
      p.files.push({ name: f.name, error: (e as Error).message, chats: [] });
      errors.push({ file: f.name, error: (e as Error).message });
    }
  });
  pending.set(token, p);
  return { token, chats, errors };
}

/** Re-plan one chat with the user's choice of "me" / display name (preview only). */
export function replan(token: string, key: string, opts: { me?: string; name?: string }) {
  const c = chatOf(token, key);
  return plan(c, opts, CHATS_DIR);
}

function chatOf(token: string, key: string) {
  const p = pending.get(token);
  if (!p) throw new Error("预览已过期，请重新选择文件");
  const [fi, ci] = key.split(":").map(Number);
  const c = p.files[fi]?.chats[ci];
  if (!c) throw new Error("找不到这个聊天");
  return c;
}

export function commit(token: string, choices: { key: string; me?: string; name?: string }[]) {
  const done: { key: string; id: string; name: string; added: number; total: number }[] = [];
  const failed: { key: string; error: string }[] = [];
  for (const ch of choices) {
    try {
      const c = chatOf(token, ch.key);
      const pl = plan(c, { me: ch.me || undefined, name: ch.name || undefined }, CHATS_DIR);
      if (!pl.ok) { failed.push({ key: ch.key, error: pl.error }); continue; }
      const r = write(c, pl, CHATS_DIR);
      done.push({ key: ch.key, id: pl.id, name: pl.name, added: r.added, total: r.total });
    } catch (e) {
      failed.push({ key: ch.key, error: (e as Error).message });
    }
  }
  closeReal();
  writeState(DATA_DIR, { ok: done.length > 0, error: done.length ? null : failed[0]?.error ?? "没有导入", file: "网页导入", sessions: done.map((d) => ({ id: d.id, name: d.name, new: d.added })) });
  if (done.length) pending.delete(token);
  return { done, failed };
}
