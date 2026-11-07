#!/usr/bin/env node
// 给演示场景预先算好「说话算数账本」：每条承诺后来做没做到。用的是 App 里同一套判断规则（scripts/lib/ledger.mjs），
// 模型必须指出证明的那条消息，指不出就记成「没下文」。打开演示就能直接晒图，不用等 AI。
//   node scripts/demo-gen-ledger.mjs love|work|night        产物：demo/<场景>/ledger.json（按事项的 tmp 编号）
import fs from "node:fs";
import path from "node:path";
import { AI, extraBody, requireKey } from "./lib/env.mjs";
import { LEDGER_SYSTEM, ledgerInput, parseLedger } from "./lib/ledger.mjs";

const SET = process.argv[2];
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "demo", SET ?? "");
if (!SET || !fs.existsSync(path.join(DIR, "items.json"))) { console.log("usage: demo-gen-ledger.mjs love|work|night"); process.exit(1); }
const K = requireKey();
const { sessions } = JSON.parse(fs.readFileSync(path.join(DIR, "chats.json"), "utf8"));
const items = JSON.parse(fs.readFileSync(path.join(DIR, "items.json"), "utf8"));
const OUT = path.join(DIR, "ledger.json");
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

async function ds(system, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${K}` },
        body: JSON.stringify({ model: AI.model, ...extraBody(), messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.2, max_tokens: 300 }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return String((await res.json()).choices?.[0]?.message?.content ?? "");
    } catch (e) { console.error(`  retry ${attempt + 1}: ${e.message}`); await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
  }
  return null;
}

const tasks = [];
for (const s of sessions) {
  const who = (from) => (from === "A" ? "我" : from === "M" ? "备注" : s.name);
  for (const x of items[s.id] ?? []) {
    if (x.kind !== "promise" || out[x.tmp]) continue;
    const refs = [...new Set(x.refs)].filter((r) => s.messages[r - 1]).sort((a, b) => a - b);
    if (!refs.length) continue;
    const last = refs[refs.length - 1];
    const after = s.messages.slice(last, last + 160).map(([off, hm, from, text]) => ({ who: who(from), text, ts: `0000-D${off} ${hm}`.padEnd(16, " ") })); // ledgerInput shows chars 5–16: "D-120 21:03"
    const quotes = refs.slice(-4).map((r) => `${who(s.messages[r - 1][2])}：${s.messages[r - 1][3].slice(0, 100)}`);
    tasks.push(async () => {
      const shown = after;
      const r = parseLedger(await ds(LEDGER_SYSTEM, ledgerInput({ title: x.title, summary: x.summary, whoGuess: x.subject, quotes, name: s.name }, shown)), shown.length);
      if (!r) { console.log(`  ✗ ${x.tmp}`); return; }
      out[x.tmp] = { who: r.who ?? (x.subject === "self" ? "me" : x.subject === "both" ? "both" : "them"), result: r.result, proof: r.proof ? last + r.proof : null, reason: r.reason };
      console.log(`  ${x.tmp} ${out[x.tmp].who} ${r.result} ${r.reason ?? ""}`);
    });
  }
}
console.log(`${SET}: ${tasks.length} 条承诺要判断`);
const queue = [...tasks];
await Promise.all(Array.from({ length: 6 }, async () => { for (let t = queue.shift(); t; t = queue.shift()) await t(); }));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const v = Object.values(out);
console.log(`写好 ${OUT}：${v.length} 条，做到 ${v.filter((x) => x.result === "done").length} · 没做 ${v.filter((x) => x.result === "not").length} · 看不出 ${v.filter((x) => x.result === "unclear").length}`);
