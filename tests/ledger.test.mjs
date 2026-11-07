import { test } from "node:test";
import assert from "node:assert/strict";
import { ledgerInput, parseLedger } from "../scripts/lib/ledger.mjs";

test("a verdict has to point at a message that was actually shown", () => {
  assert.deepEqual(parseLedger('{"who":"me","result":"done","proof":3,"reason":"她说收到了"}', 5), { who: "me", result: "done", proof: 3, reason: "她说收到了" });
  // made-up or missing message numbers turn into 看不出来
  assert.equal(parseLedger('{"who":"me","result":"done","proof":9,"reason":"x"}', 5).result, "unclear");
  assert.equal(parseLedger('{"who":"them","result":"not","proof":null}', 5).result, "unclear");
  assert.equal(parseLedger('{"who":"them","result":"unclear","proof":2}', 5).proof, null);
});

test("junk answers are rejected, odd fields are cleaned", () => {
  assert.equal(parseLedger("我觉得做到了", 5), null);
  assert.equal(parseLedger(null, 5), null);
  const r = parseLedger('好的：{"who":"boss","result":"maybe","proof":"2","reason":"   很   长的理由'.padEnd(80, "啊") + '"}', 5);
  assert.equal(r.who, null);
  assert.equal(r.result, "unclear");
  assert.ok(r.reason.length <= 40);
});

test("the prompt numbers the later messages and says when there are none", () => {
  const p = { title: "答应周末修电脑", whoGuess: "self", quotes: ["我：周末帮你修"], name: "小林" };
  const t = ledgerInput(p, [{ who: "小林", text: "修好啦 谢谢", ts: "2026-08-16 20:01" }]);
  assert.match(t, /\[1\] 08-16 20:01 小林：修好啦 谢谢/);
  assert.match(t, /整理时认为是 我 答应的/);
  assert.match(ledgerInput(p, []), /之后没有聊天/);
});
