import "server-only";
import { isExcluded, scrub } from "@/lib/ai-config";
import * as chatlab from "@/lib/chatlab";
import { db, getAnalysis, getItem, getSetting, listItems, listPeople, nowStr, todayStr } from "@/lib/db";
import type { Item } from "@/lib/types";
import { assistantOf } from "./assistants";
import { body, modelLabel, resolve, type Role } from "./model";
import type { Citation, CompanionContext, CompanionProvider, Proposal, StreamEvent } from "./types";

// Real Q&A through the model service chosen in 设置 → AI 设置 (any OpenAI-compatible API; DeepSeek by default).
// Keys stay on the machine running the server (src/lib/ai/model.ts) and never reach the browser. Each question sends
// only a small, question-specific slice: organized items + a few key quotes (+ latest lines for "最近" questions).
let lastModel = "";
/** Is there a key for the Q&A service? (kept for the settings page) */
export async function deepseekKey(): Promise<string | null> {
  return resolve("chat").key;
}

// ---------- picking what to send ----------
const STOP = new Set("的了吗呢吧啊呀是在有和就都也还又跟给我你她他它们这那个什么怎么为什么最近一下一些现在有没有可以能会要想说知道".split(""));
/** crude Chinese/latin keyword set: 2–3 char windows without stop characters, plus latin words */
function terms(q: string): string[] {
  const out = new Set<string>();
  for (const w of q.match(/[A-Za-z0-9]{2,}/g) ?? []) out.add(w.toLowerCase());
  const han = q.replace(/[^一-鿿]/g, " ").split(/\s+/).filter(Boolean);
  for (const seg of han) for (const n of [3, 2]) for (let i = 0; i + n <= seg.length; i++) {
    const w = seg.slice(i, i + n);
    if (![...w].every((c) => STOP.has(c)) && !STOP.has(w[0]) && !STOP.has(w[n - 1])) out.add(w);
  }
  return [...out];
}

function people(question: string, ctx: CompanionContext) {
  // people set to "不发给 AI" in 设置 → 隐私 never reach the model
  const all = listPeople().filter((p) => !p.isGroup && !isExcluded(p.key));
  if (ctx.page === "person" || ctx.page === "day") return all.filter((p) => p.key === ctx.personKey);
  if (ctx.page === "item") {
    const it = getItem(ctx.itemId);
    if (it) return all.filter((p) => p.key === it.personKey);
  }
  const pool = ctx.page === "tag" ? all.filter((p) => p.tags?.includes(ctx.tag)) : all;
  const named = pool.filter((p) => question.includes(p.name));
  if (ctx.page === "tag") return named.length ? named : pool;
  return named.length ? named : all;
}

function score(i: Item, ts: string[]): number {
  const hay = `${i.title} ${i.summary ?? ""} ${i.facet ?? ""}`;
  let s = 0;
  for (const t of ts) if (hay.includes(t)) s += t.length;
  if (i.status === "open" && ["plan", "promise", "pending", "change", "concern"].includes(i.kind)) s += 1.5;
  const d = i.eventDate ?? i.observedAt?.slice(0, 10) ?? "";
  if (d >= addDaysStr(todayStr(), -30)) s += 1;
  return s;
}
function addDaysStr(d: string, n: number) {
  const t = new Date(d + "T00:00:00");
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
}
const RECENT = /最近|这几天|这周|现在|目前|近况|最新/;

