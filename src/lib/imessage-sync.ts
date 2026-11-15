import "server-only";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { getSetting, nowStr, setSettings } from "./db";
import { plan, write, writeState } from "../../scripts/lib/import-core.mjs";
import { inspect, read } from "../../scripts/lib/imessage.mjs";

// 信息（iMessage / 短信）on this Mac: read-only, new messages by ROWID (which only grows), duplicates skipped by guid.

export function status() {
  return { on: getSetting("imessage_on") === "on", groups: getSetting("imessage_groups") === "on", oneWay: getSetting("imessage_oneway") === "on",
    last: getSetting("imessage_last") || null, result: getSetting("imessage_result") || null, found: inspect(), runner: process.execPath, platform: process.platform };
}

let running = false;
/** `full`: read everything again (after changing which chats are included); duplicates are still skipped. */
export function sync(full = false) {
  if (running) return { ok: false, error: "正在同步" };
  running = true;
  try {
    const after = full ? 0 : Number(getSetting("imessage_mark") || 0);
    const r = read({ after, groups: getSetting("imessage_groups") === "on", oneWay: getSetting("imessage_oneway") === "on" });
    if (r.error) { setSettings({ imessage_last: nowStr(), imessage_result: `出错：${r.error}` }); return { ok: false, error: r.error, noAccess: !!r.noAccess }; }
    let added = 0;
    const sessions: { id: string; name: string; new: number }[] = [];
    for (const c of r.chats) {
      const p = plan(c, { id: c.id, me: "me", name: c.name ?? undefined }, CHATS_DIR);
      if (!p.ok) continue;
      const w = write(c, p, CHATS_DIR);
      if (w.added) { added += w.added; sessions.push({ id: p.id, name: p.name, new: w.added }); }
    }
    closeReal();
    const result = added ? `新增 ${added} 条（${sessions.length} 个聊天）` : "没有新消息";
    setSettings({ imessage_mark: String(r.max), imessage_last: nowStr(), imessage_result: result });
    if (added) writeState(DATA_DIR, { ok: true, file: "信息（iMessage）", sessions });
    return { ok: true, added, chats: sessions.length };
  } finally { running = false; }
}
