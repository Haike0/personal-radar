#!/usr/bin/env node
// 生成「夜间接客」演示数据（全部虚构）。用 DeepSeek 按 demo/night/cast.mjs 的设定：
//   node scripts/demo-gen.mjs chats     写 180 天的 LINE 聊天（分段并发，每段结果缓存，可中断重跑）
//   node scripts/demo-gen.mjs extract   用和真实数据相同的整理规则，从聊天里整理事项（带原话编号）
//   node scripts/demo-gen.mjs analyze   每位客人的「分析」页
// 产物：demo/night/chats.json、items.json、analysis.json（日期都用相对天数，导入时按当天换算）
import fs from "node:fs";
import path from "node:path";
import { CAST, HOSTESS, STYLE } from "../demo/night/cast.mjs";
import { AI, extraBody, requireKey } from "./lib/env.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "demo/night");
const CACHE = path.join(OUT, ".cache", "v2");
fs.mkdirSync(CACHE, { recursive: true });
const DAYS = 180;
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const TODAY_WD = 5; // 生成时的“今天”是星期五；导入时会对齐到真实日期的星期
const wd = (off) => WD[(((TODAY_WD + off) % 7) + 7) % 7];
const works = (off) => ["月", "火", "木", "金"].includes(wd(off));

const key = () => requireKey();
const K = key();
const usage = { in: 0, out: 0, calls: 0 };
async function ds(system, user, { max = 8000, temp = 1.0 } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
        body: JSON.stringify({ model: AI.model, ...extraBody(), messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: temp, max_tokens: max }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      usage.in += j.usage?.prompt_tokens ?? 0; usage.out += j.usage?.completion_tokens ?? 0; usage.calls++;
      return String(j.choices?.[0]?.message?.content ?? "");
    } catch (e) {
      console.error(`  retry ${attempt + 1}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw new Error("DeepSeek failed 3 times");
}
async function pool(tasks, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < tasks.length) { const t = i++; out[t] = await tasks[t](); } }));
  return out;
}
const timeline = (c) => c.events.map(([d, e]) => `${d === 0 ? "今日" : d < 0 ? `${-d}日前` : `${d}日後`}(${wd(d)}): ${e}`).join("\n");

// ---------- 1. chats ----------
// 先按人物排好每天几通、哪天来店，再按时间顺序一段段写（每段带上前情提要），避免同一件事反复发生。
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function plan(c) {
  const r = rng([...c.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const start = c.start ?? -DAYS, evDays = new Set(c.events.map((e) => e[0]));
  const raw = [], visit = [];
  for (let d = -DAYS; d <= 0; d++) {
    const ev = c.events.find((e) => e[0] === d)?.[1] ?? "";
    const active = d >= start && !(c.fade != null && d > c.fade);
    visit.push((d >= start && /来店|同伴/.test(ev) && !/来ない|来なく/.test(ev)) || (active && works(d) && r() < (c.visits ?? 1) / 17));
    if (d < start) { raw.push(0); continue; }
    let w = Math.exp((r() - 0.5) * 2.2);
    if (r() < (c.n < 1000 ? 0.55 : c.n < 2500 ? 0.25 : 0.1)) w = 0;
    if (evDays.has(d) || evDays.has(d - 1) || evDays.has(d + 1) || visit[visit.length - 1]) w = Math.max(w, 1) * 2;
    if (c.fade != null && d > c.fade) w *= 0.12;
    raw.push(w);
  }
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return { counts: raw.map((w) => Math.round((w / sum) * c.n)), visit };
}
async function chats() {
  fs.mkdirSync(CACHE, { recursive: true });
  const people = CAST.filter((x) => !process.env.ONLY || x.id === process.env.ONLY);
  await pool(people.map((c) => async () => {
    const { counts, visit } = plan(c);
    const windows = []; let cur = null;
    for (let d = -DAYS; d <= 0; d++) {
      if (!cur) cur = { from: d, to: d, n: 0 };
      cur.to = d; cur.n += counts[d + DAYS];
      if (cur.n >= 160 || d === 0) { windows.push(cur); cur = null; }
    }
    let story = "（まだ何もない。ここから始まる）";
    for (let p = 0; p < windows.length; p++) {
      if (process.env.PARTS && p >= Number(process.env.PARTS)) break;
      const w = windows[p];
      const file = path.join(CACHE, `${c.id}_${p}.txt`);
      if (w.n === 0) continue;
      if (!fs.existsSync(file)) {
        const cal = [];
        for (let d = w.from; d <= w.to; d++) cal.push(`${d}日目(${wd(d)}${works(d) ? "・出勤" : ""}${visit[d + DAYS] ? "・★来店" : ""}): ${counts[d + DAYS]}通`);
        const past = c.events.filter((e) => e[0] < w.from), here = c.events.filter((e) => e[0] >= w.from && e[0] <= w.to), next = c.events.filter((e) => e[0] > w.to);
        const ev = (list) => list.map(([d, e]) => `${d}日目(${wd(d)}): ${e}`).join("\n") || "なし";
        const sys = `あなたは日本の夜の仕事のリアルなLINEを再現する脚本家です。架空の人物の、実在しそうなLINEトーク履歴を書きます。\n${STYLE}`;
        const user = `【あかり】\n${HOSTESS}\n\n【客】${c.name}（${c.age}）\n人物：${c.who}\nこの人が店とあかりに求めているもの：${c.job}\nLINEの癖：${c.voice}\n好き：${c.likes}\nNG：${c.ng || "特になし"}\n日常の話題（毎回ちがう組み合わせで。同じ話題・同じ出来事を何度も繰り返さない）：${c.topics ?? ""}\n\n` +
          `【これまでのあらすじ（もう起きたこと。同じことを繰り返さない）】\n${story}\n\n【すでに起きた大きな出来事】\n${ev(past)}\n\n【この期間に起きる出来事（必ず入れる）】\n${ev(here)}\n\n【まだ起きていない出来事（予定として話すのはOK。起きたことにはしない）】\n${ev(next)}\n\n` +
          `【今回書く期間】${w.from}日目 → ${w.to}日目（0=今日。数字が大きくなる方向に時間が進む）\n【日ごとの通数（この通りに。0通の日は書かない。★来店の日は客が店に来る）】\n${cal.join("\n")}\n${w.to === 0 ? "今日（0日目）は14時までで終える。\n" : ""}` +
          `\n席後メモ（M）は★来店の日だけ、その夜の閉店後（次の日目の1〜3時）に書く。来店していない日はMを書かない。\n` +
          `\n【出力形式】1行1通、説明や前置きは一切なし：\n日目|HH:MM|送信者|本文\n送信者は C（客）/ A（あかり）/ M（席後メモ）。時刻順。深夜0時を過ぎたら次の日目の数字にする。\n最後の行に、次の期間のためのあらすじを1行で：\n#あらすじ|（これまで全体で起きたこと・今の関係・未解決の約束を200字以内で）`;
        const txt = await ds(sys, user, { max: 8000, temp: 0.95 });
        fs.writeFileSync(file, txt);
        console.log(`✓ ${c.id} ${p + 1}/${windows.length}`);
      }
      const m = fs.readFileSync(file, "utf8").match(/#あらすじ\|(.+)/);
      if (m) story = m[1].trim();
    }
  }), 12);
  const sessions = CAST.map((c) => {
    const msgs = [], { visit } = plan(c);
    const files = fs.readdirSync(CACHE).filter((f) => f.startsWith(c.id + "_")).sort((a, b) => Number(a.split("_").pop().split(".")[0]) - Number(b.split("_").pop().split(".")[0]));
    for (const f of files) {
      let prev = null;
      for (const line of fs.readFileSync(path.join(CACHE, f), "utf8").split("\n")) {
        const m = line.trim().match(/^(-?\d+)(?:日目)?\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*([CAM])\s*\|\s*(.+)$/);
        if (!m) continue;
        let d = Number(m[1]); const t = m[2].padStart(5, "0");
        if (prev && d === prev[0] && t < prev[1] && t < "06:00") d += 1;
        // 席后记录写在来店当天的凌晨 → 实际是那天夜里闭店后，挪到第二天
        if (m[3] === "M" && t < "06:00" && visit[d + DAYS] && !visit[d - 1 + DAYS]) d += 1;
        if (d < -DAYS || d > 0) continue;
        prev = [d, t];
        msgs.push([d, t, m[3], m[4].trim()]);
      }
    }
    msgs.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    return { id: c.id, name: c.name, avatar: c.avatar, messages: msgs };
  });
  fs.writeFileSync(path.join(OUT, "chats.json"), JSON.stringify({ today_weekday: TODAY_WD, sessions }));
  for (const s of sessions) console.log(`${s.name}: ${s.messages.length}`);
  console.log("total", sessions.reduce((a, s) => a + s.messages.length, 0));
}

