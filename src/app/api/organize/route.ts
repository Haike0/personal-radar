import { connection } from "next/server";
import { preview, start, status } from "@/lib/organizer";
import { setSettings } from "@/lib/db";

export async function GET() {
  await connection();
  return Response.json(status());
}

// {action:"start"} · {action:"preview", session} · {action:"auto", on, time}
export async function POST(req: Request) {
  const b = (await req.json()) as { action?: string; session?: string; on?: boolean; time?: string };
  try {
    if (b.action === "start") return Response.json({ ok: true, run: start("manual") });
    if (b.action === "preview" && b.session) return Response.json(preview(b.session));
    if (b.action === "auto") {
      if (b.time && !/^\d{2}:\d{2}$/.test(b.time)) throw new Error("时间格式是 HH:MM");
      setSettings({ ...(b.on !== undefined ? { auto_organize: b.on ? "on" : "off" } : {}), ...(b.time ? { auto_organize_time: b.time } : {}) });
      return Response.json({ ok: true });
    }
    throw new Error("unknown action");
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
