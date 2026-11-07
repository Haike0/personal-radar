// Model services, shared by the app (src/lib/ai/model.ts) and the command-line scripts (scripts/lib/env.mjs).
//
// Every service speaks the OpenAI chat-completions format (DeepSeek, OpenAI, Gemini, 通义千问, Kimi, 智谱, OpenRouter,
// a local Ollama…), so one client covers them all. Two roles pick a service + model each:
//   chat — Q&A in the app        fast — organizing chats, day summaries (used most, pick something cheap)
//
// Where keys live: a small JSON file in the data folder (keys.json, readable only by your user account), never in
// radar.db and never in anything sent to the browser. RADAR_AI_KEY / RADAR_AI_BASE_URL / RADAR_AI_MODEL (.env.local)
// add a read-only service called "环境变量", used by default when nothing else is chosen.
import fs from "node:fs";
import path from "node:path";

export const PRESETS = [
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", models: ["deepseek-flash", "deepseek-v4-pro"], keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [], keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: [], keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: [], keyUrl: "https://openrouter.ai/keys" },
  { id: "moonshot", name: "Kimi（月之暗面）", baseUrl: "https://api.moonshot.cn/v1", models: [], keyUrl: "https://platform.moonshot.cn/console/api-keys" },
  { id: "qwen", name: "通义千问（阿里云百炼）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: [], keyUrl: "https://bailian.console.aliyun.com/" },
  { id: "zhipu", name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: [], keyUrl: "https://open.bigmodel.cn/usercenter/apikeys" },
  { id: "ollama", name: "Ollama（本机模型，不联网）", baseUrl: "http://127.0.0.1:11434/v1", models: [], keyUrl: "https://ollama.com/download" },
];
const DEEPSEEK = { ...PRESETS[0], builtin: true };
const DEFAULT_MODEL = "deepseek-flash";

export const trimUrl = (u) => String(u ?? "").trim().replace(/\/+$/, "");
/** A server on this computer (e.g. Ollama) needs no key. */
export const isLocalUrl = (u) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(trimUrl(u) + "/");
/** DeepSeek accepts a switch other OpenAI-compatible servers may reject. */
export const extraFor = (baseUrl) => (/deepseek/i.test(baseUrl) ? { thinking: { type: "disabled" } } : {});

// ---------- key store: <data folder>/keys.json, mode 600 ----------
const keyFile = (dataDir) => path.join(dataDir, "keys.json");
export function readKeys(dataDir) {
  try { const k = JSON.parse(fs.readFileSync(keyFile(dataDir), "utf8")); return k && typeof k === "object" ? k : {}; } catch { return {}; }
}
/** Save (or, with an empty key, remove) one service's key. Written to a temp file first so a crash never leaves half a file. */
export function writeKey(dataDir, id, key) {
  const all = readKeys(dataDir);
  const k = String(key ?? "").trim();
  if (k) all[id] = k; else delete all[id];
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = keyFile(dataDir), tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* not supported on this file system */ }
}

// ---------- services and roles ----------
export function envService(env) {
  if (!env.RADAR_AI_KEY && !env.RADAR_AI_BASE_URL) return null;
  return { id: "env", name: "环境变量（.env.local）", baseUrl: trimUrl(env.RADAR_AI_BASE_URL || DEEPSEEK.baseUrl), models: [env.RADAR_AI_MODEL || DEFAULT_MODEL], builtin: true, fromEnv: true };
}
/** `get(key)` reads a saved setting. */
export function listServices(get, env) {
  let extra = [];
  try { extra = JSON.parse(get("ai_services") || "[]"); } catch {}
  const e = envService(env);
  const own = (Array.isArray(extra) ? extra : []).filter((s) => s && s.id && s.id !== "deepseek" && s.id !== "env")
    .map((s) => ({ id: String(s.id), name: String(s.name ?? s.id), baseUrl: trimUrl(s.baseUrl), models: (s.models ?? []).map(String) }));
  return [...(e ? [e] : []), DEEPSEEK, ...own];
}
export function keyFor(service, dataDir, env) {
  const k = service.id === "env" ? String(env.RADAR_AI_KEY ?? "").trim() : String(readKeys(dataDir)[service.id] ?? "").trim();
  return k || (isLocalUrl(service.baseUrl) ? "local" : null);
}
/** Saved as "serviceId|model"; empty means "the default": the 环境变量 service if there is one, else DeepSeek. */
export function choiceOf(get, env, role) {
  const raw = get(role === "chat" ? "ai_chat" : "ai_fast") || "";
  if (raw.includes("|")) { const [serviceId, ...m] = raw.split("|"); return { serviceId, model: m.join("|") }; }
  const e = envService(env);
  return e ? { serviceId: "env", model: e.models[0] } : { serviceId: "deepseek", model: DEFAULT_MODEL };
}
export function resolveRole(get, env, dataDir, role) {
  const c = choiceOf(get, env, role);
  const list = listServices(get, env);
  let service = list.find((s) => s.id === c.serviceId), model = c.model;
  if (!service) { service = list[0]; model = service.models[0] || DEFAULT_MODEL; } // the chosen one was deleted
  if (!model) model = service.models[0] || "";
  return { service, model, key: keyFor(service, dataDir, env), url: service.baseUrl + "/chat/completions", extra: extraFor(service.baseUrl) };
}

/**
 * Before multiple services existed, one endpoint was saved as settings (ai_base_url, ai_model, ai_key — the key in
 * radar.db). Move it into a service + keys.json once, then delete those rows. `d` is an open, writable radar.db.
 */
export function migrateLegacy(d, dataDir) {
  try {
    const row = (k) => d.prepare("SELECT value FROM settings WHERE key=?").get(k)?.value;
    const key = String(row("ai_key") ?? "").trim(), baseUrl = trimUrl(row("ai_base_url") ?? ""), model = String(row("ai_model") ?? "").trim();
    if (row("ai_key") === undefined && row("ai_base_url") === undefined) return;
    const put = d.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    if (key || (baseUrl && baseUrl !== DEEPSEEK.baseUrl)) {
      let id = "deepseek";
      if (baseUrl && baseUrl !== DEEPSEEK.baseUrl) {
        id = "s-migrated";
        const preset = PRESETS.find((p) => p.baseUrl === baseUrl);
        const services = [{ id, name: preset?.name ?? "我的服务", baseUrl, models: model ? [model] : [] }];
        put.run("ai_services", JSON.stringify(services));
      }
      if (key) writeKey(dataDir, id, key);
      if (model) { put.run("ai_chat", `${id}|${model}`); put.run("ai_fast", `${id}|${model}`); }
    }
    d.exec("DELETE FROM settings WHERE key IN ('ai_preset','ai_base_url','ai_model','ai_key')");
  } catch { /* best effort: worst case the user enters the key again */ }
}
