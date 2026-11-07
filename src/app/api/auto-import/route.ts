import fs from "node:fs";
import { connection } from "next/server";
import { defaultWatchDir, expand, recent, scanFolder, syncHubs } from "@/lib/auto-import";
import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { getSetting, setSettings } from "@/lib/db";

export async function GET() {
  await connection();
  const dir = getSetting("watch_dir") || defaultWatchDir();
  return Response.json({
    watch: { on: getSetting("watch_on") === "on", dir, exists: fs.existsSync(expand(dir)), last: getSetting("watch_last") || null, recent: recent() },
    hubs: { every: Number(getSetting("hub_sync") || 0), last: getSetting("hub_sync_last") || null },
  });
}

// {watch_on, watch_dir, hub_sync} · {action:"mkdir"} · {action:"scan"} · {action:"sync"}
export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  const b = (await req.json()) as { watch_on?: boolean; watch_dir?: string; hub_sync?: number; action?: string };
  try {
    if (b.action === "mkdir") { fs.mkdirSync(expand(getSetting("watch_dir") || defaultWatchDir()), { recursive: true }); return Response.json({ ok: true }); }
    if (b.action === "scan") return Response.json(scanFolder());
    if (b.action === "sync") return Response.json(await syncHubs());
    setSettings({
      ...(b.watch_on !== undefined ? { watch_on: b.watch_on ? "on" : "off" } : {}),
      ...(b.watch_dir !== undefined ? { watch_dir: b.watch_dir.trim() } : {}),
      ...(b.hub_sync !== undefined ? { hub_sync: String(b.hub_sync) } : {}),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
