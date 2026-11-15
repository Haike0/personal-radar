#!/usr/bin/env node
// Translate a demo scene for another interface language, with DeepSeek (RADAR_AI_KEY).
//   node scripts/demo-translate.mjs love|work|night zh-Hant|ja|en
// Writes demo/<scene>/<lang>/{chats,items,analysis,ledger,meta}.json. Message order, ids, dates and refs never change,
// so evidence quotes and the ledger keep pointing at the right messages.
// English and Japanese get local first names (小雨 → Emma / 結衣) from one name table used in every prompt;
// Traditional Chinese keeps the names. The night scene's chats are already Japanese and stay as they are.
// Every chunk is checked (same number of lines, nothing empty, no Chinese left in English) and cached in .cache/tr/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI, extraBody, requireKey } from "./lib/env.mjs";

const [SET, LANG] = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "demo", SET ?? "");
if (!SET || !["zh-Hant", "ja", "en"].includes(LANG) || !fs.existsSync(path.join(DIR, "chats.json"))) { console.log("usage: demo-translate.mjs love|work|night zh-Hant|ja|en"); process.exit(1); }
const OUT = path.join(DIR, LANG);
const CACHE = path.join(DIR, ".cache", "tr", LANG);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });
const K = requireKey();
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const chats = read("chats.json"), items = read("items.json"), analysis = fs.existsSync(path.join(DIR, "analysis.json")) ? read("analysis.json") : {};
const ledger = fs.existsSync(path.join(DIR, "ledger.json")) ? read("ledger.json") : {};
const KEEP_CHATS = SET === "night"; // Japanese LINE chats: realistic as they are in every language
const LANG_NAME = { "zh-Hant": "繁體中文（台灣用語）", ja: "自然な日本語", en: "natural casual English" }[LANG];

async function ds(system, user, max = 8000) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
        body: JSON.stringify({ model: AI.model, ...extraBody(), messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3, max_tokens: max, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(String((await res.json()).choices?.[0]?.message?.content ?? "{}"));
    } catch (e) { console.error(`  retry ${attempt + 1}: ${e.message}`); await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); }
  }
  return null;
}
async function pool(tasks, n = 8) { const q = [...tasks]; await Promise.all(Array.from({ length: n }, async () => { for (let t = q.shift(); t; t = q.shift()) await t(); })); }
const cached = async (key, fn) => {
  const f = path.join(CACHE, key.replace(/[^\w.-]/g, "_") + ".json");
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const v = await fn();
  if (v != null) fs.writeFileSync(f, JSON.stringify(v));
  return v;
};

// 1) names
const castMod = fs.existsSync(path.join(DIR, "cast.mjs")) ? await import(path.join(DIR, "cast.mjs")) : {};
const ME_NAME = castMod.ME_NAME ?? (SET === "night" ? "あかり" : "周远");
let NAMES = {};
if (LANG !== "zh-Hant" && SET !== "night") {
  const people = (castMod.CAST ?? []).map((c) => `${c.name}（${c.tag}，${c.age ?? ""} 岁）：${String(c.who ?? "").slice(0, 80)}`);
  NAMES = await cached("names", () => ds(
    `Give localized names for characters of a demo chat app. Target: ${LANG_NAME}. Output JSON {"中文名": "local name"}.`,
    `每个人取一个${LANG === "en" ? "常见的英文名（只要名，不要姓；称呼「X总」「X姐」这类按身份改成 Mr./Ms. + 姓 或自然的叫法）" : "自然な日本の名前（親しい人は下の名前、上司や取引先は「苗字＋さん/部長」など関係に合う呼び方）"}，性别和年龄要合适。英文名 Amy 这类已经是外文的保留。也给「我」（${ME_NAME}）和猫「馒头」取名。
人物：
${people.join("\n")}
我：${ME_NAME}
猫：馒头`, 2000)) ?? {};
}
// the model sometimes keys people by full name (周敏) instead of how they're shown (周姐): add the shown name too
for (const c of castMod.CAST ?? []) if (!NAMES[c.name]) { const full = Object.keys(NAMES).find((k) => k.length > 1 && String(c.who ?? "").includes(k)); if (full) NAMES[c.name] = NAMES[full]; }
const nameOf = (n) => NAMES[n] ?? n;
const NAME_RULE = Object.keys(NAMES).length ? `人名对照（全篇统一，聊天里出现这些名字或它们的昵称、简称时一律换成对应的名字）：${Object.entries(NAMES).map(([a, b]) => `${a}→${b}`).join("；")}。` : "人名保持原样。";