// ---------- 2. extract ----------
const RULES = `你在帮一位银座的陪酒女（下文"我"，あかり）从她和某位客人的 LINE 里，整理出值得记住的事。聊天是日语，你的输出用中文。
每条结果都必须用 refs 指向聊天里的消息编号（#后面的数字）作为证据。M 开头的消息是她自己写的「席后记录」，可以作为证据。

kind：plan 有日期或接近确定的安排（含已过去的）/ change 安排变了（填 supersedes 指向被改掉那条的 tmp 编号）/ promise 某人明确答应要做的事 / pending 还在等回复或确认的事 / need 对方明确说出的需要或不满 / preference 明确的喜好或讨厌 / fact 关于这个人的稳定事实或近况 / concern 值得关心的事（只基于对方自己说的话）
milestone：kind 为 fact 时必填 true/false。true = 对方生活里真正发生的一件事（换工作、生病住院、孙子出生、宠物生病、分手、重要决定）；小事填 false。
facet（kind 为 fact/preference/need 时必填）：作息与工作 / 情况 / 近况 / 喜好 / 明确需求 / 相处约定 / 观点与判断 / 家人与朋友 / 健康 / 其他
subject：them 关于对方 / self 关于我 / both 共同的安排
certainty：confirmed / tentative / changed / cancelled / uncertain
不要提取：玩笑、寒暄、晚安、日常闲聊、你自己的推测（"他可能生气了"）、和【已有记录】重复的内容（用 attach 补证据）。
日期：相对日期按那条消息的日目换算成 event_day（整数，0=今天，负数=过去）。换算不出来就 null 并且 certainty=uncertain。时间写 event_time(HH:mm)。
写法：title 一句话 20 字左右，用中文，写清是什么（客人名字用「他」）；summary 补充细节，可以引用日语原话的意思；why 一句话说明为什么值得记。宁缺毋滥：几百条聊天通常 3–12 条。
只输出 JSON：{"items":[{"tmp":"新编号如 n1","title":"","kind":"","facet":null,"subject":"them","certainty":"confirmed","milestone":null,"event_day":null,"event_time":null,"summary":"","why":"","refs":[12,15],"supersedes":null}],"attach":[{"tmp":"已有编号","refs":[40]}]}`;

