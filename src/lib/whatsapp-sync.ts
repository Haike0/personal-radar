import "server-only";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { getSetting, nowStr, setSettings } from "./db";
import { plan, write, writeState } from "../../scripts/lib/import-core.mjs";
import { find, inspect, read } from "../../scripts/lib/whatsapp-mac.mjs";

// WhatsApp Desktop on this Mac: read-only, new rows by Z_PK, duplicates skipped by the message's stanza id.

export function status() {
  const file = find();
  return { on: getSetting("whatsapp_on") === "on", groups: getSetting("whatsapp_groups") === "on", last: getSetting("whatsapp_last") || null,
    result: getSetting("whatsapp_result") || null, installed: !!file, found: inspect(file), runner: process.execPath, platform: process.platform };
}

let running = false;
export function sync(full = false) {
  if (running) return { ok: false, error: "正在同步" };
  running = true;
  try {
    const r = read({ after: full ? 0 : Number(getSetting("whatsapp_mark") || 0), groups: getSetting("whatsapp_groups") === "on" });
    if (r.error) { setSettings({ whatsapp_last: nowStr(), whatsapp_result: `出错：${r.error}` }); return { ok: false, error: r.error, noAccess: !!r.noAccess }; }
    let added = 0;
    const sessions: { id: string; name: string; new: number }[] = [];
    for (const c of r.chats) {
      const p = plan(c, { id: c.id, me: "me", name: c.name ?? undefined }, CHATS_DIR);
      if (!p.ok) continue;
      const w = write(c, p, CHATS_DIR);
      if (w.added) { added += w.added; sessions.push({ id: p.id, name: p.name, new: w.added }); }
    }
    closeReal();
    setSettings({ whatsapp_mark: String(r.max), whatsapp_last: nowStr(), whatsapp_result: added ? `新增 ${added} 条（${sessions.length} 个聊天）` : "没有新消息" });
    if (added) writeState(DATA_DIR, { ok: true, file: "WhatsApp 电脑版", sessions });
    return { ok: true, added, chats: sessions.length };
  } finally { running = false; }
}
