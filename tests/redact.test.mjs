import { test } from "node:test";
import assert from "node:assert/strict";
import { outbound, privacyConfig, redactText } from "../scripts/lib/redact.mjs";

const all = privacyConfig(() => null);

test("default rules hide contact details, cards, ids, keys and keep link domains", () => {
  const s = redactText("mail a.b@example.com / 13812345678 / 090-1234-5678 / 4111 1111 1111 1111 / 110101199003078515 / sk-test-fake-0000-0000 / https://tabelog.com/tokyo/abc?x=1 / 192.168.1.20", all);
  assert.equal(s, "mail [邮箱] / [手机号] / [手机号] / [卡号] / [身份证号] / [密钥] / [链接 tabelog.com] / [IP]");
});

test("ordinary numbers and dates are left alone", () => {
  const s = "2026-11-20 15:00 见，预算 30000 円，房间 1203，订单 1234567890123";
  assert.equal(redactText(s, all), s); // 13 digits but fails the card check digit
});

test("groups can be switched off and custom rules added", () => {
  const cfg = privacyConfig((k) => ({ privacy_rules: '["contact"]', privacy_custom: '[{"pattern":"EMP-\\\\d+","replace":"[工号]"}]' })[k]);
  assert.equal(redactText("EMP-1234 a@b.co https://x.com/y", cfg), "[工号] [邮箱] https://x.com/y");
});

test("blacklisted keywords drop the whole line", () => {
  const cfg = privacyConfig((k) => (k === "privacy_keywords" ? '["病院"]' : null));
  const r = outbound("1 T 明日病院に行く\n2 W 了解", cfg);
  assert.equal(r.text, "2 W 了解");
  assert.equal(r.dropped, 1);
});
