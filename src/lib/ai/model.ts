import "server-only";
import { DATA_DIR } from "@/lib/config";
import { getSetting, setSettings } from "@/lib/db";
import * as S from "../../../scripts/lib/ai-services.mjs";
import type { Resolved, Role, Service } from "../../../scripts/lib/ai-services.mjs";

// Model services for the app: any OpenAI-compatible API, two roles (chat = Q&A, fast = organizing + day summaries).
// The logic lives in scripts/lib/ai-services.mjs so `npm run organize` resolves exactly the same service and key.
// Keys are kept in <data folder>/keys.json (mode 600). Nothing here ever returns a key to a route that answers the browser.
export type { Resolved, Role, Service };
export const PRESETS = S.PRESETS;

const get = (k: string) => getSetting(k);
export const services = (): Service[] => S.listServices(get, process.env);
export function saveServices(list: Service[]) {
  setSettings({ ai_services: JSON.stringify(list.filter((s) => !s.builtin).map(({ id, name, baseUrl, models }) => ({ id, name, baseUrl, models }))) });
}

export function keyOf(id: string): string | null {
  const s = services().find((x) => x.id === id);
  return s ? S.keyFor(s, DATA_DIR, process.env) : null;
}
export const setKey = (id: string, key: string) => S.writeKey(DATA_DIR, id, key);
export const deleteKey = (id: string) => S.writeKey(DATA_DIR, id, "");

export const choice = (role: Role) => S.choiceOf(get, process.env, role);
export const resolve = (role: Role): Resolved => S.resolveRole(get, process.env, DATA_DIR, role);
export const roleSetting = (role: Role) => (role === "chat" ? "ai_chat" : "ai_fast");

/** Request body shared by every call; DeepSeek-only switches are added only for DeepSeek. */
export const body = (r: Resolved, rest: Record<string, unknown>) => JSON.stringify({ model: r.model, ...r.extra, ...rest });
export const modelLabel = (r: Resolved) => `${r.service.name} · ${r.model}`;
/** Replace a key wherever it might appear in text that is stored or shown (error messages, logs). */
export function mask(text: string, ...keys: (string | null | undefined)[]) {
  let t = text.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-…");
  for (const k of keys) if (k && k.length >= 8 && k !== "local") t = t.split(k).join("…");
  return t;
}
