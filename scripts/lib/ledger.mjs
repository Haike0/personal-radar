// 说话算数账本: did a promise get kept? The model reads the promise and the chat that came after it, and must point
// at the message that proves it was done. Shared by the app and the demo generator so both use the same guardrails.

export const LEDGER_SYSTEM = `你在帮用户翻旧账：判断聊天里一句承诺后来有没有兑现。
你会收到：一条承诺（谁答应的、答应了什么、当时的原话），和这句话之后的聊天，每条前面有编号 [n]。

只看给你的聊天，不猜、不脑补。判断三件事：
1. who：这件事是谁答应要做的。"me" = 用户（聊天里的"我"），"them" = 对方，"both" = 两人一起约定、分不出谁。
2. result：
   - "done"：后面的聊天里有明确迹象说明做到了（比如"收到了""好吃""谢谢你来接我"、发了照片说"洗好了"）。
   - "not"：明确没做到（取消了、忘了、被抱怨"你又没…"、到日子也没下文而且后来有人提起没做）。
   - "unclear"：后面没再提，看不出来。拿不准一律选这个。
3. proof：能证明 done 或 not 的那条消息编号 n；unclear 时填 null。done 和 not 都必须填 proof。
reason：一句话说依据，15 字以内，口语，比如"她说收到了，还夸好吃"。

只输出一个 JSON 对象，不要别的文字：{"who":"me|them|both","result":"done|not|unclear","proof":n或null,"reason":"…"}`;

/**
 * @param {{title:string, summary?:string|null, whoGuess:string, quotes:string[], name:string}} p
 * @param {{who:string, text:string, ts:string}[]} after  messages after the promise, oldest first
 */
export function ledgerInput(p, after) {
  const guess = p.whoGuess === "self" ? "我" : p.whoGuess === "them" ? p.name : "两人";
  const lines = after.map((m, i) => `[${i + 1}] ${m.ts.slice(5, 16)} ${m.who}：${m.text.replace(/\s+/g, " ").slice(0, 100)}`);
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
