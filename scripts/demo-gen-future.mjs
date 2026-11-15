#!/usr/bin/env node
// 把演示场景接下来一个月排满（全部虚构）：每个人 7–10 件未来的安排，配上这几天聊天里把它约下来的几条消息。
// 像 iPhone 展示机里的演示数据：每个人都很忙、生活很满，但每件事都有来由、时间地点具体、彼此不冲突。
//   node scripts/demo-gen-future.mjs love|work [--redo]
// 写进 demo/<场景>/chats.json（插入新消息，时间排好）和 items.json（新事项，refs 指向新消息）；
// 插入消息后，已有事项的 refs 和 ledger.json 的 proof 会一起改成新编号。每个人的结果缓存在 .cache/future/。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI, extraBody, requireKey } from "./lib/env.mjs";
import { similarity } from "./lib/dupes.mjs";

const SET = process.argv[2];
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "demo", SET ?? "");
if (!SET || !fs.existsSync(path.join(DIR, "cast.mjs"))) { console.log("usage: demo-gen-future.mjs love|work [--redo]"); process.exit(1); }
const { CAST, ME, ME_NAME, STYLE } = await import(path.join(DIR, "cast.mjs"));
const CACHE = path.join(DIR, ".cache", "future");
fs.mkdirSync(CACHE, { recursive: true });
const K = requireKey();
const DAYS = 35;

async function ds(system, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
        body: JSON.stringify({ model: AI.model, ...extraBody(), messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.9, max_tokens: 8000, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return String((await res.json()).choices?.[0]?.message?.content ?? "");
    } catch (e) { console.error(`  retry ${attempt + 1}: ${e.message}`); await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); }
  }
  return null;
}

const chats = JSON.parse(fs.readFileSync(path.join(DIR, "chats.json"), "utf8"));

const items = JSON.parse(fs.readFileSync(path.join(DIR, "items.json"), "utf8"));
const ledgerPath = path.join(DIR, "ledger.json");
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, "utf8")) : {};

const SYSTEM = `你在给一个聊天提醒 App 编演示数据（全部虚构）。要像 iPhone 展示机里的演示数据：每个人生活都很满、很忙，但真实可信。
只输出 JSON。`;

function prompt(c, s, upcoming, others) {
  const recent = s.messages.slice(-60).map(([off, hm, from, text]) => `${off} ${hm} ${from === "A" ? ME_NAME : c.name}：${text}`).join("\n");
  return `【我】${ME}
【对方】${c.name}（${c.tag}）：${c.who}
喜好：${c.likes ?? ""}；雷区：${c.ng ?? ""}；常聊：${c.topics ?? ""}

【日历】今天是第 0 天，第 1 天是明天，以此类推。

【已经排好的、不要重复】
${upcoming.map((x) => `- 第 ${x.event_day} 天 ${x.event_time ?? ""} ${x.title}`).join("\n") || "（无）"}
【我和别人这段时间已有的安排，时间别撞】
${others.map((x) => `- 第 ${x.day} 天 ${x.time ?? ""} 和${x.who}：${x.title}`).join("\n") || "（无）"}

【最近的聊天（编号 = 相对天数）】
${recent}

任务：给我和${c.name}排接下来 ${DAYS} 天里的 8 件事，分散在这 35 天里，别挤在同一天。要符合两人关系和对方的生活节奏：
- 种类混搭：约好一起做的事（kind=plan）、我答应要做的事（kind=promise, subject=self）、对方答应的事（kind=promise, subject=them）、对方自己的重要日子或安排（kind=plan, subject=them，比如考试、出差、复诊、生日、面试、汇报）、要我回复或准备的事（kind=pending）。
- 具体：有时间（HH:MM）和地点或细节，比如「18:30 和小雨吃那家新开的云南菜」。
- 标题和消息里都不要出现星期几（周一…周日、星期X、周末、礼拜X），App 会按用户打开的日期换算，写了星期会对不上；具体日期（x 号）也别写。可以说「明天」「后天」「下周」「过两天」，或者只说事情本身。
- 8 件里可以有 2 件还没完全定（certainty=tentative）。
- 每件事配 2–5 条把它约下来的微信消息，放在第 -6 到第 -1 天之间（不要放第 0 天），写法遵守下面的规则，接得上最近的聊天，不要每条都很完整。
${STYLE}

输出：{"plans":[{"title":"一句话标题，像「和小雨吃云南菜」「帮妈妈预约体检」","kind":"plan|promise|pending","subject":"both|self|them","certainty":"confirmed|tentative","event_day":天数,"event_time":"HH:MM 或 null","summary":"一两句说明","why":"为什么要记住","messages":[[天数,"HH:MM","A 或 C",文字]]}]}
A = 我（${ME_NAME}），C = ${c.name}。`;
}

