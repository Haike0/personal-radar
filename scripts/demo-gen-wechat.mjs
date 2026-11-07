#!/usr/bin/env node
// 生成微信类演示场景（全部虚构）。用 DeepSeek 按 demo/<场景>/cast.mjs 的设定：
//   node scripts/demo-gen-wechat.mjs love refs      用 DeepSeek 搜索接口看网上公开的聊天帖，摘出这类人常用的说法（只当语气参考）
//   node scripts/demo-gen-wechat.mjs love chats     写 150 天的微信聊天（分段并发，每段结果缓存，可中断重跑）
//   node scripts/demo-gen-wechat.mjs love extract   用和真实数据相同的整理规则，从聊天里整理事项（带原话编号）
//   node scripts/demo-gen-wechat.mjs love analyze   每个人的「分析」页
//   node scripts/demo-gen-wechat.mjs love spice     按真实比例补表情包和小表情（模型写得太少），整理出的事项引用的消息编号会一起对齐
// 场景：love（恋人与朋友）、work（职场）。产物：demo/<场景>/chats.json、items.json、analysis.json（日期都用相对天数，导入时按当天换算）
import fs from "node:fs";
import path from "node:path";
import { AI, extraBody, requireKey } from "./lib/env.mjs";

const SET = process.argv[2];
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "demo", SET ?? "");
if (!SET || !fs.existsSync(path.join(OUT, "cast.mjs"))) { console.log("usage: demo-gen-wechat.mjs love|work refs|chats|extract|analyze|spice"); process.exit(1); }
const { CAST, ME, ME_NAME, STYLE, SAMPLES = {}, SEARCH = {}, SPICE = {} } = await import(path.join(OUT, "cast.mjs"));
const CACHE = path.join(OUT, ".cache", "v3");
fs.mkdirSync(CACHE, { recursive: true });
const DAYS = 150;
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const TODAY_WD = 5; // 生成时的“今天”是星期五；导入时会对齐到真实日期的星期
const wd = (off) => WD[(((TODAY_WD + off) % 7) + 7) % 7];
const works = (off) => ["一", "二", "三", "四", "五"].includes(wd(off));

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

// ---------- 0. refs ----------
// 网上公开帖子里的聊天片段 → 摘成「这类人常用的说法」清单。只给写聊天的模型当语气参考，不进仓库、不照抄。
const refFile = (tag) => path.join(CACHE, `refs_${tag}.txt`);
async function search(query) {
  const res = await fetch(`${AI.baseUrl.replace(/\/v1\/?$/, "")}/v1/tools/search`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
    body: JSON.stringify({ query, max_results: 10 }), signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) { console.error(`  search failed ${res.status}: ${query}`); return []; }
  return ((await res.json()).results ?? []).map((r) => `【${r.site_name ?? ""}】${r.title ?? ""}\n${String(r.summary ?? "").slice(0, 1200)}`);
}
async function refs() {
  await pool(Object.entries(SEARCH).map(([tag, qs]) => async () => {
    if (fs.existsSync(refFile(tag))) return;
    const pages = (await Promise.all(qs.map(search))).flat();
    const txt = await ds(`你在帮编剧收集真实的中文微信口语。下面是网上公开帖子的片段。只摘出：这类关系（${tag}）之间聊天时常用的说法、口头禅、句式、梗、常聊的话题、聊天节奏的特点。
要求：每条一行，每条不超过 15 个字；50 条以内；不要具体人名、地名、单位和任何隐私；不要整段照抄；不要书面语和文案腔，只要真人会打出来的话。只输出清单。`, pages.join("\n\n").slice(0, 60000), { max: 2500, temp: 0.4 });
    fs.writeFileSync(refFile(tag), txt.trim());
    console.log(`✓ refs ${tag}: ${pages.length} 个网页片段 → ${txt.trim().split("\n").length} 条说法`);
  }), 4);
}

