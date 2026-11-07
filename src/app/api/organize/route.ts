import { connection } from "next/server";
import { setSettings } from "@/lib/db";
import { preview, start, status } from "@/lib/organizer";

export async function GET() {
  await connection();
  return Response.json(status());
}

// {action:"start"} = 立即整理 · {action:"preview", session} · {action:"schedule", auto?, times?}
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; session?: string; auto?: boolean; times?: string[] };
  try {
    if (!b.action || b.action === "start") {
      const r = start("manual");
      return r.started ? Response.json(r) : Response.json({ error: r.reason }, { status: 409 });
    }
    if (b.action === "preview" && b.session) return Response.json(preview(b.session));
    if (b.action === "schedule") {
      const patch: Record<string, string> = {};
      if (b.auto !== undefined) patch.organize_auto = b.auto ? "on" : "off";
      if (b.times) {
        const ts = [...new Set(b.times.map((t) => String(t).trim()))].sort();
        if (ts.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error("时间格式是 HH:MM");
        if (ts.length > 6) throw new Error("最多 6 个时间");
        patch.organize_times = ts.join(",");
      }
      setSettings(patch);
      return Response.json({ ok: true });
    }
    throw new Error("unknown action");
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
