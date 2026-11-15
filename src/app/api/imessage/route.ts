import { connection } from "next/server";
import { setSettings } from "@/lib/db";
import { status, sync } from "@/lib/imessage-sync";

export async function GET() {
  await connection();
  return Response.json(status());
}

/** body: { action: "save", on?, groups?, oneWay? } | { action: "sync" } */
export async function POST(req: Request) {
  const b = (await req.json()) as { action: string; on?: boolean; groups?: boolean; oneWay?: boolean };
  if (b.action === "save") {
    const widen = b.groups === true || b.oneWay === true;
    setSettings({ ...(b.on !== undefined ? { imessage_on: b.on ? "on" : "off" } : {}), ...(b.groups !== undefined ? { imessage_groups: b.groups ? "on" : "off" } : {}), ...(b.oneWay !== undefined ? { imessage_oneway: b.oneWay ? "on" : "off" } : {}) });
    if (widen) sync(true); // newly included chats need their older messages too
    return Response.json(status());
  }
  if (b.action === "sync") return Response.json(sync());
  return Response.json({ error: "action" }, { status: 400 });
}
