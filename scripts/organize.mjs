#!/usr/bin/env node
// Personal Radar — organize imported chats with your own AI key (DeepSeek by default, any OpenAI-compatible API).
//
//   npm run organize              → organize new private-chat messages, then write person analyses that are due
//   npm run organize -- --dry-run → show what would be sent, call nothing
//   npm run organize -- --yes     → skip the confirmation (for scheduled runs)
//
// It only drives `radar-ai.mjs` (next / submit / digest / analysis), so every guarantee there still holds:
// chat databases stay read-only, the cursor moves only on a successful submit, items keep message IDs (no chat text).
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline/promises";
import path from "node:path";
import { AI, DATA_DIR, extraBody, requireKey, scrub } from "./lib/env.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const NODE = process.execPath;
const RADAR_AI = path.join(HERE, "radar-ai.mjs");
const GUIDE = fs.readFileSync(path.join(HERE, "../docs/ai-extract-guide.md"), "utf8");
const ANALYSIS_GUIDE = fs.readFileSync(path.join(HERE, "../docs/ai-analysis-guide.md"), "utf8");
const DATA = DATA_DIR;
const LOG = path.join(DATA, "logs/organize.log");
const RESULT = path.join(DATA, "ai-chunks/organize-result.json");
const MODEL = AI.model;
const MAX_MESSAGES = 400; // per chunk: small chunks keep the model careful
const MAX_CHUNKS = Number(process.env.RADAR_MAX_CHUNKS ?? 6); // per person per run
const DRY = process.argv.includes("--dry-run");

const log = (msg) => {
  const line = `${new Date().toLocaleString("sv-SE")} ${msg}`;
  console.log(line);
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, line + "\n"); } catch {}
};
const radarAi = (...args) => spawnSync(NODE, [RADAR_AI, ...args], { encoding: "utf8", env: process.env, maxBuffer: 64 << 20 });

const SYSTEM = GUIDE + `

## 本次输出（重要）
你直接输出提交用的 JSON 对象本身（不要 markdown 代码块，不要解释），格式同上面的「提交格式」，session 字段照抄给你的值。
- kind 为 fact 时必须有 milestone（true/false）；kind 为 fact/preference/need 时必须有 facet
- refs 只能用聊天里出现过的编号，每条 1–8 个
- 没有值得记的内容就输出 {"session":"<同上>","items":[],"attach":[]}`;

