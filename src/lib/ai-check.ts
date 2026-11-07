import "server-only";
import { extraFor, isLocalUrl, trimUrl } from "../../scripts/lib/ai-services.mjs";
import { keyOf, mask, services } from "./ai/model";

// 测试连接 and 读取模型列表 for AI 设置. A key typed into a form is used for this one request only (saving is separate);
// otherwise the saved key of the service is used. Keys never appear in what is returned.
type Target = { id?: string; baseUrl?: string; model?: string; key?: string };
function target(t: Target) {
  const s = t.id ? services().find((x) => x.id === t.id) : undefined;
  const baseUrl = trimUrl(t.baseUrl || s?.baseUrl || "");
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error("服务地址要以 http:// 或 https:// 开头");
  // a saved key is only reused for the address it was saved for
  const saved = s && (!t.baseUrl || trimUrl(t.baseUrl) === s.baseUrl) ? keyOf(s.id) : null;
  const key = t.key?.trim() || saved || (isLocalUrl(baseUrl) ? "local" : null);
  return { baseUrl, model: (t.model ?? "").trim(), key };
}

function explain(status: number, body: string, key: string | null) {
  let msg = body;
  try { msg = JSON.parse(body)?.error?.message ?? body; } catch {}
  const detail = mask(String(msg), key).replace(/\s*\(request_id:[^)]*\)?/, "").slice(0, 160);
  return status === 401 || status === 403 ? `密钥不对，或者没有权限（HTTP ${status}）`
    : status === 402 ? "账户余额不足（HTTP 402）"
    : status === 404 ? "服务地址或模型名不对（HTTP 404）"
    : status === 429 ? "请求太频繁或额度用完了（HTTP 429）"
    : `服务返回错误 HTTP ${status}：${detail}`;
}

/** One tiny request (a few tokens) to prove the address, key and model all work. */
export async function testAi(t: Target): Promise<{ ok: boolean; ms?: number; reply?: string; error?: string }> {
  const { baseUrl, model, key } = target(t);
  if (!key) return { ok: false, error: "还没有填密钥" };
  if (!model) return { ok: false, error: "还没有选模型" };
  const t0 = Date.now();
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "只回复两个字：可以" }], max_tokens: 8, temperature: 0, ...extraFor(baseUrl) }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, error: explain(r.status, text, key) };
    const reply = String(JSON.parse(text).choices?.[0]?.message?.content ?? "").trim();
    return { ok: true, ms: Date.now() - t0, reply: reply.slice(0, 40) };
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "30 秒没有响应" : mask((e as Error).message, key);
    return { ok: false, error: `连不上 ${baseUrl}：${msg}` };
  }
}

/** Models the service offers (OpenAI-compatible GET /models). */
export async function listModels(t: Target): Promise<{ models: string[]; error?: string }> {
  const { baseUrl, key } = target(t);
  if (!key) return { models: [], error: "填好密钥后才能读取模型列表" };
  try {
    const r = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    const text = await r.text();
    if (!r.ok) return { models: [], error: explain(r.status, text, key) };
    const data = JSON.parse(text).data ?? [];
    return { models: data.map((m: { id?: string }) => String(m.id ?? "")).filter(Boolean).sort() };
  } catch (e) {
    return { models: [], error: `读取模型列表失败：${mask((e as Error).message, key)}` };
  }
}
