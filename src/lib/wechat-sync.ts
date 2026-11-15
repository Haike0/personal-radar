import "server-only";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { expand } from "./auto-import";
import { getSetting, nowStr, setSettings } from "./db";
import { plan, write, writeState } from "../../scripts/lib/import-core.mjs";
import { inspect, read } from "../../scripts/lib/wechat-db.mjs";

// 微信（已解密的数据库）: the user points ReadMe at a folder of WeChat databases they already decrypted with other tools.
// ReadMe opens them read-only and copies new messages every few minutes. Which messages are new is decided by the
// message's own id (duplicates are skipped), with a one-day look-back from the last message seen in each chat, so a
// file whose modified time didn't change is still read. Nothing about people (wxid, names, text) goes into logs.

const marks = (): Record<string, number> => { try { return JSON.parse(getSetting("wechat_marks") || "{}"); } catch { return {}; } };
export const dir = () => expand(getSetting("wechat_dir").trim());

export function status() {
  const d = dir();
  return { dir: getSetting("wechat_dir"), on: getSetting("wechat_on") === "on", groups: getSetting("wechat_groups") === "on",
    last: getSetting("wechat_last") || null, result: getSetting("wechat_result") || null, found: d ? inspect(d) : null };
}

let running = false;
export function sync() {
  const d = dir();
  if (!d) return { ok: false, error: "还没选文件夹" };
  if (running) return { ok: false, error: "正在同步" };
  running = true;
  try {
    const m = marks();
    const since = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.max(0, v - 86400)]));
    const r = read(d, { since, groups: getSetting("wechat_groups") === "on" });
    let added = 0, chats = 0;
    const sessions: { id: string; name: string; new: number }[] = [];
    for (const c of r.chats) {
      const p = plan(c, { id: c.id, me: r.me, name: c.name ?? undefined }, CHATS_DIR);
      if (!p.ok) continue;
      const w = write(c, p, CHATS_DIR);
      m[c.id] = Math.max(m[c.id] ?? 0, ...c.messages.map((x) => x.ts));
      if (w.added) { added += w.added; chats++; sessions.push({ id: p.id, name: p.name, new: w.added }); }
    }
    closeReal();
    const result = added ? `新增 ${added} 条（${chats} 个聊天）` : "没有新消息";
    setSettings({ wechat_marks: JSON.stringify(m), wechat_last: nowStr(), wechat_result: result });
    if (added) writeState(DATA_DIR, { ok: true, file: "微信", sessions });
    return { ok: true, added, chats };
  } catch (e) {
    const error = (e as Error).message.replace(/wxid_[\w-]+/g, "…");
    setSettings({ wechat_last: nowStr(), wechat_result: `出错：${error}` });
    return { ok: false, error };
  } finally { running = false; }
}
