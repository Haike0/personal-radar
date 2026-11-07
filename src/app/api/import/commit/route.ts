import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { getSetting, setSettings } from "@/lib/db";
import { commit } from "@/lib/importer";

export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  try {
    const b = (await req.json()) as { token: string; choices: { key: string; me?: string; name?: string }[] };
    const r = commit(b.token, b.choices ?? []);
    // importing your own chats means you want to see them: leave the demo
    if (r.done.length && getSetting("mode") === "demo") setSettings({ mode: "real" });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