/** Exactly what one question sends to the model (also shown by the "发送内容预览" button). */
export function material(question: string, ctx: CompanionContext) {
  const ts = terms(question);
  const ps = people(question, ctx);
  const wide = ps.length > 1;
  const withContext = getSetting("ai_share_evidence") === "context";
  const lines: string[] = [];
  const quoteIds: number[] = [];
  const allowed = new Set<number>(); // item ids the model may cite or propose changes for
  // one day of chat: exactly that day's messages + what was learned that day. Nothing else is searched.
  if (ctx.page === "day") {
    const p = ps[0];
    const msgs = p ? chatlab.dayMessages(p.key, ctx.date, 600) : [];
    const day = (p ? listItems({ person: p.key }) : []).filter((i) => i.status !== "ignored" && i.observedAt?.slice(0, 10) === ctx.date);
    for (const i of day) allowed.add(i.id);
    const an = p ? getAnalysis(p.key) : null;
    lines.push(`## ${p?.name ?? ""} · ${ctx.date} 这一天（只根据这一天回答；别的日子的事资料里没有，就说没有）`);
    if (an?.summary) lines.push(`背景：已有的人物分析摘要（推测性质）：${an.summary}`);
    if (day.length) { lines.push(`这天整理出的记录：`); for (const i of day) lines.push(`#${i.id} [${i.kind}] ${i.title}${i.summary ? "｜" + i.summary.slice(0, 90) : ""}`); }
    lines.push(`这天的聊天（${msgs.length} 条${msgs.length >= 600 ? "，太长只取前 600 条" : ""}）：`);
    for (const m of msgs) if (m.text.trim()) lines.push(`(${m.ts.slice(11)} ${m.sender}) ${m.text.replace(/\s+/g, " ").slice(0, 120)}`);
    return { text: scrub(lines.join("\n")), people: ps.map((x) => x.name), allowed };
  }
  // the item the user is looking at goes first, in full: its fields, its quotes and (setting permitting) the lines around them
  const cur = ctx.page === "item" ? getItem(ctx.itemId) : null;
  if (cur) {
    allowed.add(cur.id);
    lines.push(`## 用户正在看的这条记录（问题里的“这件事”指它）`);
    lines.push(`#${cur.id} [${cur.kind}/${cur.status}/${cur.certainty}${cur.review === "pending" ? "/AI整理未核对" : ""}] ${cur.eventDate ? `日期 ${cur.eventDate}${cur.eventTime ? " " + cur.eventTime : ""} ` : ""}${cur.title}`);
    if (cur.summary) lines.push(`说明：${cur.summary}`);
    if (cur.why) lines.push(`为什么提醒：${cur.why}`);
    if (cur.nextStep) lines.push(`原来的建议：${cur.nextStep}`);
    if (cur.supersedes) lines.push(`它取代了旧记录 #${cur.supersedes.id}「${cur.supersedes.title}」（${cur.supersedes.eventDate ?? "无日期"}）`);
    if (cur.supersededBy) lines.push(`它已被新记录 #${cur.supersededBy.id}「${cur.supersededBy.title}」（${cur.supersededBy.eventDate ?? "无日期"}）取代`);
    const ev = cur.evidence.filter((e) => withContext || e.isKey);
    if (ev.length) {
      lines.push(withContext ? `原话（含前后文，← 为关键句）：` : `关键原话：`);
      for (const e of ev) lines.push(`(${e.ts} ${e.sender}) ${e.text.replace(/\s+/g, " ").slice(0, 160)}${withContext && e.isKey ? " ←" : ""}`);
    }
    // what was said later about the same thing: messages after the last key quote that share words with the title
    const last = cur.evidence.filter((e) => e.isKey).at(-1);
    if (last) {
      const after = new Map<string, chatlab.ChatMessage>();
      for (const t of terms(cur.title).filter((t) => t.length >= 2).slice(0, 5))
        for (const m of chatlab.search(cur.personKey, t, 6)) if (m.ts > last.ts) after.set(m.messageId, m);
      const later = [...after.values()].sort((a, b) => a.epoch - b.epoch).slice(0, 8);
      if (later.length) {
        lines.push(`之后聊天里又提到相关内容的原话：`);
        for (const m of later) lines.push(`(${m.ts} ${m.sender}) ${m.text.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
  }
  for (const p of ps) {
    if (cur) {
      const rel = listItems({ person: p.key }).filter((i) => i.id !== cur.id && i.status !== "ignored")
        .map((i) => ({ i, s: score(i, terms(cur.title + " " + question)) })).filter((x) => x.s > 1.5).sort((a, b) => b.s - a.s).slice(0, 12);
      if (rel.length) {
        lines.push(`## 和这件事相关的其他记录`);
        for (const { i } of rel) { allowed.add(i.id); lines.push(`#${i.id} [${i.kind}/${i.status}] ${i.eventDate ?? i.observedAt?.slice(0, 10) ?? ""} ${i.title}`); }
      }
      continue; // an item question stays on the item
    }
    const items = listItems({ person: p.key }).filter((i) => i.status !== "ignored");
    const ranked = items.map((i) => ({ i, s: score(i, ts) })).sort((a, b) => b.s - a.s);
    const take = ranked.slice(0, wide ? 25 : 60).map((x) => x.i);
    const an = getAnalysis(p.key);
    lines.push(`## ${p.name}（共 ${items.length} 条记录，下面列出与问题最相关的 ${take.length} 条）`);
    if (an?.summary) lines.push(`已有的人物分析摘要（推测性质）：${an.summary}`);
    for (const i of take) {
      allowed.add(i.id);
      const date = i.eventDate ?? i.observedAt?.slice(0, 10) ?? "";
      lines.push(`#${i.id} [${i.kind}${i.subject === "self" ? "/关于我" : i.subject === "both" ? "/我们" : ""}${i.status !== "open" ? "/" + i.status : ""}] ${date} ${i.title}${i.summary ? "｜" + i.summary.slice(0, 90) : ""}`);
    }
    quoteIds.push(...ranked.filter((x) => x.s > 0).slice(0, wide ? 4 : 10).map((x) => x.i.id));
    // keyword hits straight from the chat (text + voice transcripts), newest first
    const hits = new Map<string, chatlab.ChatMessage>();
    for (const t of ts.filter((t) => t.length >= 2).slice(0, 6)) for (const m of chatlab.search(p.key, t, 4)) hits.set(m.messageId, m);
    const hitLines = [...hits.values()].sort((a, b) => b.epoch - a.epoch).slice(0, wide ? 6 : 14);
    if (hitLines.length) {
      lines.push(`聊天里和问题有关的原话：`);
      for (const m of hitLines) lines.push(`(${m.ts} ${m.sender}) ${m.text.replace(/\s+/g, " ").slice(0, 120)}`);
    }
    if (RECENT.test(question)) {
      const latest = chatlab.recent(p.key, wide ? 20 : 50).filter((m) => m.text.trim().length >= 4 && !/^\[(表情|图片|动画表情)\]$/.test(m.text));
      if (latest.length) {
        lines.push(`最近的聊天（${latest[0].ts} → ${latest.at(-1)!.ts}）：`);
        for (const m of latest) lines.push(`(${m.ts} ${m.sender}) ${m.text.replace(/\s+/g, " ").slice(0, 100)}`);
      }
    }
  }
  const quotes: string[] = [];
  for (const id of quoteIds.filter((x) => x !== cur?.id)) {
    const d = getItem(id);
    const ev = d?.evidence.filter((e) => e.isKey).slice(0, withContext ? 3 : 1) ?? [];
    for (const e of ev) quotes.push(`#${id} 原话 (${e.ts} ${e.sender})：${e.text.replace(/\s+/g, " ").slice(0, 120)}`);
  }
  if (quotes.length) lines.push(`## 关键记录的原话`, ...quotes);
  return { text: scrub(lines.join("\n")), people: ps.map((p) => p.name), allowed };
}

const SYSTEM = (today: string) => `你是用户（下文“我”）的私人记忆助手，帮他回忆和朋友、恋人之间的事，并给出下一步建议。今天是 ${today}。
规则：
- 人称要分清：①整理过的记录（#编号那一行的标题和说明）里，“我”一律指用户本人，“他/她”指对方；②聊天原话（带“时间 说话人”的那几行，以及引号里的话）里，“我”指那句话的说话人。回答时用“你”称呼用户，用名字称呼对方，不要把谁说的、谁做的弄反。
- 只根据提供的资料回答。资料里没有的，直接说“记录里没找到”，不要猜，不要编造日期、数字或原话。
- 每个具体说法后面标出依据：整理过的记录用 [#编号]；直接引用聊天原话时写明时间和说话人。
- 区分事实和推测：对方亲口说的、明确发生的算事实；你的归纳要写“推测”。
- 不打分，不贴心理诊断标签，不评判谁对谁错。
- 结论先行，说人话，简短。用中文。
- 用户让你起草要发给对方的话时，用“我”的口吻写，自然、有温度、不肉麻，并说明依据了哪些记录。
- 标注 [语音 AI 转写·待核对] 的内容可能有识别错误，引用时提醒一句。
- 修改建议：只有当资料清楚显示某条记录已经完成、改了日期、取消了、或者记录本身识别错了时，才在回答的最后另起一行写 ${MARK}，下一行写一个 JSON 数组（最多 3 条），然后结束，不要再写别的。格式：
  [{"itemId":编号,"type":"edit","patch":{"event_date":"YYYY-MM-DD"},"label":"把日期改成 11月20日"}]
  type 只能是 done（已完成）、cancel（取消了）、snooze（延后，加 "days":天数）、edit（改字段，patch 只能含 title、event_date、event_time、next_step、certainty）。itemId 必须是资料里出现过的编号。label 用一句中文说明改什么、依据哪句话。没有把握就不要写，这些建议要用户点确认才会生效。`;
const MARK = "<<<建议修改";

function cite(id: number): Citation | null {
  const d = getItem(id);
  if (!d) return null;
  const q = d.evidence.find((e) => e.isKey);
  return { itemId: d.id, title: d.title, personName: d.personName, quote: q ? { ts: q.ts, sender: q.sender, text: q.text } : undefined };
}

const PATCHABLE = new Set(["title", "event_date", "event_time", "next_step", "certainty"]);
const CERTAINTIES = new Set(["confirmed", "tentative", "changed", "cancelled", "uncertain"]);
/** The model's suggested changes, kept only if they are well-formed and point at an item it was actually shown. */
function parseProposals(raw: string, allowed: Set<number>): Proposal[] {
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let arr: unknown;
  try { arr = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: Proposal[] = [];
  for (const x of arr.slice(0, 3) as Record<string, unknown>[]) {
    const itemId = Number(x?.itemId), type = String(x?.type ?? ""), label = String(x?.label ?? "").slice(0, 120);
    if (!allowed.has(itemId) || !label || !getItem(itemId)) continue;
    const p: Proposal = { id: `ai-${itemId}-${type}-${out.length}`, itemId, type: type as Proposal["type"], label };
    if (type === "snooze") p.days = Math.min(30, Math.max(1, Number(x.days) || 3));
    else if (type === "edit") {
      const patch: Record<string, string | null> = {};
      for (const [k, v] of Object.entries((x.patch ?? {}) as Record<string, unknown>)) {
        if (!PATCHABLE.has(k)) continue;
        const val = v == null ? null : String(v).slice(0, 200);
        if (k === "event_date" && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) continue;
        if (k === "event_time" && val && !/^\d{2}:\d{2}$/.test(val)) continue;
        if (k === "certainty" && (!val || !CERTAINTIES.has(val))) continue;
        patch[k] = val;
      }
      if (!Object.keys(patch).length) continue;
      p.patch = patch;
    } else if (type !== "done" && type !== "cancel") continue;
    out.push(p);
  }
  return out;
}

function logUsage(u: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number } | undefined, ms: number) {
  try {
    const d = db();
    d.exec("CREATE TABLE IF NOT EXISTS ai_calls(id INTEGER PRIMARY KEY, at TEXT, model TEXT, prompt INTEGER, completion INTEGER, cache_hit INTEGER, ms INTEGER)");
    d.prepare("INSERT INTO ai_calls(at,model,prompt,completion,cache_hit,ms) VALUES(?,?,?,?,?,?)")
      .run(nowStr(), lastModel, u?.prompt_tokens ?? null, u?.completion_tokens ?? null, u?.prompt_cache_hit_tokens ?? null, ms);
  } catch { /* usage log is best-effort */ }
}

export const deepseekProvider: CompanionProvider = {
  name: "AI",
  simulated: false,
  async *respond(history, ctx, assistant): AsyncGenerator<StreamEvent> {
    const r = resolve("chat");
    yield { type: "meta", provider: r.service.name, simulated: false, model: modelLabel(r) };
    const key = r.key;
    if (!key) { yield { type: "text", delta: `还没有 ${r.service.name} 的密钥，所以没法回答。到「设置 → AI 设置 → 模型服务」里填上。` }; yield { type: "done" }; return; }
    const question = history.filter((h) => h.role === "user").at(-1)?.content ?? "";
    const m = material(question, ctx);
    const messages = [
      { role: "system", content: SYSTEM(todayStr()) + `\n当前助手：${assistantOf(assistant).name}。${assistantOf(assistant).prompt}` },
      { role: "system", content: `资料（涉及：${m.people.join("、")}）：\n${m.text}` },
      ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    ];
    const t0 = Date.now();
    lastModel = r.model;
    const res = await fetch(r.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: body(r, { messages, stream: true, stream_options: { include_usage: true }, temperature: 0.3, max_tokens: 1500 }),
      signal: AbortSignal.timeout(90_000),
    }).catch(() => null);
    if (!res || !res.ok || !res.body) {
      const st = res?.status ?? 0;
      yield { type: "text", delta: st === 401 ? `${r.service.name} 说密钥无效，请到「设置 → AI 设置」里重新填。` : `${r.service.name} 暂时没有响应（${st ? `HTTP ${st}` : "连不上"}），稍后再试。` };
      yield { type: "done" };
      return;
    }
    let answer = "", buf = "", usage, shown = 0;
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (j.usage) usage = j.usage;
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) {
            answer += delta;
            // stream the visible answer; everything from the proposal marker on is held back and parsed at the end
            const cut = answer.indexOf(MARK);
            const upto = cut >= 0 ? cut : Math.max(shown, answer.length - MARK.length);
            if (upto > shown) { yield { type: "text", delta: answer.slice(shown, upto) }; shown = upto; }
          }
        } catch { /* partial line; ignore */ }
      }
    }
    logUsage(usage, Date.now() - t0);
    const cut = answer.indexOf(MARK);
    const visible = (cut >= 0 ? answer.slice(0, cut) : answer).trimEnd();
    if (visible.length > shown) yield { type: "text", delta: visible.slice(shown) };
    const proposals = cut >= 0 ? parseProposals(answer.slice(cut + MARK.length), m.allowed) : [];
    answer = visible;
    const ids = [...new Set([...answer.matchAll(/#(\d+)/g)].map((x) => Number(x[1])))];
    const cites = ids.map(cite).filter((c): c is Citation => !!c).slice(0, 8);
    if (cites.length) yield { type: "citations", items: cites };
    if (proposals.length) yield { type: "proposals", items: proposals };
    yield { type: "done" };
  },
};

/** One non-streaming call (day summaries etc.) on the "fast" model. Returns null when there's no key or the call fails. */
export async function complete(system: string, user: string, maxTokens = 400, role: Role = "fast"): Promise<string | null> {
  const r = resolve(role);
  if (!r.key) return null;
  const t0 = Date.now();
  try {
    lastModel = r.model;
    const res = await fetch(r.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${r.key}` },
      body: body(r, { messages: [{ role: "system", content: system }, { role: "user", content: scrub(user) }], temperature: 0.2, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    logUsage(j.usage, Date.now() - t0);
    return String(j.choices?.[0]?.message?.content ?? "").trim() || null;
  } catch {
    return null;
  }
}
