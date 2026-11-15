import "server-only";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { scrub } from "./ai-config";
import { mask, modelLabel, resolve } from "./ai/model";
import { DATA_DIR } from "./config";
import { db, getSetting, nowStr } from "./db";

// 整理: turns new chat messages into records. One runner for both the 「立即整理」 button and the schedule in 设置.
// It runs scripts/organize.mjs (the same thing as `npm run organize`), which reads the list of chats from the data
// folder and uses the 整理模型 chosen in AI 设置. Only one run at a time; a run that stopped without finishing
// (computer asleep, server restarted) is marked failed after 30 minutes and simply continues next time.

export interface Run { id: number; trigger: "manual" | "auto"; startedAt: string; finishedAt: string | null; ok: boolean | null; added: number; note: string | null }
export type ChatStatus = { session: string; name: string; remainingTextMessages: number; aiItems: number; analysisAt: string | null };
export interface OrganizeStatus {
  running: Run | null; last: Run | null; recent: Run[]; log: string[];
  auto: boolean; times: string[]; next: string | null;
  model: string; ready: boolean; chats: ChatStatus[];
}

const ROOT = process.env.RADAR_ROOT ?? process.cwd(); // the launcher passes the package folder (the server may run from .next/standalone)
const SCRIPT = path.join(ROOT, "scripts/organize.mjs");
const BRIDGE = path.join(ROOT, "scripts/radar-ai.mjs");
const STALE_MIN = 30;
const env = () => ({ ...process.env, RADAR_DATA_DIR: DATA_DIR });

function table() {
  const d = db();
  d.exec(`CREATE TABLE IF NOT EXISTS organize_runs(id INTEGER PRIMARY KEY, trigger TEXT NOT NULL, started_at TEXT NOT NULL,
    finished_at TEXT, ok INTEGER, added INTEGER NOT NULL DEFAULT 0, note TEXT, log TEXT)`);
  return d;
}
type Row = Record<string, unknown>;
const toRun = (r: Row): Run => ({ id: Number(r.id), trigger: r.trigger === "auto" ? "auto" : "manual", startedAt: String(r.started_at), finishedAt: r.finished_at ? String(r.finished_at) : null,
  ok: r.ok == null ? null : Boolean(r.ok), added: Number(r.added ?? 0), note: r.note ? String(r.note) : null });
const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const age = (ts: string) => (Date.parse(nowStr().replace(" ", "T")) - Date.parse(ts.replace(" ", "T"))) / 60000;

export function times(): string[] {
  return [...new Set(getSetting("organize_times").split(",").map((t) => t.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)))].sort();
}

function runningRow(): Row | null {
  const d = table();
  const r = d.prepare("SELECT * FROM organize_runs WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1").get() as Row | undefined;
  if (!r) return null;
  if (age(String(r.started_at)) > STALE_MIN) {
    d.prepare("UPDATE organize_runs SET finished_at=?, ok=0, note=? WHERE id=?").run(nowStr(), "中途停了（电脑睡眠或重启），下次会从断开的地方接着整理", r.id as number);
    return null;
  }
  return r;
}

function nextSlot(): string | null {
  if (getSetting("organize_auto") !== "on") return null;
  const ts = times();
  if (!ts.length) return null;
  const now = nowStr().slice(11, 16);
  const t = ts.find((x) => x > now);
  return t ? `今天 ${t}` : `明天 ${ts[0]}`;
}

/** Private chats the organizer can see, read from the data folder by radar-ai.mjs (no session ids are hard-coded). */
export function chats(): ChatStatus[] {
  const r = spawnSync(process.execPath, [BRIDGE, "status"], { encoding: "utf8", env: env(), maxBuffer: 8 << 20, timeout: 30_000 });
  if (r.status !== 0) return [];
  try { return JSON.parse(r.stdout).sessions; } catch { return []; }
}

export function status(): OrganizeStatus {
  const d = table();
  const cur = runningRow();
  const recent = (d.prepare("SELECT * FROM organize_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 6").all() as Row[]).map(toRun);
  // the live log while running; afterwards the last run's log, so a failure can be read
  const logOf = cur ?? (d.prepare("SELECT log FROM organize_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1").get() as Row | undefined);
  const log = String(logOf?.log ?? "").split("\n").filter(Boolean).slice(-40);
  const r = resolve("fast");
  return {
    running: cur ? toRun(cur) : null, last: recent[0] ?? null, recent, log,
    auto: getSetting("organize_auto") === "on", times: times(), next: nextSlot(),
    model: modelLabel(r), ready: Boolean(r.key), chats: chats(),
  };
}

