// 说话算数账本: did a promise get kept? The model reads the promise and the chat that came after it, and must point
// at the message that proves it was done. Shared by the app and the demo generator so both use the same guardrails.

export const LEDGER_SYSTEM = `你在帮用户翻旧账：判断聊天里一句承诺后来有没有兑现。
你会收到：一条承诺（谁答应的、答应了什么、当时的原话），和这句话之后的聊天，每条前面有编号 [n]。聊天是挑出来的片段：紧接着的一段、后来提到相关字眼的几段、约定日期前后几天，中间省略的地方标了「……」。

只看给你的聊天，不猜、不脑补。判断三件事：
1. who：这件事是谁答应要做的。"me" = 用户（聊天里的"我"），"them" = 对方，"both" = 两人一起约定、分不出谁。
2. result：
   - "done"：后面的聊天里有明确迹象说明做到了（比如"收到了""好吃""谢谢你来接我"、发了照片说"洗好了"）。
   - "not"：明确没做到（取消了、忘了、被抱怨"你又没…"、到日子也没下文而且后来有人提起没做）。
   - "unclear"：后面没再提，看不出来。拿不准一律选这个。
3. proof：能证明 done 或 not 的那条消息编号 n；unclear 时填 null。done 和 not 都必须填 proof。
reason：一句话说依据，15 字以内，口语，比如"她说收到了，还夸好吃"。

只输出一个 JSON 对象，不要别的文字：{"who":"me|them|both","result":"done|not|unclear","proof":n或null,"reason":"…"}`;

const STOP = new Set("我你她他它们的了吗呢吧啊呀哦嗯是在有就都也还要会能把给和跟去来说好答应保证承诺下次一定到时候这那个些点".split(""));

/**
 * Words to look for later in the chat: two-character pieces of the promise ("新店", "照片"), minus names and filler.
 * @param {string} title @param {string} name
 */
export function keywords(title, name) {
  const t = name ? title.split(name).join(" ") : title;
  const out = new Set();
  for (const run of t.match(/[\u4e00-\u9fff]+|[A-Za-z0-9]{3,}/g) ?? []) {
    if (/^[A-Za-z0-9]+$/.test(run)) { out.add(run.toLowerCase()); continue; }
    for (let i = 0; i + 1 < run.length; i++) { const b = run.slice(i, i + 2); if (!STOP.has(b[0]) && !STOP.has(b[1])) out.add(b); }
  }
  return [...out].slice(0, 10);
}

/**
 * Which later messages the model gets to see. Keeping a promise often happens weeks later ("去了那家新店"), long after
 * the next 160 messages, so besides the messages right after the promise we add every later stretch that mentions the
 * promise's words, and the days around its date.
 * @param {{text:string}[]} all  every message after the promise, oldest first
 * @param {string[]} terms  from keywords()
 * @param {(i:number)=>boolean} [nearDue]  true for messages within a few days of the promised date
 * @returns {number[]} indexes into `all`, in order
 */
export function pickWindow(all, terms, nearDue = () => false, { head = 80, cap = 240 } = {}) {
  const keep = new Set();
  for (let i = 0; i < Math.min(head, all.length); i++) keep.add(i);
  const need = terms.length > 3 ? 2 : terms.length ? 1 : 0;
  const hits = [];
  if (need) all.forEach((m, i) => {
    const t = m.text.toLowerCase();
    const n = terms.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
    if (n >= need && i >= head) hits.push([i, n]);
  });
  // the stretches that mention the most of the promise's words
  const best = hits.sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8).map(([i]) => i);
  for (const i of best) for (let j = Math.max(0, i - 3); j <= Math.min(all.length - 1, i + 12); j++) keep.add(j);
  all.forEach((_, i) => { if (keep.size < cap && nearDue(i)) keep.add(i); });
  return [...keep].sort((a, b) => a - b).slice(0, cap);
}

/**
 * @param {{title:string, summary?:string|null, whoGuess:string, quotes:string[], name:string}} p
 * @param {{who:string, text:string, ts:string, gap?:boolean}[]} after  messages after the promise, oldest first (gap = some were skipped before this one)
 */
export function ledgerInput(p, after) {
  // gaps in the numbering are fine; a "…" line marks skipped stretches so the model doesn't read them as one talk
  const guess = p.whoGuess === "self" ? "我" : p.whoGuess === "them" ? p.name : "两人";
  const lines = [];
  after.forEach((m, i) => {
    if (m.gap) lines.push("……");
    lines.push(`[${i + 1}] ${m.ts.slice(5, 16)} ${m.who}：${m.text.replace(/\s+/g, " ").slice(0, 100)}`);
  });
  return [
    `承诺：${p.title}`,
    p.summary ? `说明：${p.summary}` : "",
    `整理时认为是 ${guess} 答应的（可能不对，以原话为准）`,
    `当时的原话：`,
    ...p.quotes.map((q) => `  ${q}`),
    ``,
    `之后的聊天（共 ${after.length} 条）：`,
    ...(lines.length ? lines : ["（之后没有聊天）"]),
  ].filter((x) => x !== "").join("\n");
}

/**
 * Parse and check the model's answer. A "done" or "not" without a real message number becomes "unclear", so a
 * made-up verdict never reaches the ledger. Returns null when the answer isn't usable at all.
 * @param {string|null} raw
 * @param {number} size  how many messages were shown
 */
export function parseLedger(raw, size) {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const who = ["me", "them", "both"].includes(j.who) ? j.who : null;
  let result = ["done", "not", "unclear"].includes(j.result) ? j.result : "unclear";
  const n = Number(j.proof);
  let proof = Number.isInteger(n) && n >= 1 && n <= size ? n : null;
  if (!proof) result = "unclear";
  if (result === "unclear") proof = null;
  const reason = String(j.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || null;
  return { who, result, proof, reason };
}
