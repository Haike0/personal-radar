import { connection } from "next/server";
import { setSettings } from "@/lib/db";
import { inspect } from "../../../../scripts/lib/wechat-db.mjs";
import { expand } from "@/lib/auto-import";
import { status, sync } from "@/lib/wechat-sync";

export async function GET() {
  await connection();
  try { return Response.json(status()); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}

/** body: { action: "check", dir } | { action: "save", dir?, on?, groups? } | { action: "sync" } */
export async function POST(req: Request) {
  const b = (await req.json()) as { action: string; dir?: string; on?: boolean; groups?: boolean };
  try {
    if (b.action === "check") return Response.json(inspect(expand(String(b.dir ?? "").trim())));
    if (b.action === "save") {
      setSettings({ ...(b.dir !== undefined ? { wechat_dir: String(b.dir).trim() } : {}), ...(b.on !== undefined ? { wechat_on: b.on ? "on" : "off" } : {}), ...(b.groups !== undefined ? { wechat_groups: b.groups ? "on" : "off" } : {}) });
      return Response.json(status());
    }
    if (b.action === "sync") return Response.json(sync());
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  return Response.json({ error: "action" }, { status: 400 });
}
