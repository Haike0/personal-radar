#!/usr/bin/env node
// Sorts 近况 (kind=fact) into "important events" (shown on the timeline) and "small details" (portrait only).
// Only unsorted items (milestone IS NULL) are sent, and only their title + one-line note — never raw chat.
// Usage: node scripts/radar-milestones.mjs [--dry]
import { DatabaseSync } from "node:sqlite";
import { AI, RADAR_DB, extraBody, requireKey } from "./lib/env.mjs";

const DB = RADAR_DB;
const dry = process.argv.includes("--dry");

const key = () => requireKey();
const SYSTEM = `下面是从聊天里整理出的「近况」，每行：编号 | 标题 | 说明。判断哪些是对方生活里真正发生的一件事，值得放进时间线回看：
换工作或辞职、入职离职、搬家、生病住院或做手术、考试和录取结果、毕业、出远门旅行、恋爱分手、家里出事、做了重大决定、开始或结束一件长期的事。
其余都是小事或稳定细节（有驾照、会做饭、周六常上班、今天有点累、买了某样东西、一次普通的吃饭），不进时间线。拿不准的算小事。
只输出一个 JSON 数组，里面是「值得进时间线」的编号，比如 [12, 40]。没有就输出 []。`;

async function classify(k, rows) {
  const user = rows.map((r) => `${r.id} | ${r.title} | ${(r.summary ?? "").replace(/\s+/g, " ").slice(0, 80)}`).join("\n");
  const res = await fetch(`${AI.baseUrl}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${k}` },
    body: JSON.stringify({ model: AI.model, ...extraBody(), messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], temperature: 0, max_tokens: 400 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const j = await res.json();
  const ids = JSON.parse(String(j.choices?.[0]?.message?.content ?? "[]").match(/\[[\s\S]*\]/)?.[0] ?? "[]");
  return { ids: new Set(ids.map(Number)), usage: j.usage };
}

const db = new DatabaseSync(DB);
try { db.exec("ALTER TABLE items ADD COLUMN milestone INTEGER"); } catch { /* already there */ }
const rows = db.prepare("SELECT id, title, summary FROM items WHERE mode='real' AND kind='fact' AND milestone IS NULL ORDER BY id").all();
console.log(`unsorted 近况: ${rows.length}`);
if (!rows.length) process.exit(0);
const k = key();
const set = db.prepare("UPDATE items SET milestone=? WHERE id=?");
let yes = 0, tokens = 0;
for (let i = 0; i < rows.length; i += 60) {
  const batch = rows.slice(i, i + 60);
  const { ids, usage } = await classify(k, batch);
  tokens += (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
  for (const r of batch) {
    const m = ids.has(Number(r.id));
    if (m) { yes++; console.log(`  ★ #${r.id} ${r.title}`); }
    if (!dry) set.run(m ? 1 : 0, r.id);
  }
}
console.log(`${dry ? "[dry run] " : ""}timeline events: ${yes} / ${rows.length} · tokens used: ${tokens}`);
