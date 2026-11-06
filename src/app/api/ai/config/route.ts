import { connection } from "next/server";
import { AI_PRESETS, aiConfig } from "@/lib/ai-config";
import { getSetting, setSettings } from "@/lib/db";

export async function GET() {
  await connection();
  const c = aiConfig();
  const saved = getSetting("ai_key");
  return Response.json({
    presets: AI_PRESETS, preset: getSetting("ai_preset") || "deepseek", baseUrl: c.baseUrl, model: c.model,
    hasKey: Boolean(c.key), keyHint: saved ? `…${saved.slice(-4)}` : c.fromEnv ? "来自 .env.local" : "", fromEnv: c.fromEnv,
    enabled: getSetting("ai_provider") === "deepseek",
  });
}

/** Save the AI service. The key is stored only in the local database (file mode 600) and never sent back to the browser. */
export async function PATCH(req: Request) {
  const b = (await req.json()) as { preset?: string; baseUrl?: string; model?: string; key?: string; enabled?: boolean };
  const patch: Record<string, string> = {};
  if (b.preset) patch.ai_preset = String(b.preset);
  if (b.baseUrl !== undefined) {
    const u = String(b.baseUrl).trim().replace(/\/+$/, "");
    if (u && !/^https?:\/\/\S+$/.test(u)) return Response.json({ error: "服务地址要以 http:// 或 https:// 开头" }, { status: 400 });
    patch.ai_base_url = u;
  }
  if (b.model !== undefined) patch.ai_model = String(b.model).trim();
  if (b.key) patch.ai_key = String(b.key).trim();
  if (b.enabled !== undefined) patch.ai_provider = b.enabled ? "deepseek" : "mock";
  setSettings(patch);
  return Response.json({ ok: true });
}

export async function DELETE() {
  setSettings({ ai_key: "", ai_provider: "mock" });
  return Response.json({ ok: true });
}