const usage = { calls: 0, in: 0, out: 0, hit: 0 };
async function chat(K, messages, maxTokens = 8000) {
  const t0 = Date.now();
  const res = await fetch(`${AI.baseUrl}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
    body: JSON.stringify({ model: MODEL, messages: messages.map((m) => (m.role === "user" ? { ...m, content: scrub(m.content) } : m)), ...extraBody(), temperature: 0.2, max_tokens: maxTokens, response_format: { type: "json_object" } }),
  });
  if (!res.ok) throw new Error(`AI API HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json(), u = j.usage ?? {};
  usage.calls++; usage.in += u.prompt_tokens ?? 0; usage.out += u.completion_tokens ?? 0; usage.hit += u.prompt_cache_hit_tokens ?? 0;
  // same table the app's settings page uses for the monthly cost estimate
  try {
    const d = new DatabaseSync(path.join(DATA, "radar.db"));
    d.exec("CREATE TABLE IF NOT EXISTS ai_calls(id INTEGER PRIMARY KEY, at TEXT, model TEXT, prompt INTEGER, completion INTEGER, cache_hit INTEGER, ms INTEGER)");
    d.prepare("INSERT INTO ai_calls(at,model,prompt,completion,cache_hit,ms) VALUES(?,?,?,?,?,?)")
      .run(new Date().toLocaleString("sv-SE").slice(0, 16), MODEL, u.prompt_tokens ?? null, u.completion_tokens ?? null, u.prompt_cache_hit_tokens ?? null, Date.now() - t0);
    d.close();
  } catch {}
  return j.choices?.[0]?.message?.content ?? "";
}

// Fix what can be fixed mechanically; report the rest back to the model.
const KINDS = ["plan", "promise", "need", "pending", "preference", "concern", "change", "fact"];
const FACETS = ["作息与工作", "情况", "近况", "喜好", "明确需求", "相处约定", "观点与判断", "家人与朋友", "健康", "其他"];
function tidy(res, sid, shownRefs) {
  const problems = [];
  res.session = sid;
  res.extractor = "api";
  res.items = (Array.isArray(res.items) ? res.items : []).filter((x, i) => {
    if (!x || typeof x !== "object") return false;
    x.refs = (Array.isArray(x.refs) ? x.refs : []).map(Number).filter((n) => shownRefs.has(n)).slice(0, 8);
    if (x.kind === "fact" && typeof x.milestone !== "boolean") x.milestone = false;
    for (const k of ["event_date", "event_time", "supersedes_item_id"]) if (x[k] === "" || x[k] === undefined) x[k] = null;
    const why = [];
    if (typeof x.title !== "string" || !x.title.trim() || x.title.length > 80) why.push("title");
    if (!KINDS.includes(x.kind)) why.push("kind");
    if (!["confirmed", "tentative", "changed", "cancelled", "uncertain"].includes(x.certainty)) why.push("certainty");
    if (!["them", "self", "both"].includes(x.subject)) why.push("subject");
    if (["fact", "preference", "need"].includes(x.kind) && !FACETS.includes(x.facet)) why.push("facet");
    if (x.event_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(x.event_date)) why.push("event_date");
    if (x.event_time != null && !/^\d{2}:\d{2}$/.test(x.event_time)) why.push("event_time");
    if (!x.refs.length) why.push("refs");
    if (why.length) problems.push(`items[${i}]「${String(x.title ?? "").slice(0, 20)}」字段不对：${why.join(", ")}`);
    return !why.length;
  });
  res.attach = (Array.isArray(res.attach) ? res.attach : []).filter((a) => Number.isInteger(a?.item_id))
    .map((a) => ({ item_id: a.item_id, refs: (a.refs ?? []).map(Number).filter((n) => shownRefs.has(n)) })).filter((a) => a.refs.length);
  return problems;
}

async function organize(K, sid) {
  for (let n = 0; n < MAX_CHUNKS; n++) {
    const next = radarAi("next", "--session", sid, "--max", String(MAX_MESSAGES), "--resume");
    if (next.status !== 0) { log(`${sid} next failed: ${next.stderr.trim()}`); return; }
    const chunk = next.stdout;
    if (chunk.startsWith("DONE")) return;
    const head = chunk.split("\n")[0];
    const shownRefs = new Set(chunk.split("\n").map((l) => l.match(/^(\d+) [WT] /)?.[1]).filter(Boolean).map(Number));
    if (DRY) { log(`[dry-run] ${head} · ${chunk.length} chars`); fs.rmSync(path.join(DATA, "ai-chunks", `${sid}.json`), { force: true }); return; }
    const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: `session: ${sid}\n\n${chunk}` }];
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const text = await chat(K, messages);
      messages.push({ role: "assistant", content: text });
      let res;
      try { res = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ""); } catch { messages.push({ role: "user", content: "输出不是合法 JSON，请只输出 JSON 对象。" }); continue; }
      const problems = tidy(res, sid, shownRefs);
      if (problems.length && attempt < 2) { messages.push({ role: "user", content: `有 ${problems.length} 条不合格，请修正后重新输出完整 JSON：\n${problems.join("\n")}` }); continue; }
      fs.writeFileSync(RESULT, JSON.stringify(res), { mode: 0o600 });
      const sub = radarAi("submit", "--file", RESULT);
      if (sub.status === 0) {
        const out = JSON.parse(sub.stdout);
        log(`${head.replace(/^# /, "")} → 新增 ${out.added}，补证据 ${out.attached}，重复跳过 ${out.skipped}${problems.length ? `，丢弃不合格 ${problems.length}` : ""}`);
        done = true;
      } else {
        const err = sub.stderr.trim();
        if (attempt < 2) messages.push({ role: "user", content: `提交被拒：${err}\n请修正后重新输出完整 JSON。` });
        else log(`${sid} submit failed 3 times, cursor unchanged: ${err}`);
      }
    }
    if (!done) { log(`${sid} 这段没整理成功，下次重试`); return; }
  }
}