const okTime = (t) => t == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const WEEKDAY = /周[一二三四五六日天末]|星期|礼拜/;
function check(p, taken) {
  if (!p || typeof p.title !== "string" || p.title.length < 4) return "标题";
  if (WEEKDAY.test(p.title) || WEEKDAY.test(p.summary ?? "") || (p.messages ?? []).some((m) => WEEKDAY.test(String(m?.[3] ?? "")))) return "写了星期几";
  if (!["plan", "promise", "pending"].includes(p.kind)) return "kind";
  if (!["both", "self", "them"].includes(p.subject)) p.subject = "both";
  if (!["confirmed", "tentative"].includes(p.certainty)) p.certainty = "confirmed";
  if (!Number.isInteger(p.event_day) || p.event_day < 1 || p.event_day > DAYS) return "日期";
  if (!okTime(p.event_time)) return "时间";
  if (!Array.isArray(p.messages) || p.messages.length < 2 || p.messages.length > 6) return "消息条数";
  for (const m of p.messages) {
    if (!Array.isArray(m) || m.length !== 4) return "消息格式";
    const [off, hm, from, text] = m;
    if (!Number.isInteger(off) || off < -6 || off > -1 || !okTime(hm) || !["A", "C"].includes(from) || typeof text !== "string" || !text.trim()) return "消息内容";
  }
  if (taken.some((t) => similarity(t, p.title) >= 0.5)) return "重复";
  return null;
}

// everyone's plans so far, so different people don't land on the same evening
const othersOf = (id) => {
  const out = [];
  for (const c of CAST) if (c.id !== id) for (const x of items[c.id] ?? []) if (x.event_day != null && x.event_day >= 0) out.push({ day: x.event_day, time: x.event_time, who: c.name, title: x.title });
  return out.sort((a, b) => a.day - b.day);
};

const added = {};
for (const c of CAST) {
  const s = chats.sessions.find((x) => x.id === c.id);
  if (!s) continue;
  const cacheFile = path.join(CACHE, `${c.id}.json`);
  let plans;
  if (fs.existsSync(cacheFile) && !process.argv.includes("--redo")) plans = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  else {
    const upcoming = (items[c.id] ?? []).filter((x) => x.event_day != null && x.event_day >= 0);
    const raw = await ds(SYSTEM, prompt(c, s, upcoming, othersOf(c.id)));
    try { plans = JSON.parse(raw ?? "{}").plans ?? []; } catch { plans = []; }
    fs.writeFileSync(cacheFile, JSON.stringify(plans, null, 1));
  }
  const taken = (items[c.id] ?? []).map((x) => x.title);
  const good = [];
  for (const p of plans) {
    const why = check(p, taken);
    if (why) { console.log(`  ✗ ${c.name}：${p?.title ?? "?"}（${why}）`); continue; }
    taken.push(p.title); good.push(p);
  }
  added[c.id] = good;
  // temporarily list them so the next person sees them as taken evenings
  items[c.id] = [...(items[c.id] ?? []), ...good.map((p) => ({ title: p.title, event_day: p.event_day, event_time: p.event_time, _new: true }))];
  console.log(`${c.name}：${good.length} 件`);
}
for (const id of Object.keys(items)) items[id] = items[id].filter((x) => !x._new);

// insert the messages, keep time order, and renumber every existing reference
for (const s of chats.sessions) {
  const plans = added[s.id];
  if (!plans?.length) continue;
  const old = s.messages.map((m) => ({ m, oldIdx: 0 }));
  old.forEach((o, i) => { o.oldIdx = i + 1; });
  const fresh = [];
  plans.forEach((p, pi) => p.messages.forEach((m, mi) => fresh.push({ m: [m[0], m[1], m[2], m[3].trim()], plan: pi, order: mi })));
  const all = [...old, ...fresh].sort((a, b) => a.m[0] - b.m[0] || a.m[1].localeCompare(b.m[1]) || (a.plan ?? -1) - (b.plan ?? -1) || (a.order ?? 0) - (b.order ?? 0));
  const map = new Map();
  all.forEach((o, i) => { if (o.oldIdx) map.set(o.oldIdx, i + 1); else o.newIdx = i + 1; });
  s.messages = all.map((o) => o.m);
  for (const x of items[s.id] ?? []) x.refs = x.refs.map((r) => map.get(r) ?? r);
  for (const [tmp, l] of Object.entries(ledger)) if (tmp.startsWith(s.id + ":") && l.proof) l.proof = map.get(l.proof) ?? l.proof;
  let n = (items[s.id] ?? []).reduce((a, x) => Math.max(a, Number(String(x.tmp).split(":")[1]) || 0), 0);
  plans.forEach((p, pi) => {
    const refs = all.filter((o) => o.plan === pi).map((o) => o.newIdx);
    items[s.id].push({ tmp: `${s.id}:${++n}`, title: p.title, kind: p.kind, facet: null, subject: p.subject, certainty: p.certainty, milestone: null,
      event_day: p.event_day, event_time: p.event_time ?? null, summary: p.summary ?? "", why: p.why ?? "", refs, supersedes: null });
  });
}

fs.writeFileSync(path.join(DIR, "chats.json"), JSON.stringify(chats));
fs.writeFileSync(path.join(DIR, "items.json"), JSON.stringify(items, null, 1));
if (Object.keys(ledger).length) fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
const total = Object.values(added).reduce((a, l) => a + l.length, 0);
console.log(`写好 ${SET}：新增 ${total} 件未来的安排，消息编号已对齐`);