/** Start a run in the background. Returns at once; poll status() for progress and the result. */
export function start(trigger: "manual" | "auto"): { started: boolean; reason?: string } {
  if (runningRow()) return { started: false, reason: "已经在整理了" };
  const r = resolve("fast");
  if (!r.key) return { started: false, reason: `还没有 ${r.service.name} 的密钥，到「设置 → AI 设置」里填上` };
  const d = table();
  const id = Number(d.prepare("INSERT INTO organize_runs(trigger, started_at, log) VALUES(?,?,'')").run(trigger, nowStr()).lastInsertRowid);
  // organize.mjs resolves the same service and key from the data folder itself; nothing secret is passed along
  const child = spawn(process.execPath, [SCRIPT, "--yes"], { cwd: ROOT, env: env(), stdio: ["ignore", "pipe", "pipe"] });
  const clean = (s: string) => mask(s, r.key);
  let out = "", saved = 0;
  const lines = () => out.split("\n").map((l) => l.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /, "").trim()).filter(Boolean);
  const flush = () => {
    if (Date.now() - saved < 1000) return;
    saved = Date.now();
    try { table().prepare("UPDATE organize_runs SET log=? WHERE id=?").run(clean(lines().join("\n")).slice(-6000), id); } catch {}
  };
  const onData = (b: Buffer) => { out += b; flush(); };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => {
    const ls = lines();
    const added = ls.reduce((n, l) => n + Number(l.match(/新增 (\d+)/)?.[1] ?? 0), 0);
    const failed = code !== 0 || ls.some((l) => /没整理成功|failed|error/i.test(l));
    const note = failed
      ? clean(ls.find((l) => /error|failed|没整理成功|HTTP/i.test(l)) ?? `退出码 ${code}`).slice(0, 200)
      : added ? null : "没有需要记下的新内容";
    table().prepare("UPDATE organize_runs SET finished_at=?, ok=?, added=?, note=?, log=? WHERE id=?")
      .run(nowStr(), failed ? 0 : 1, added, note, clean(ls.join("\n")).slice(-6000), id);
  });
  child.on("error", (e) => {
    table().prepare("UPDATE organize_runs SET finished_at=?, ok=0, note=? WHERE id=?").run(nowStr(), clean(e.message).slice(0, 200), id);
  });
  return { started: true };
}

/**
 * Called every minute by the in-process scheduler: start a run if a scheduled time has passed and nothing started since.
 * Only catches up within 3 hours of a missed time (e.g. the computer was asleep), never at a random time much later.
 * `before` runs first (pull new messages from ChatLab, if connected).
 */
let starting = false; // a ChatLab sync can outlast a minute; don't let the next tick start a second run meanwhile
export async function tick(before?: () => Promise<unknown>) {
  if (starting || getSetting("organize_auto") !== "on" || runningRow()) return null;
  const now = nowStr(), hm = now.slice(11, 16);
  const slot = times().filter((t) => t <= hm && minutes(hm) - minutes(t) <= 180).at(-1);
  if (!slot) return null;
  if (table().prepare("SELECT 1 FROM organize_runs WHERE started_at >= ? LIMIT 1").get(`${now.slice(0, 10)} ${slot}`)) return null;
  if (!resolve("fast").key) return null; // nothing to run with; the settings page already says a key is missing
  starting = true;
  try {
    if (before) try { await before(); } catch { /* ChatLab not running: organize what is already here */ }
    return start("auto");
  } finally { starting = false; }
}

/** The first part of what organizing would send for one chat, after redaction. Nothing is sent. */
export function preview(session: string) {
  if (!chats().some((c) => c.session === session)) throw new Error("没有这个聊天");
  const r = spawnSync(process.execPath, [BRIDGE, "next", "--session", session, "--max", "80", "--resume"], { encoding: "utf8", env: env(), maxBuffer: 16 << 20, timeout: 30_000 });
  try { fs.rmSync(path.join(DATA_DIR, "ai-chunks", `${session}.json`), { force: true }); } catch {}
  if (r.status !== 0) throw new Error(r.stderr.trim() || "读取失败");
  const raw = r.stdout;
  const text = scrub(raw);
  return { text: text.split("\n").slice(0, 60).join("\n"), changed: text !== raw };
}
