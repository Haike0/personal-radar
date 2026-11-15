// Interface language. The Simplified Chinese text in the code is the key; other languages are looked up in
// src/i18n/<lang>.json (filled by scripts/i18n-translate.mjs). Anything missing falls back to the Chinese.
// The app renders on the client only (see ClientOnly), so the language is known before anything is drawn.
import zhHant from "@/i18n/zh-Hant.json";
import ja from "@/i18n/ja.json";
import en from "@/i18n/en.json";

export type Lang = "zh-Hans" | "zh-Hant" | "ja" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "zh-Hans", label: "简体中文" }, { id: "zh-Hant", label: "繁體中文" }, { id: "ja", label: "日本語" }, { id: "en", label: "English" },
];
const DICTS: Record<Lang, Record<string, string>> = { "zh-Hans": {}, "zh-Hant": zhHant, ja, en };
const KEY = "radar.lang";

function detect(): Lang {
  if (typeof window === "undefined") return "zh-Hans";
  try { const v = localStorage.getItem(KEY) as Lang | null; if (v && v in DICTS) return v; } catch { /* private window */ }
  for (const l of navigator.languages ?? [navigator.language]) {
    const x = l.toLowerCase();
    if (/^zh-(tw|hk|mo)|^zh-hant/.test(x)) return "zh-Hant";
    if (x.startsWith("zh")) return "zh-Hans";
    if (x.startsWith("ja")) return "ja";
    if (x.startsWith("en")) return "en";
  }
  return "zh-Hans";
}
let current: Lang | null = null;
export const lang = (): Lang => (current ??= detect());

/** For dates and numbers (Intl): 11月8日 周日 / 11月8日 週日 / 11月8日(日) / Sun, Nov 8 */
export const locale = () => ({ "zh-Hans": "zh-CN", "zh-Hant": "zh-TW", ja: "ja-JP", en: "en-US" })[lang()];
/** Weekday names, Sunday first. */
export const weekdays = (style: "short" | "narrow" = "short") =>
  Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: style }).format(new Date(2026, 10, 1 + i)));

/** Switch language and reload, so labels computed once at start-up are redone too. */
export async function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* private window */ }
  await syncServerLang(l);
  location.reload();
}

/** Tell the app the language, so the demo people are seeded speaking it. Returns once the server has it. */
export async function syncServerLang(l: Lang = lang()) {
  try {
    const s = (await (await fetch("/api/settings", { cache: "no-store" })).json()) as { settings?: Record<string, string> };
    if ((s.settings?.ui_lang ?? "zh-Hans") !== l)
      await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ui_lang: l }) });
  } catch { /* offline: keep going */ }
}

/** t("我欠{0} {1} 件", name, n) */
export function t(src: string, ...args: (string | number | null | undefined)[]): string {
  const s = DICTS[lang()][src] ?? src;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] == null ? "" : String(args[Number(i)]))) : s;
}
