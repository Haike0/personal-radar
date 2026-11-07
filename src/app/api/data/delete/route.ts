import fs from "node:fs";
import path from "node:path";
import { closeDemo, closeReal } from "@/lib/chatlab";
import { DATA_DIR, DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { closeDb } from "@/lib/db";

// "Delete everything": removes only files Radar created inside its data folder, never anything else there,
// and never touches ChatLab / Beeper or the original export files. Cannot be undone.
const OURS = ["radar.db", "radar.db-wal", "radar.db-shm", "keys.json", "voice-transcripts.db", "vapid.json", "import-state.json", "organize-run.json", "chats", "demo-chats", "ai-chunks", "logs"];

export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== "删除") return Response.json({ error: "请输入「删除」确认" }, { status: 400 });
  closeDb(); closeReal(); closeDemo();
  const removed: string[] = [];
  for (const name of OURS) {
    const p = path.join(DATA_DIR, name);
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); removed.push(name); }
  }
  return Response.json({ ok: true, removed });
}
