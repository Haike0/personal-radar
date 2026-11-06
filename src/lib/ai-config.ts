import "server-only";
import { getSetting } from "./db";
import { privacyConfig, outbound } from "../../scripts/lib/redact.mjs";

/** Ready-made OpenAI-compatible endpoints. Model lists are fetched live from each service's /models. */
export const AI_PRESETS = [
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "", keyUrl: "https://openrouter.ai/keys" },
  { id: "moonshot", label: "Kimi（月之暗面）", baseUrl: "https://api.moonshot.cn/v1", model: "", keyUrl: "https://platform.moonshot.cn/console/api-keys" },
  { id: "qwen", label: "通义千问（阿里云百炼）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "", keyUrl: "https://bailian.console.aliyun.com/" },
  { id: "zhipu", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
  { id: "ollama", label: "Ollama（本机模型，不联网）", baseUrl: "http://127.0.0.1:11434/v1", model: "", keyUrl: "https://ollama.com/download" },
  { id: "custom", label: "其他兼容 OpenAI 接口的服务", baseUrl: "", model: "", keyUrl: "" },
] as const;

export type AiConfig = { baseUrl: string; model: string; key: string | null; fromEnv: boolean };

/** Current AI endpoint: environment variables win, then what was saved in 设置 → AI 服务. */
export function aiConfig(): AiConfig {
  const env = process.env;
  const baseUrl = (env.RADAR_AI_BASE_URL || getSetting("ai_base_url") || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = env.RADAR_AI_MODEL || getSetting("ai_model") || "deepseek-flash";
  const key = (env.RADAR_AI_KEY || getSetting("ai_key") || "").trim() || null;
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(baseUrl + "/");
  return { baseUrl, model, key: key ?? (isLocal ? "local" : null), fromEnv: Boolean(env.RADAR_AI_KEY) };
}

/** DeepSeek accepts a switch other OpenAI-compatible servers may reject. */
export const extraBody = (baseUrl: string) => (/deepseek/i.test(baseUrl) ? { thinking: { type: "disabled" } } : {});

/** Privacy rules as saved in settings. */
export const privacy = () => privacyConfig((k: string) => getSetting(k));
/** The last step before anything is sent: drop blacklisted lines, redact the rest. */
export const scrub = (text: string) => outbound(text, privacy()).text;
export const isExcluded = (sessionId: string) => privacy().excluded.has(sessionId);
