import { connection } from "next/server";
import { db, getSettings, nowStr, setDemoSet, setSettings } from "@/lib/db";
import { deepseekKey } from "@/lib/ai/deepseek";
import { syncStatus } from "@/lib/sync";

const SECRET = ["bark_key", "bark_encrypt_key", "ai_key", "chatlab_api_token"];

export async function GET() {
  await connection();
  const s = getSettings();
  for (const k of SECRET) s[k] = s[k] ? "已设置" : "";
  return Response.json({ settings: s, sync: syncStatus(), deepseekKey: Boolean(await deepseekKey()), aiUsage: usage() });
}

/** This month's DeepSeek usage. Cost uses the peak price (upper bound): input $0.3/M, cache hit $0.006/M, output $1.2/M. */
function usage() {
  try {
    const r = db().prepare("SELECT COUNT(*) n, SUM(prompt) p, SUM(cache_hit) h, SUM(completion) c FROM ai_calls WHERE substr(at,1,7)=?")
      .get(nowStr().slice(0, 7)) as { n: number; p: number | null; h: number | null; c: number | null };
    const p = r.p ?? 0, h = r.h ?? 0, c = r.c ?? 0;
    return { calls: r.n, usd: ((p - h) * 0.3 + h * 0.006 + c * 1.2) / 1e6 };
  } catch {
    return { calls: 0, usd: 0 };
  }
}

export async function PATCH(req: Request) {
  const patch = await req.json();
  for (const k of SECRET) if (patch[k] === "已设置") delete patch[k];
  const prevSet = getSettings().demo_set;
  setSettings(patch);
  if ((patch.demo_set === "life" || patch.demo_set === "night") && patch.demo_set !== prevSet) setDemoSet(patch.demo_set);
  return Response.json({ ok: true });
}
