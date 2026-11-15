import { connection } from "next/server";
import { setSettings } from "@/lib/db";
import { status, sync } from "@/lib/whatsapp-sync";

export async function GET() {
  await connection();
  return Response.json(status());
}

/** body: { action: "save", on?, groups? } | { action: "sync" } */
export async function POST(req: Request) {
  const b = (await req.json()) as { action: string; on?: boolean; groups?: boolean };
  if (b.action === "save") {
    setSettings({ ...(b.on !== undefined ? { whatsapp_on: b.on ? "on" : "off" } : {}), ...(b.groups !== undefined ? { whatsapp_groups: b.groups ? "on" : "off" } : {}) });
    if (b.groups === true) sync(true);
    return Response.json(status());
  }
  if (b.action === "sync") return Response.json(sync());
  return Response.json({ error: "action" }, { status: 400 });
}