// WeChat's little emoji codes become real emoji for English and Japanese readers
const EMO = { 捂脸: "🤦", 旺柴: "🐶", 强: "👍", 强的: "👍", 害羞: "😳", 抱拳: "🙏", 破涕为笑: "😂", 傲慢: "😏", 调皮: "😜", 裂开: "💔", 苦涩: "😣", 偷笑: "🤭", 发呆: "😶", 得意: "😎", 坏笑: "😏", 擦汗: "😅", Lol: "😆", 握手: "🤝", 微笑: "🙂", OK: "👌", 拥抱: "🤗", 玫瑰: "🌹", 白眼: "🙄", 呲牙: "😁", 发怒: "😠", 委屈: "🥺", 太阳: "☀️", 叹气: "😮‍💨", 傲娇: "😤", 月亮: "🌙" };
const SYS = { "[表情]": { "zh-Hant": "[表情]", ja: "[スタンプ]", en: "[Sticker]" }, "[文件]": { "zh-Hant": "[檔案]", ja: "[ファイル]", en: "[File]" }, "[链接]": { "zh-Hant": "[連結]", ja: "[リンク]", en: "[Link]" },
  "[图片]": { "zh-Hant": "[圖片]", ja: "[写真]", en: "[Photo]" }, "[语音]": { "zh-Hant": "[語音]", ja: "[ボイスメッセージ]", en: "[Voice message]" } };
const pre = (t) => (LANG === "zh-Hant" ? t : t.replace(/\[([^\]\s]{1,6})\]/g, (m, k) => (EMO[k] ? EMO[k] : m)));
const isSys = (t) => SYS[t.trim()] != null;
const HAN = /[一-鿿]/;

// 2) chats
const sysChat = `You translate WeChat-style chat messages for a demo app into ${LANG_NAME}. Keep the texting style: short, casual, typos and slang are fine, keep emoji. Do not merge or split lines. ${NAME_RULE}
Place names: translate normally. Output JSON {"lines": [one translation per input line, same order, same count]}.`;
const outChats = structuredClone(chats);
if (!KEEP_CHATS) {
  const tasks = [];
  for (const s of outChats.sessions) {
    s.name = nameOf(s.name);
    const CH = 60;
    for (let i = 0; i < s.messages.length; i += CH) {
      const part = s.messages.slice(i, i + CH);
      tasks.push(async () => {
        const todo = part.map((m, k) => ({ k, text: m[3] })).filter((x) => !isSys(x.text));
        const res = await cached(`${s.id}-${i}`, async () => {
          let close = null; // right number of lines but a little Chinese left: better than none
          for (let tries = 0; tries < 4; tries++) {
            const r = await ds(sysChat, JSON.stringify({ lines: todo.map((x) => pre(x.text)) }));
            const lines = r?.lines;
            const shapeOk = Array.isArray(lines) && lines.length === todo.length && lines.every((l) => typeof l === "string" && l.trim());
            if (shapeOk && (LANG !== "en" || !lines.some((l) => HAN.test(l)))) return lines;
            if (shapeOk) close = lines;
            console.log(`  ✗ ${s.id} ${i}: ${Array.isArray(lines) ? `${lines.length}/${todo.length} 行${shapeOk ? "，还有中文" : ""}` : "格式不对"}，重试`);
          }
          return close;
        });
        let lines = res;
        if (!lines) { // one stubborn chunk: try it 10 lines at a time
          lines = [];
          for (let j = 0; j < todo.length; j += 10) {
            const sub = todo.slice(j, j + 10);
            const r = await cached(`${s.id}-${i}-${j}`, async () => { const x = await ds(sysChat, JSON.stringify({ lines: sub.map((y) => pre(y.text)) })); return Array.isArray(x?.lines) && x.lines.length === sub.length ? x.lines : null; });
            lines.push(...(r ?? sub.map((y) => y.text)));
          }
          console.log(`  ↻ ${s.id} ${i} 拆小重翻`);
        }
        const res2 = lines;
        todo.forEach((x, j) => { part[x.k][3] = res2[j]; });
        part.forEach((m) => { if (isSys(m[3])) m[3] = SYS[m[3].trim()][LANG]; });
      });
    }
    if (s.tag) s.tag = { 恋人: { "zh-Hant": "戀人", ja: "恋人", en: "Partner" }, 朋友: { "zh-Hant": "朋友", ja: "友達", en: "Friend" }, 家人: { "zh-Hant": "家人", ja: "家族", en: "Family" },
      上司: { "zh-Hant": "上司", ja: "上司", en: "Boss" }, 同事: { "zh-Hant": "同事", ja: "同僚", en: "Coworker" }, 客户: { "zh-Hant": "客戶", ja: "お客様", en: "Client" } }[s.tag]?.[LANG] ?? s.tag;
  }
  console.log(`${SET} → ${LANG}：聊天 ${tasks.length} 段`);
  await pool(tasks);
}

