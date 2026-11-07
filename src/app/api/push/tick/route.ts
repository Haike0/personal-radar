import { tick } from "@/lib/notifier";
import { tick as organizeTick } from "@/lib/organizer";
import * as chatlabApi from "@/lib/chatlab-api";
import * as beeperApi from "@/lib/beeper-api";
import { autoTick } from "@/lib/auto-import";

// before a scheduled run, pull new messages from connected apps (errors are ignored: organize what is already here)
const pullConnected = async () => {
  if (chatlabApi.selected().length) await chatlabApi.sync().catch(() => null);
  if (beeperApi.selected().length) await beeperApi.sync().catch(() => null);
};

// Called every minute by the in-process scheduler (src/instrumentation.ts). Requests through Tailscale Serve also come
// from 127.0.0.1, so the address can't tell them apart: a per-process random token is required instead.
export async function POST(req: Request) {
  const token = (globalThis as { __radarTickToken?: string }).__radarTickToken;
  if (!token || req.headers.get("x-radar-tick") !== token) return Response.json({ error: "forbidden" }, { status: 403 });
  // scheduled 整理 rides on the same minute tick; its failures are recorded in organize_runs and never block reminders
  // automatic import (watched folder, connected platforms) — never blocks reminders
  try { await autoTick(); } catch (e) { console.warn(`[auto-import] ${(e as Error).message}`); }
  let auto = null;
  try { auto = await organizeTick(pullConnected); }
  catch (e) { console.warn(`[organize] tick error: ${(e as Error).message}`); }
  try {
    return Response.json({ ...(await tick()), ...(auto ? { autoOrganize: auto } : {}) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