// ---------- 1. chats ----------
// 先按人物排好每天几通、哪天来店，再按时间顺序一段段写（每段带上前情提要），避免同一件事反复发生。
function rng(seed) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function plan(c) {
  const r = rng([...c.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const start = c.start ?? -DAYS, evDays = new Set(c.events.map((e) => e[0]));
  const raw = [];
  for (let d = -DAYS; d <= 0; d++) {
    if (d < start) { raw.push(0); continue; }
    let w = Math.exp((r() - 0.5) * 1.8);
    if (!works(d)) w *= 1.4;                                        // weekends are chattier
    if (r() < (c.n < 600 ? 0.6 : c.n < 1500 ? 0.3 : 0.04)) w = 0;   // quiet days
    if (evDays.has(d) || evDays.has(d - 1)) w = Math.max(w, 1) * 2;
    raw.push(w);
  }
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return { counts: raw.map((w) => Math.round((w / sum) * c.n)) };
}
async function chats() {
  fs.mkdirSync(CACHE, { recursive: true });
  const people = CAST.filter((x) => !process.env.ONLY || x.id === process.env.ONLY);
  await pool(people.map((c) => async () => {
    const { counts } = plan(c);
    const windows = []; let cur = null;
    for (let d = -DAYS; d <= 0; d++) {
      if (!cur) cur = { from: d, to: d, n: 0 };
      cur.to = d; cur.n += counts[d + DAYS];
      if (cur.n >= 200 || d === 0) { windows.push(cur); cur = null; }
    }
    let story = "（刚开始，还没有发生什么）";
    for (let p = 0; p < windows.length; p++) {
      if (process.env.PARTS && p >= Number(process.env.PARTS)) break;
      const w = windows[p];
      const file = path.join(CACHE, `${c.id}_${p}.txt`);
      if (w.n === 0) continue;
      if (!fs.existsSync(file)) {
        const cal = [];
        for (let d = w.from; d <= w.to; d++) if (counts[d + DAYS]) cal.push(`第${d}天(周${wd(d)}${works(d) ? "" : "·休息日"}): ${counts[d + DAYS]}条`);
        const past = c.events.filter((e) => e[0] < w.from), here = c.events.filter((e) => e[0] >= w.from && e[0] <= w.to), next = c.events.filter((e) => e[0] > w.to);
        const ev = (list) => list.map(([d, e]) => `第${d}天(周${wd(d)}): ${e}`).join("\n") || "无";
        const ref = fs.existsSync(refFile(c.tag)) ? fs.readFileSync(refFile(c.tag), "utf8").split("\n").filter((l) => l.trim()).slice(0, 60).join("\n") : "";
        const sys = `你是编剧，要写出真实感很强的中文微信聊天记录。人物都是虚构的，但说话要像真人，读起来像从别人手机里导出来的。\n${STYLE}` +
          (SAMPLES[c.tag] ? `\n\n【语气示范（编的，只看语气，不要照抄）】\n${SAMPLES[c.tag]}` : "") +
          (ref ? `\n\n【网上真人在这种关系里常说的话（只当参考，挑合适的偶尔用，别堆砌）】\n${ref}` : "");
        const user = `【我】${ME}${c.meVoice ? `\n我跟${c.name}说话的习惯：${c.meVoice}` : ""}\n\n【对方】${c.name}（${c.age} 岁，我的${c.tag}）\n人物：${c.who}\n说话习惯：${c.voice}\n喜欢：${c.likes}\n雷区：${c.ng}\n日常话题（每次换着来，同一件事不要反复发生）：${c.topics}\n\n` +
          `【前情提要（已经发生的事，不要重复）】\n${story}\n\n【已经发生的大事】\n${ev(past)}\n\n【这段时间里一定要发生的事】\n${ev(here)}\n\n【还没发生的事（可以作为计划聊到，但不能写成已经发生）】\n${ev(next)}\n\n` +
          `【这次写的时间段】第${w.from}天 → 第${w.to}天（0 = 今天，数字变大表示时间往后走）\n【每天大概的条数（照这个来，没列出的日子不写）】\n${cal.join("\n")}\n${w.to === 0 ? "今天（第0天）写到下午 3 点为止。\n" : ""}` +
          `\n【输出格式】一行一条，不要任何解释：\n天|HH:MM|发送人|内容\n发送人：W = 我，T = 对方。按时间顺序。过了半夜 0 点就写下一天的数字。\n最后一行写给下一段用的前情提要：\n#前情|（到目前为止发生了什么、现在关系怎样、还没兑现的约定，150 字以内）`;
        const txt = await ds(sys, user, { max: 8000, temp: 0.95 });
        fs.writeFileSync(file, txt);
        console.log(`✓ ${c.id} ${p + 1}/${windows.length}`);
      }
      const m = fs.readFileSync(file, "utf8").match(/#前情\|(.+)/);
      if (m) story = m[1].trim();
    }
  }), 12);
  const sessions = CAST.map((c) => {
    const msgs = [];
    const files = fs.readdirSync(CACHE).filter((f) => f.startsWith(c.id + "_")).sort((a, b) => Number(a.split("_").pop().split(".")[0]) - Number(b.split("_").pop().split(".")[0]));
    for (const f of files) {
      let prev = null;
      for (const line of fs.readFileSync(path.join(CACHE, f), "utf8").split("\n")) {
        const m = line.trim().match(/^第?(-?\d+)天?\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*([WT])\s*\|\s*(.+)$/);
        if (!m) continue;
        let d = Number(m[1]); const t = m[2].padStart(5, "0");
        if (prev && d === prev[0] && t < prev[1] && t < "06:00") d += 1;
        if (d < -DAYS || d > 0) continue;
        prev = [d, t];
        msgs.push([d, t, m[3] === "W" ? "A" : "C", m[4].trim()]);   // same layout as the night demo: A = me, C = them
      }
    }
    msgs.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    return { id: c.id, name: c.name, avatar: c.avatar, tag: c.tag, messages: msgs };
  });
  fs.writeFileSync(path.join(OUT, "chats.json"), JSON.stringify({ today_weekday: TODAY_WD, sessions }));
  for (const s of sessions) console.log(`${s.name}: ${s.messages.length}`);
  console.log("total", sessions.reduce((a, s) => a + s.messages.length, 0));
}

// ---------- 2. extract ----------
const RULES = `你在帮用户（下文"我"，${ME_NAME}）从他和某个人的微信里，整理出值得记住的事。
每条结果都必须用 refs 指向聊天里的消息编号（#后面的数字）作为证据。

kind：plan 有日期或接近确定的安排（含已过去的）/ change 安排变了（填 supersedes 指向被改掉那条的 tmp 编号）/ promise 某人明确答应要做的事 / pending 还在等回复或确认的事 / need 对方明确说出的需要或不满 / preference 明确的喜好或讨厌 / fact 关于这个人的稳定事实或近况 / concern 值得关心的事（只基于对方自己说的话）
milestone：kind 为 fact 时必填 true/false。true = 对方生活里真正发生的一件事（换工作、升职、离职、生病住院、考试、搬家、求婚、生孩子、家里出事）；小事填 false。
facet（kind 为 fact/preference/need 时必填）：作息与工作 / 情况 / 近况 / 喜好 / 明确需求 / 相处约定 / 观点与判断 / 家人与朋友 / 健康 / 其他
subject：them 关于对方 / self 关于我 / both 共同的安排
certainty：confirmed / tentative / changed / cancelled / uncertain
不要提取：玩笑、斗嘴、寒暄、晚安、日常闲聊、你自己的推测（"她可能生气了"）、和【已有记录】重复的内容（用 attach 补证据）。
日期：相对日期按那条消息的「第几天」换算成 event_day（整数，0=今天，负数=过去，正数=将来）。换算不出来就 null 并且 certainty=uncertain。时间写 event_time(HH:mm)。
写法：title 一句话 20 字左右，写清是什么（对方用名字或「她/他」）；summary 补充细节；why 一句话说明为什么值得记。宁缺毋滥：几百条聊天通常 3–12 条。
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
      const lines = s.messages.slice(i, i + CH).map((m, j) => `#${i + j + 1} 第${m[0]}天(周${wd(m[0])}) ${m[1]} ${m[2] === "A" ? "我" : c.name}: ${m[3]}`);
      const known = items.filter((x) => x.status !== "superseded").map((x) => `${x.tmp} | ${x.kind} | ${x.title} | day ${x.event_day ?? "-"}`).join("\n") || "（无）";
      let j = null;
      for (let t = 0; t < 3 && !j; t++) {
        const txt = await ds(RULES, `对方：${c.name}（我的${c.tag}，${c.age} 岁）\n【已有记录】\n${known}\n\n【聊天】\n${lines.join("\n")}`, { max: 8000, temp: 0.2 });
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
    const sys = `你是用户（${ME_NAME}）的私人助手。根据他从微信里整理出的关于一个人的记录，写这个人的「分析」，帮他更了解对方、更好地相处。用中文，说人话，不打分、不贴心理标签、不评判谁对谁错。
只输出 JSON：{"summary":"两三句：这是个什么样的人、你们现在的关系、最近该注意什么","sections":[{"title":"性格特点","points":[{"text":"","basis":"fact 或 inference","items":[记录编号]}]},{"title":"在意什么","points":[]},{"title":"你们的关系","points":[]},{"title":"相处建议","points":[]}]}
每个 point 都要有 items 依据；basis=fact 表示记录里直接写的，inference 表示推断（要克制）。`;
    const txt = await ds(sys, `对方：${c.name}（我的${c.tag}，${c.age} 岁）\n记录：\n${list}`, { max: 2500, temp: 0.3 });
    try { out[c.id] = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]); console.log(`✓ analysis ${c.id}`); } catch { console.error(`bad analysis ${c.id}`); }
  }), 6);
  fs.writeFileSync(path.join(OUT, "analysis.json"), JSON.stringify(out, null, 1));
}

