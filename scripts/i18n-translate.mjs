#!/usr/bin/env node
// Fill src/i18n/<lang>.json for every t("…") string in the app, with DeepSeek (your RADAR_AI_KEY).
// Only missing strings are sent; strings no longer used are dropped. Each answer is checked: every key present,
// the {0} {1} placeholders unchanged, nothing empty, English and Japanese with no Simplified-only leftovers.
//   node scripts/i18n-translate.mjs [zh-Hant|ja|en …]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI, extraBody, requireKey } from "./lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ["zh-Hant", "ja", "en"];
const K = requireKey();

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(tsx?|mjs)$/.test(f.name)) out.push(p);
  }
  return out;
}
const keys = new Set();
for (const f of walk(path.join(ROOT, "src"))) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\(("(?:[^"\\]|\\.)*")/g)) { try { keys.add(JSON.parse(m[1])); } catch { /* not a plain string */ } }
}
console.log(`${keys.size} 条界面文字`);

const NAME = { "zh-Hant": "Traditional Chinese as used in Taiwan (繁體中文，台灣用語)", ja: "natural Japanese (日本語、アプリのUIらしい自然な表現)", en: "natural, concise English for an app UI" };
const GLOSSARY = {
  "zh-Hant": "说话算数账本→說話算數帳本；聊天记忆→聊天記憶；画像→畫像；演示数据→示範資料；整理→整理；待核对→待核對；没下文→沒下文；晒图→曬圖；设置→設定；日历→日曆",
  ja: "说话算数账本→約束帳；聊天记忆→トーク履歴；画像→プロフィール；演示数据→デモデータ；整理（AI）→AI整理；待核对→要確認；没下文→音沙汰なし；晒图→シェア画像；今天→今日；人物→人物；日历→カレンダー；时间线→タイムライン；设置→設定；恋人→恋人；同事→同僚；客户→お客様；上司→上司",
  en: "说话算数账本→Promise Ledger；聊天记忆→Chat history；画像→Profile；演示数据→Demo data；整理（AI）→organize；待核对→To check；没下文→No follow-up；晒图→Share card；今天→Today；人物→People；日历→Calendar；时间线→Timeline；设置→Settings；恋人→Partner；同事→Coworker；客户→Client；上司→Boss",
};
const sys = (lang) => `You translate the interface of "ReadMe", a local app that reads exported chats and reminds you of plans, promises and what people care about.
Translate each Simplified Chinese UI string into ${NAME[lang]}. Keep it short like UI text, keep the tone friendly and plain.
Rules: keep placeholders like {0} {1} exactly (you may reorder them); keep product names (ReadMe, ReadMe, LINE, WhatsApp, Telegram, DeepSeek, ChatLab, Ollama, AI, agent) and code/URLs as they are; keep leading/trailing spaces and symbols like · › → as in the source.
Glossary: ${GLOSSARY[lang]}
Output only a JSON object mapping each source string to its translation.`;

const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(",");
const HANS_ONLY = /[们这个说话时对为见过还样关发过车门问题么]/; // common characters that differ in Traditional
function bad(lang, src, out) {
  if (typeof out !== "string" || !out.trim()) return "空";
  if (ph(src) !== ph(out)) return "占位符";
  if (lang === "en" && /[一-鿿]/.test(out) && !/[一-鿿]/.test(src.replace(/[一-鿿]/g, ""))) return "还有中文";
  if (lang === "zh-Hant" && HANS_ONLY.test(out)) return "简体字";
  return null;
}

async function ask(lang, list) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
        body: JSON.stringify({ model: AI.model, ...extraBody(), messages: [{ role: "system", content: sys(lang) }, { role: "user", content: JSON.stringify(list) }], temperature: 0.2, max_tokens: 8000, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(String((await res.json()).choices?.[0]?.message?.content ?? "{}"));
    } catch (e) { console.error(`  retry ${attempt + 1}: ${e.message}`); await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); }
  }
  return {};
}

for (const lang of LANGS) {
  const file = path.join(ROOT, "src", "i18n", `${lang}.json`);
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const dict = Object.fromEntries(Object.entries(old).filter(([k]) => keys.has(k)));
  for (let round = 0; round < 2; round++) {
    const missing = [...keys].filter((k) => !(k in dict));
    if (!missing.length) break;
    const batches = [];
    for (let i = 0; i < missing.length; i += 60) batches.push(missing.slice(i, i + 60));
    console.log(`${lang}：第 ${round + 1} 轮，${missing.length} 条，${batches.length} 批`);
    const queue = [...batches];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const out = await ask(lang, b);
        for (const k of b) { const why = bad(lang, k, out[k]); if (why) console.log(`  ✗ ${lang} ${JSON.stringify(k).slice(0, 40)}（${why}）`); else dict[k] = out[k]; }
      }
    }));
  }
  const sorted = Object.fromEntries(Object.keys(dict).sort().map((k) => [k, dict[k]]));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`写好 ${lang}.json：${Object.keys(sorted).length}/${keys.size} 条`);
}
