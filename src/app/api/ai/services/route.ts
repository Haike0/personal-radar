import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { connection } from "next/server";
import { db, nowStr, setSettings } from "@/lib/db";
import { choice, deleteKey, keyOf, PRESETS, roleSetting, saveServices, services, setKey, type Role, type Service } from "@/lib/ai/model";

// Model services for AI 设置. Keys go straight into keys.json in the data folder; this route only ever answers
// "has a key: yes/no", and the key is never written to radar.db.

/** This month's usage. The price is DeepSeek's peak price (an upper bound), so for other services only calls/tokens count. */
function usage() {
  try {
    const r = db().prepare("SELECT COUNT(*) n, SUM(prompt) p, SUM(cache_hit) h, SUM(completion) c FROM ai_calls WHERE substr(at,1,7)=?")
      .get(nowStr().slice(0, 7)) as { n: number; p: number | null; h: number | null; c: number | null };
    const p = r.p ?? 0, h = r.h ?? 0, c = r.c ?? 0;
    return { calls: r.n, tokens: p + c, usd: ((p - h) * 0.3 + h * 0.006 + c * 1.2) / 1e6 };
  } catch { return { calls: 0, tokens: 0, usd: 0 }; }
}

export async function GET() {
  await connection();
  const list = services().map((s) => ({ ...s, hasKey: Boolean(keyOf(s.id)) }));
  return Response.json({ services: list, presets: PRESETS, chat: choice("chat"), fast: choice("fast"), usage: usage() });
}

/**
 * Add or edit a service: {id?, name, baseUrl, models[], key?, use?: ["chat","fast"]}.
 * `use` also makes it the model for those roles (the quick setup does this) and turns real AI on.
 */
export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  const b = (await req.json()) as Partial<Service> & { key?: string; use?: Role[] };
  const list = services();
  const old = b.id ? list.find((s) => s.id === b.id) : undefined;
  if (old?.fromEnv) return Response.json({ error: "这个服务来自 .env.local，要改请编辑那个文件" }, { status: 400 });
  const name = String(b.name ?? old?.name ?? "").trim().slice(0, 40), baseUrl = String(b.baseUrl ?? old?.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!name || !/^https?:\/\/[^\s]+$/.test(baseUrl)) return Response.json({ error: "名称和接口地址都要填，地址以 http:// 或 https:// 开头" }, { status: 400 });
  const models = [...new Set((b.models ?? old?.models ?? []).map((m) => String(m).trim()).filter(Boolean))].slice(0, 12);
  const id = old ? old.id : `s${Date.now().toString(36)}`;
  if (!old?.builtin) saveServices([...list.filter((s) => s.id !== id), { id, name, baseUrl, models }]);
  if (b.key?.trim()) setKey(id, b.key.trim());
  const model = models[0] ?? old?.models[0];
  if (b.use?.length && model) {
    const patch: Record<string, string> = { ai_provider: "deepseek" };
    for (const role of b.use) patch[roleSetting(role)] = `${id}|${model}`;
    setSettings(patch);
  }
  return Response.json({ ok: true, id });
}

export async function DELETE(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const s = services().find((x) => x.id === id);
  if (!s) return Response.json({ error: "没有这个服务" }, { status: 404 });
  if (s.builtin) {
    // built-in services stay in the list; only their saved key can be removed
    if (!s.fromEnv) deleteKey(id);
    return Response.json({ ok: true });
  }
  saveServices(services().filter((x) => x.id !== id));
  deleteKey(id);
  // anything that pointed at it goes back to the default
  for (const role of ["chat", "fast"] as const) if (choice(role).serviceId === id) setSettings({ [roleSetting(role)]: "" });
  return Response.json({ ok: true });
}