// ---------- 4. spice ----------
// 真实聊天里表情包约占 1 成（情侣更多，和上司、客户很少），模型怎么提示都写不够，这里按比例补上。
// SPICE[tag] = { sticker: { W, T }, code: { W, T }, codes: { W: [...], T: [...] } }，人物可以用 c.codes 覆盖 T 的小表情。
function spice() {
  const file = path.join(OUT, "chats.json");
  const chatsJson = JSON.parse(fs.readFileSync(file, "utf8"));
  if (chatsJson.spiced) { console.log("已经补过表情了（重新生成聊天后才能再补）"); return; }
  chatsJson.spiced = true;
  const items = JSON.parse(fs.readFileSync(path.join(OUT, "items.json"), "utf8"));
  for (const sess of chatsJson.sessions) {
    const c = CAST.find((x) => x.id === sess.id), cfg = SPICE[c.tag];
    if (!cfg) continue;
    const r = rng([...c.id].reduce((a, ch) => a * 33 + ch.charCodeAt(0), 11));
    const codes = { W: cfg.codes?.W ?? [], T: c.codes ?? cfg.codes?.T ?? [] };
    const out = [], map = new Map();
    const has = (t) => /\[[^\]]{1,4}\]|\p{Extended_Pictographic}/u.test(t);
    sess.messages.forEach((m, i) => {
      const who = m[2] === "A" ? "W" : "T";
      const msg = [...m];
      // a small face at the end of a short line
      if (!has(msg[3]) && msg[3].length <= 14 && r() < (cfg.code?.[who] ?? 0) && codes[who].length) msg[3] += codes[who][Math.floor(r() * codes[who].length)];
      out.push(msg); map.set(i + 1, out.length);
      // a sticker right after (same person, same minute) — not after another sticker
      if (msg[3] !== "[表情]" && r() < (cfg.sticker?.[who] ?? 0)) out.push([m[0], m[1], m[2], "[表情]"]);
    });
    sess.messages = out;
    for (const it of items[sess.id] ?? []) it.refs = (it.refs ?? []).map((x) => map.get(x) ?? x);
    const stickers = out.filter((m) => m[3] === "[表情]").length;
    console.log(`${sess.name}: ${out.length} 条，表情包 ${Math.round((100 * stickers) / out.length)}%`);
  }
  fs.writeFileSync(file, JSON.stringify(chatsJson));
  fs.writeFileSync(path.join(OUT, "items.json"), JSON.stringify(items, null, 1));
}

const cmd = process.argv[3];
const t0 = Date.now();
if (cmd === "refs") await refs();
else if (cmd === "chats") await chats();
else if (cmd === "extract") await extract();
else if (cmd === "analyze") await analyze();
else if (cmd === "spice") spice();
else { console.log("usage: demo-gen-wechat.mjs love|work refs|chats|extract|analyze|spice"); process.exit(1); }
console.log(`DeepSeek: ${usage.calls} calls, in ${usage.in} / out ${usage.out} tokens, ${Math.round((Date.now() - t0) / 1000)}s`);
