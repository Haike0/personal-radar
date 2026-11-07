import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatePairs, similarity } from "../scripts/lib/dupes.mjs";

test("same thing in other words looks alike; different things don't", () => {
  assert.ok(similarity("小林要求跳槽的事别外传", "小林请我保密跳槽的事") >= 0.34);
  assert.ok(similarity("小林面试前很紧张", "小林面试前紧张焦虑") >= 0.34);
  assert.ok(similarity("小林面试前持续紧张焦虑", "小林评审前紧张到腿软") < 0.34);
  assert.ok(similarity("大刘要求休假两周期间别给他打电话", "大刘要求别再临时加需求") < 0.34);
});

test("only same kind, same facet and same date can pair up", () => {
  const it = [
    { id: 1, kind: "need", facet: "明确需求", date: null, title: "小林要求跳槽的事别外传" },
    { id: 2, kind: "need", facet: "明确需求", date: null, title: "小林请我保密跳槽的事" },
    { id: 3, kind: "plan", facet: null, date: "2026-11-12", title: "周四晚和小林吃烤肉" },
    { id: 4, kind: "plan", facet: null, date: "2026-11-14", title: "周四晚和小林吃烤肉" }, // same words, other day: a second dinner
    { id: 5, kind: "concern", facet: null, date: null, title: "小林请我保密跳槽的事" },     // other kind
  ];
  assert.deepEqual(candidatePairs(it).map(([a, b]) => [a.id, b.id]), [[1, 2]]);
});
