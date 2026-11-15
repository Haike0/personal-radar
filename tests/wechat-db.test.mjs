import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { chatId, inspect, read } from "../scripts/lib/wechat-db.mjs";
import { plan, write } from "../scripts/lib/import-core.mjs";
import { build, AMY, ROOM } from "./fixtures/wechat4.mjs";

const skip = typeof zlib.zstdCompressSync !== "function" && "needs Node.js with zstd";

test("reads private chats across message files, decodes zstd, quote replies and system lines", { skip }, () => {
  const dir = build();
  const r = read(dir);
  assert.equal(r.chats.length, 1, "official accounts and (by default) groups are skipped");
  const amy = r.chats[0];
  assert.equal(amy.id, chatId(AMY));
  assert.equal(amy.name, "艾米", "remark wins over nickname");
  assert.deepEqual(amy.messages.map((m) => m.text), ["周六一起吃火锅吗", "好啊 几点", "晚上七点 老地方", "[图片]", "你撤回了一条消息", "火锅好吃 下次还去"]);
  assert.equal(amy.messages[1].sender, "我");
  assert.equal(amy.messages[2].reply, "wechat:9000000000000000002");
  assert.equal(amy.messages[4].type, 81);
  assert.equal(amy.messages[0].pid, "wechat:9000000000000000001");
  const json = JSON.stringify(r);
  assert.ok(!/fixture_user_|10001@chatroom/.test(json), "no WeChat username leaves the reader");
});

test("groups: prefix stripped, members named or labelled, never by wxid", { skip }, () => {
  const g = read(build(), { groups: true }).chats.find((c) => c.id === chatId(ROOM));
  assert.equal(g.name, "周末羽毛球");
  assert.deepEqual(g.messages.map((m) => [m.sender, m.text]), [["阿波", "明晚八点场地订好了"], ["群成员 1", "我也来"], ["我", "收到"]]);
});

test("syncing twice adds nothing the second time; `since` only reads newer messages", { skip }, () => {
  const dir = build();
  const chats = fs.mkdtempSync(path.join(os.tmpdir(), "radar-wx-chats-"));
  const once = () => read(dir).chats.map((c) => { const p = plan(c, { id: c.id, me: c.ownerId }, chats); return write(c, p, chats).added; });
  assert.deepEqual(once(), [6]);
  assert.deepEqual(once(), [0]);
  const later = read(dir, { since: { [chatId(AMY)]: 1762000000 + 86400 } });
  assert.equal(later.chats[0].messages.length, 1);
});

test("inspect lists chats without reading them", { skip }, () => {
  const i = inspect(build());
  assert.equal(i.ok, true);
  assert.deepEqual(i.private.map((x) => [x.name, x.messages]), [["艾米", 6]]);
  assert.equal(i.groups.length, 1);
  assert.equal(inspect(fs.mkdtempSync(path.join(os.tmpdir(), "radar-empty-"))).ok, false);
});

test("an encrypted database is reported, never opened or decrypted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-wx-enc-"));
  fs.writeFileSync(path.join(dir, "message_0.db"), Buffer.alloc(4096, 0x5a)); // not a plain SQLite file
  const i = inspect(dir);
  assert.equal(i.ok, false);
  assert.equal(i.encrypted, true);
  assert.match(i.error, /加密/);
  assert.throws(() => read(dir), /加密/);
});
