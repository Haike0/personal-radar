import "server-only";
import { aiConfig, extraBody } from "./ai-config";

type Target = { baseUrl?: string; model?: string; key?: string };
/** Fill in what the form left out (e.g. a key that is already saved) from the current config. */
export function resolveTarget(t: Target) {
  const c = aiConfig();
  const baseUrl = (t.baseUrl ?? c.baseUrl).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) throw new Error("服务地址要以 http:// 或 https:// 开头");
  const key = t.key?.trim() || (baseUrl === c.baseUrl ? c.key : null) || (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl) ? "local" : null);
  return { baseUrl, model: (t.model ?? c.model).trim(), key };
}

const explain = (status: number, body: string) =>
  status === 401 || status === 403 ? "密钥不对，或者没有权限（HTTP " + status + "）"
  : status === 402 ? "账户余额不足（HTTP 402）"
  : status === 404 ? "服务地址或模型名不对（HTTP 404）"
  : status === 429 ? "请求太频繁或额度用完了（HTTP 429）"
  : `服务返回错误 HTTP ${status}：${body.slice(0, 160)}`;

/** One tiny request to prove the endpoint, key and model all work. */
export async function testAi(t: Target) {
  const { baseUrl, model, key } = resolveTarget(t);
  if (!key) return { ok: false, error: "还没有填密钥" };
  if (!model) return { ok: false, error: "还没有选模型" };
  const t0 = Date.now();
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "只回复两个字：可以" }], max_tokens: 8, temperature: 0, ...extraBody(baseUrl) }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    if (!r.ok) return { ok: false, error: explain(r.status, text) };
    const reply = String(JSON.parse(text).choices?.[0]?.message?.content ?? "").trim();
    return { ok: true, ms: Date.now() - t0, reply: reply.slice(0, 40) };
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "30 秒没有响应" : (e as Error).message;
    return { ok: false, error: `连不上 ${baseUrl}：${msg}` };
  }
}

/** Models the service offers (OpenAI-compatible GET /models). */
export async function listModels(t: Target) {
  const { baseUrl, key } = resolveTarget(t);
  if (!key) return { models: [], error: "填好密钥后才能读取模型列表" };
  try {
    const r = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    const text = await r.text();
    if (!r.ok) return { models: [], error: explain(r.status, text) };
    const data = JSON.parse(text).data ?? [];
    const models = data.map((m: { id?: string }) => String(m.id ?? "")).filter(Boolean).sort();
    return { models };
  } catch (e) {
    return { models: [], error: `读取模型列表失败：${(e as Error).message}` };
  }
}
