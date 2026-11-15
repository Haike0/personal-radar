import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as beeper from "./beeper-api";
import * as chatlabApi from "./chatlab-api";
import * as pull from "./pull-api";
import { CHATS_DIR, DATA_DIR } from "./config";
import { closeReal } from "./chatlab";
import { db, getSetting, nowStr, setSettings } from "./db";
import { plan, read, write, writeState } from "../../scripts/lib/import-core.mjs";

// Two ways chats come in by themselves, so nobody has to drag files every week:
//  1. connected platforms (Beeper, ChatLab, Pull sources) are synced every N hours;
//  2. a folder is watched: point an exporter (or a phone's "save to Files") at it,
//     and every new export dropped there is imported. Files are read, never moved or changed.

export const expand = (p: string) => (p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);
export const defaultWatchDir = () => path.join(os.homedir(), "Documents", "Radar 导入");

type Seen = { file: string; size: number; mtime: number; at: string; result: string; ok: boolean };
function table() {
  db().exec("CREATE TABLE IF NOT EXISTS watch_seen(file TEXT NOT NULL, size INTEGER NOT NULL, mtime INTEGER NOT NULL, at TEXT NOT NULL, result TEXT, ok INTEGER, PRIMARY KEY(file, size, mtime))");
  return db();
}
export function recent(limit = 8): Seen[] {
  return (table().prepare("SELECT * FROM watch_seen ORDER BY at DESC LIMIT ?").all(limit) as Record<string, unknown>[])
    .map((r) => ({ file: String(r.file), size: Number(r.size), mtime: Number(r.mtime), at: String(r.at), result: String(r.result ?? ""), ok: Boolean(r.ok) }));
}

/** Import every export file in the watched folder that hasn't been seen with this size and modification time. */
export function scanFolder() {
  const dir = expand(getSetting("watch_dir") || defaultWatchDir());
  if (!fs.existsSync(dir)) return { dir, scanned: 0, imported: 0, error: "文件夹不存在" };
  const d = table();
  const seen = d.prepare("SELECT 1 FROM watch_seen WHERE file=? AND size=? AND mtime=?");
  const mark = d.prepare("INSERT OR REPLACE INTO watch_seen(file,size,mtime,at,result,ok) VALUES(?,?,?,?,?,?)");
  let scanned = 0, imported = 0;
  const done: { id: string; name: string; new: number }[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(txt|json|jsonl|zip)$/i.test(name) || name.startsWith(".")) continue;
    const file = path.join(dir, name);
    const st = fs.statSync(file);
    if (!st.isFile() || Date.now() - st.mtimeMs < 10_000) continue; // still being written
    if (seen.get(file, st.size, Math.floor(st.mtimeMs))) continue;
    scanned++;
    let result = "", ok = false;
    try {
      const { chats } = read(fs.readFileSync(file), name);
      const parts: string[] = [];
      for (const chat of chats) {
        const p = plan(chat, {}, CHATS_DIR);
        if (!p.ok) { parts.push(`${chat.name ?? name}：${p.error}（到「聊天软件」里拖进来选一下）`); continue; }
        const r = write(chat, p, CHATS_DIR);
        done.push({ id: p.id, name: p.name, new: r.added });
        parts.push(`${p.name} 新增 ${r.added} 条`);
        ok = true; imported++;
      }
      result = parts.join("；") || "没有读到聊天";
    } catch (e) { result = (e as Error).message; }
    mark.run(file, st.size, Math.floor(st.mtimeMs), nowStr(), result, ok ? 1 : 0);
  }
  if (done.length) { closeReal(); writeState(DATA_DIR, { ok: true, file: "自动导入文件夹", sessions: done }); }
  setSettings({ watch_last: nowStr() });
  return { dir, scanned, imported };
}

/** Pull new messages from every connected platform. */
export async function syncHubs() {
  const res: Record<string, number> = {};
  for (const [name, mod] of [["Beeper", beeper], ["ChatLab", chatlabApi], ["Pull", pull]] as const) {
    if (!mod.selected().length) continue;
    try { res[name] = (await mod.sync()).reduce((a, x) => a + x.added, 0); } catch { res[name] = -1; }
  }
  setSettings({ hub_sync_last: nowStr() });
  return res;
}

let lastFolderScan = 0, lastWechat = 0, lastImessage = 0, lastWhatsapp = 0, lastTelegram = 0;
/** Called every minute by the scheduler. */
export async function autoTick() {
  const out: Record<string, unknown> = {};
  if (getSetting("watch_on") === "on" && Date.now() - lastFolderScan > 5 * 60e3) { lastFolderScan = Date.now(); out.folder = scanFolder(); }
  if (getSetting("wechat_on") === "on" && Date.now() - lastWechat > 5 * 60e3) {
    lastWechat = Date.now();
    const { sync } = await import("./wechat-sync"); // lazy: avoids a circular import
    out.wechat = sync();
  }
  if (getSetting("imessage_on") === "on" && Date.now() - lastImessage > 5 * 60e3) {
    lastImessage = Date.now();
    out.imessage = (await import("./imessage-sync")).sync();
  }
  if (getSetting("whatsapp_on") === "on" && Date.now() - lastWhatsapp > 5 * 60e3) {
    lastWhatsapp = Date.now();
    out.whatsapp = (await import("./whatsapp-sync")).sync();
  }
  // Telegram: a live listener brings new messages in as they arrive; an hourly catch-up covers time Radar was off
  if (getSetting("tg_on") === "on" && Date.now() - lastTelegram > 60 * 60e3) {
    lastTelegram = Date.now();
    const tg = await import("./telegram");
    out.telegram = await tg.sync().catch((e: Error) => ({ ok: false, error: e.message }));
    await tg.startLive().catch(() => false);
  }
  const hours = Number(getSetting("hub_sync") || 0);
  const last = Date.parse((getSetting("hub_sync_last") || "1970-01-01").replace(" ", "T"));
  if (hours > 0 && Date.now() - last > hours * 3600e3) out.hubs = await syncHubs();
  return out;
}