async function extract() {
  const { sessions: all } = JSON.parse(fs.readFileSync(path.join(OUT, "chats.json"), "utf8"));
  const sessions = all.filter((x) => !process.env.ONLY || process.env.ONLY.split(",").includes(x.id));
  const file = path.join(OUT, "items.json");
  const out = process.env.ONLY && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  await pool(sessions.map((s) => async () => {
    const c = CAST.find((x) => x.id === s.id);
    const items = []; let seq = 0;
    const CH = 600;
    for (let i = 0; i < s.messages.length; i += CH) {
      const lines = s.messages.slice(i, i + CH).map((m, j) => `#${i + j + 1} ${m[0]}日目(${wd(m[0])}) ${m[1]} ${m[2] === "C" ? "客" : m[2] === "A" ? "我" : "M席后记录"}: ${m[3]}`);
      const known = items.filter((x) => x.status !== "superseded").map((x) => `${x.tmp} | ${x.kind} | ${x.title} | day ${x.event_day ?? "-"}`).join("\n") || "（无）";
      let j = null;
      for (let t = 0; t < 3 && !j; t++) {
        const txt = await ds(RULES, `客人：${c.name}（${c.age}）\n【已有记录】\n${known}\n\n【聊天】\n${lines.join("\n")}`, { max: 8000, temp: 0.2 });
        try { j = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]); } catch { console.error(`  bad json ${s.id} @${i} try ${t + 1}`); }
      }
      if (!j) continue;
      for (const it of j.items ?? []) {
        it.tmp = `${s.id}:${++seq}`;
        it.refs = (it.refs ?? []).map(Number).filter((r) => r >= 1 && r <= s.messages.length);
        if (!it.refs.length) continue;
        items.push(it);
      }
      for (const a of j.attach ?? []) { const t = items.find((x) => x.tmp === a.tmp || x.tmp.endsWith(":" + String(a.tmp).replace(/\D/g, ""))); if (t) t.refs.push(...(a.refs ?? []).map(Number)); }
      // supersedes 在本段里写的是模型看到的编号（已有记录的 tmp）
      for (const it of j.items ?? []) if (it.supersedes && !items.some((x) => x.tmp === it.supersedes)) it.supersedes = null;
      console.log(`✓ ${s.id} ${Math.min(i + CH, s.messages.length)}/${s.messages.length} items=${items.length}`);
    }
    out[s.id] = items;
  }), 6);
  fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(out, null, 1));
}