// Person analysis: once a chat is fully organized (and again after enough new items), the model reads the digest
// (organized items + one key quote each + plain interaction counts) and writes a sourced analysis.
async function analyze(K, sid) {
  const dig = radarAi("digest", "--session", sid);
  if (dig.status !== 0) { log(`${sid} digest failed: ${dig.stderr.trim()}`); return; }
  if (DRY) { log(`[dry-run] analysis ${sid} · ${dig.stdout.length} chars`); return; }
  const system = ANALYSIS_GUIDE + `\n\n## 本次输出（重要）\n直接输出提交用的 JSON 对象本身（不要 markdown，不要解释），session 字段写 ${sid}。items 里只能用素材里出现过的 #编号（写数字）。`;
  const messages = [{ role: "system", content: system }, { role: "user", content: dig.stdout }];
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await chat(K, messages, 6000);
    messages.push({ role: "assistant", content: text });
    let res;
    try { res = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ""); } catch { messages.push({ role: "user", content: "输出不是合法 JSON，请只输出 JSON 对象。" }); continue; }
    res.session = sid;
    fs.writeFileSync(RESULT, JSON.stringify(res), { mode: 0o600 });
    const sub = radarAi("analysis", "--file", RESULT);
    if (sub.status === 0) { log(`${sid} 人物分析已更新`); return; }
    messages.push({ role: "user", content: `提交被拒：${sub.stderr.trim()}\n请修正后重新输出完整 JSON。` });
  }
  log(`${sid} 人物分析 3 次都没通过校验，下次再试`);
}

function sessionsStatus() {
  const st = radarAi("status");
  if (st.status !== 0) throw new Error(st.stderr.trim() || "radar-ai status failed");
  return JSON.parse(st.stdout).sessions;
}

try {
  fs.mkdirSync(path.join(DATA, "ai-chunks"), { recursive: true, mode: 0o700 });
  const K = DRY ? "" : requireKey();
  const before = sessionsStatus();
  if (!before.length) { log("还没有可整理的私聊：先运行 npm run import -- <导出文件>"); process.exit(0); }
  const todo = before.filter((s) => s.remainingTextMessages > 0);
  if (todo.length && !DRY && !process.argv.includes("--yes")) {
    console.log(`下面这些聊天的新消息会分段发给 ${AI.baseUrl}（${MODEL}）：\n${todo.map((s) => `  · ${s.name}：${s.remainingTextMessages} 条`).join("\n")}`);
    if (!process.stdin.isTTY) { console.log("非交互运行需要加 --yes 才会发送。"); process.exit(0); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ok = /^y(es)?$/i.test((await rl.question("继续吗？[y/N] ")).trim());
    rl.close();
    if (!ok) { console.log("已取消，什么都没发。"); process.exit(0); }
  }
  for (const s of todo) await organize(K, s.session);
  for (const s of sessionsStatus()) if (s.analysisDue) await analyze(K, s.session);
  if (usage.calls) log(`${MODEL}：${usage.calls} 次调用，输入 ${usage.in}（缓存命中 ${usage.hit}）/ 输出 ${usage.out} tokens`);
  for (const s of sessionsStatus()) log(`${s.name}：还剩 ${s.remainingTextMessages} 条没整理，已有 ${s.aiItems} 条记录${s.analysisAt ? `，分析 ${s.analysisAt.slice(0, 10)}` : ""}`);
} catch (e) {
  log(`error: ${e.message}`);
  process.exit(1);
}
