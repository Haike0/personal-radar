import "server-only";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { aiConfig, scrub } from "./ai-config";
import { DATA_DIR } from "./config";
import { getSetting, setSettings, todayStr } from "./db";

// Runs scripts/organize.mjs (the same thing as `npm run organize`) in the background and reports progress.
const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "scripts/organize.mjs");
const BRIDGE = path.join(ROOT, "scripts/radar-ai.mjs");
const RUN = path.join(DATA_DIR, "organize-run.json");
const LOG = path.join(DATA_DIR, "logs/organize-run.log");

type Run = { pid?: number; trigger: string; startedAt: string; finishedAt?: string; exitCode?: number | null };
const readRun = (): Run | null => { try { return JSON.parse(fs.readFileSync(RUN, "utf8")); } catch { return null; } };
const alive = (pid?: number) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const stamp = () => new Date().toLocaleString("sv-SE").slice(0, 16);
const env = () => ({ ...process.env, RADAR_DATA_DIR: DATA_DIR });

export type ChatStatus = { session: string; name: string; remainingTextMessages: number; aiItems: number; analysisAt: string | null };
export function chats(): ChatStatus[] {
  const r = spawnSync(process.execPath, [BRIDGE, "status"], { encoding: "utf8", env: env(), maxBuffer: 8 << 20, timeout: 30_000 });
  if (r.status !== 0) return [];
  try { return JSON.parse(r.stdout).sessions; } catch { return []; }
}

export function status() {
  const run = readRun();
  const running = Boolean(run && !run.finishedAt && alive(run.pid));
  let log: string[] = [];
  try { log = fs.readFileSync(LOG, "utf8").trim().split("\n").slice(-40); } catch {}
  const c = aiConfig();
  return {
    running, run, log, chats: chats(),
    ai: { ready: Boolean(c.key), baseUrl: c.baseUrl, model: c.model },
    auto: { on: getSetting("auto_organize") === "on", time: getSetting("auto_organize_time") || "21:50", last: getSetting("last_auto_organize") || null },
  };
}

export function start(trigger: "manual" | "auto" = "manual") {
  const run = readRun();
  if (run && !run.finishedAt && alive(run.pid)) throw new Error("已经在整理中");
  if (!aiConfig().key) throw new Error("还没有设置 AI 服务");
  fs.mkdirSync(path.dirname(LOG), { recursive: true, mode: 0o700 });
  const out = fs.openSync(LOG, "w", 0o600);
  const child = spawn(process.execPath, [SCRIPT, "--yes"], { cwd: ROOT, env: env(), stdio: ["ignore", out, out], detached: true });
  fs.closeSync(out);
  const r: Run = { pid: child.pid, trigger, startedAt: stamp() };
  fs.writeFileSync(RUN, JSON.stringify(r), { mode: 0o600 });
  child.on("exit", (code) => fs.writeFileSync(RUN, JSON.stringify({ ...r, finishedAt: stamp(), exitCode: code }), { mode: 0o600 }));
  child.unref();
  return r;
}

/** The first part of what organizing would send for one chat, after redaction — nothing is sent. */
export function preview(session: string) {
  const r = spawnSync(process.execPath, [BRIDGE, "next", "--session", session, "--max", "80", "--resume"], { encoding: "utf8", env: env(), maxBuffer: 16 << 20, timeout: 30_000 });
  try { fs.rmSync(path.join(DATA_DIR, "ai-chunks", `${session}.json`), { force: true }); } catch {}
  if (r.status !== 0) throw new Error(r.stderr.trim() || "读取失败");
  const raw = r.stdout;
  const text = scrub(raw);
  return { text: text.split("\n").slice(0, 60).join("\n"), changed: text !== raw };
}

/** Called every minute by the scheduler: run once a day after the chosen time. */
export async function maybeAuto(syncChatLab: () => Promise<unknown>) {
  if (getSetting("auto_organize") !== "on") return null;
  const now = new Date(), today = todayStr();
  const [h, m] = (getSetting("auto_organize_time") || "21:50").split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m || getSetting("last_auto_organize") === today) return null;
  setSettings({ last_auto_organize: today });
  try { await syncChatLab(); } catch { /* ChatLab not running: organize what is already here */ }
  try { return start("auto"); } catch (e) { return { error: (e as Error).message }; }
}