// ---------- 3. analyze ----------
async function analyze() {
  const items = JSON.parse(fs.readFileSync(path.join(OUT, "items.json"), "utf8"));
  const afile = path.join(OUT, "analysis.json");
  const out = process.env.ONLY && fs.existsSync(afile) ? JSON.parse(fs.readFileSync(afile, "utf8")) : {};
  await pool(CAST.filter((x) => !process.env.ONLY || process.env.ONLY.split(",").includes(x.id)).map((c) => async () => {
    const list = (items[c.id] ?? []).map((x, i) => `${i} | ${x.kind} | ${x.title} | ${x.summary ?? ""}`).join("\n");
    const sys = `你是陪酒女あかり的助手。根据她从 LINE 和席后记录里整理出的关于一位客人的记录，写这位客人的「分析」。用中文，说人话，不要套话，不要评价客人值多少钱、消费潜力（这是红线）。
只输出 JSON：{"summary":"两三句：这是个什么样的人、他来店里想要什么、现在该注意什么","sections":[{"title":"他是谁","points":[{"text":"","basis":"fact 或 inference","items":[记录编号]}]},{"title":"怎么相处","points":[]},{"title":"最近的变化","points":[]},{"title":"要小心的","points":[]}]}
每个 point 都要有 items 依据；basis=fact 表示记录里直接写的，inference 表示你的推断（推断要克制）。`;
    const txt = await ds(sys, `客人：${c.name}（${c.age}）\n记录：\n${list}`, { max: 2500, temp: 0.3 });
    try { out[c.id] = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]); console.log(`✓ analysis ${c.id}`); } catch { console.error(`bad analysis ${c.id}`); }
  }), 6);
  fs.writeFileSync(path.join(OUT, "analysis.json"), JSON.stringify(out, null, 1));
}

const cmd = process.argv[2];
const t0 = Date.now();
if (cmd === "chats") await chats();
else if (cmd === "extract") await extract();
else if (cmd === "analyze") await analyze();
else { console.log("usage: demo-gen.mjs chats|extract|analyze"); process.exit(1); }
console.log(`DeepSeek: ${usage.calls} calls, in ${usage.in} / out ${usage.out} tokens, ${Math.round((Date.now() - t0) / 1000)}s`);