// 3) items, analysis, ledger reasons: short texts, translated in batches of plain strings
const strings = new Set();
for (const list of Object.values(items)) for (const x of list) for (const f of ["title", "summary", "why"]) if (x[f]) strings.add(x[f]);
for (const a of Object.values(analysis)) { if (a.summary) strings.add(a.summary); for (const sec of a.sections ?? []) { strings.add(sec.title); for (const p of sec.points ?? []) strings.add(p.text); } }
for (const l of Object.values(ledger)) if (l.reason) strings.add(l.reason);
const list = [...strings];
const sysText = `You translate notes from a reminder app (things people promised, plans, what someone likes) into ${LANG_NAME}. Keep them short and plain. ${NAME_RULE} 「我」 is the app user (write as "I"/"me" or 私). Output JSON {"t": [translations, same order, same count]}.`;
const dict = {};
const tasks2 = [];
for (let i = 0; i < list.length; i += 60) {
  const part = list.slice(i, i + 60);
  tasks2.push(async () => {
    const res = await cached(`text-${i}-${part.length}`, async () => {
      let close = null; // Japanese names in kanji (the night scene) are fine in English text
      for (let tries = 0; tries < 3; tries++) {
        const r = await ds(sysText, JSON.stringify({ t: part }));
        const shapeOk = Array.isArray(r?.t) && r.t.length === part.length && r.t.every((x) => typeof x === "string" && x.trim());
        if (shapeOk && (LANG !== "en" || SET === "night" || !r.t.some((x) => HAN.test(x)))) return r.t;
        if (shapeOk) close = r.t;
        console.log(`  ✗ 文字 ${i}，重试`);
      }
      return close;
    });
    if (res) part.forEach((s, j) => { dict[s] = res[j]; });
  });
}
console.log(`${SET} → ${LANG}：事项和分析 ${list.length} 条`);
await pool(tasks2);
const tr = (s) => (s && dict[s]) || s;
const outItems = Object.fromEntries(Object.entries(items).map(([k, l]) => [k, l.map((x) => ({ ...x, title: tr(x.title), summary: tr(x.summary), why: tr(x.why) }))]));
const outAnalysis = Object.fromEntries(Object.entries(analysis).map(([k, a]) => [k, { ...a, summary: tr(a.summary), sections: (a.sections ?? []).map((sec) => ({ ...sec, title: tr(sec.title), points: (sec.points ?? []).map((p) => ({ ...p, text: tr(p.text) })) })) }]));
const outLedger = Object.fromEntries(Object.entries(ledger).map(([k, l]) => [k, { ...l, reason: tr(l.reason) }]));

if (!KEEP_CHATS) fs.writeFileSync(path.join(OUT, "chats.json"), JSON.stringify(outChats)); // night: the Japanese originals are used
fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(outItems));
fs.writeFileSync(path.join(OUT, "analysis.json"), JSON.stringify(outAnalysis));
fs.writeFileSync(path.join(OUT, "ledger.json"), JSON.stringify(outLedger));
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({ me: NAMES[ME_NAME] ?? NAMES["我"] ?? ME_NAME, names: NAMES }, null, 1));
const left = list.filter((s) => !dict[s]).length;
console.log(`写好 demo/${SET}/${LANG}/：名字 ${Object.keys(NAMES).length} 个，没翻成的文字 ${left} 条`);
