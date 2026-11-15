import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { bodyText, read } from "../scripts/lib/imessage.mjs";

// a made-up archived NSAttributedString, laid out like the ones newer macOS writes
const blob = (s) => { const t = Buffer.from(s); const len = t.length < 0x80 ? Buffer.from([t.length]) : Buffer.concat([Buffer.from([0x81]), Buffer.from([t.length & 0xff, t.length >> 8])]);
  return Buffer.concat([Buffer.from("\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01\x94\x84\x01+", "latin1"), len, t, Buffer.from([0x86])]); };

function fake() {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "radar-im-")), "chat.db");
  const d = new DatabaseSync(f);
  d.exec(`CREATE TABLE message(ROWID INTEGER PRIMARY KEY, guid TEXT, text TEXT, attributedBody BLOB, handle_id INTEGER, date INTEGER, is_from_me INTEGER, item_type INTEGER DEFAULT 0,
      associated_message_type INTEGER DEFAULT 0, cache_has_attachments INTEGER DEFAULT 0, thread_originator_guid TEXT, date_retracted INTEGER DEFAULT 0);
    CREATE TABLE handle(ROWID INTEGER PRIMARY KEY, id TEXT); CREATE TABLE chat(ROWID INTEGER PRIMARY KEY, guid TEXT, style INTEGER, chat_identifier TEXT, display_name TEXT);
    CREATE TABLE chat_message_join(chat_id INTEGER, message_id INTEGER); CREATE TABLE chat_handle_join(chat_id INTEGER, handle_id INTEGER);`);
  d.exec(`INSERT INTO handle VALUES(1,'+10000000001'),(2,'+10000000002'); INSERT INTO chat VALUES(1,'iMessage;-;+10000000001',45,'+10000000001',''),(2,'SMS;-;+10000000002',45,'+10000000002','');
    INSERT INTO chat_handle_join VALUES(1,1),(2,2);`);
  const ns = (sec) => BigInt(sec - 978307200) * 1000000000n;
  const ins = d.prepare("INSERT INTO message(ROWID,guid,text,attributedBody,handle_id,date,is_from_me,associated_message_type,thread_originator_guid) VALUES(?,?,?,?,?,?,?,?,?)");
  const add = (id, chat, ...a) => { ins.run(id, ...a); d.prepare("INSERT INTO chat_message_join VALUES(?,?)").run(chat, id); };
  add(1, 1, "g1", null, blob("周六几点见"), 1, ns(1762000000), 0, 0, null);
  add(2, 1, "g2", "七点 老地方", null, 0, ns(1762000060), 1, 0, "g1");
  add(3, 1, "g3", "Loved “七点 老地方”", null, 1, ns(1762000070), 0, 2000, null);
  add(4, 2, "g4", "你的验证码是 000000", null, 2, ns(1762000100), 0, 0, null);
  d.close();
  return f;
}

test("attributedBody text is read when text is empty", () => {
  assert.equal(bodyText(blob("你好 hello")), "你好 hello");
  assert.equal(bodyText(blob("长".repeat(60))), "长".repeat(60));
});

test("reads conversations you wrote in, skips tapbacks and one-way texts, picks up only new rows later", () => {
  const f = fake();
  const r = read({ file: f });
  assert.equal(r.chats.length, 1, "the code-only SMS chat stays out");
  assert.deepEqual(r.chats[0].messages.map((m) => [m.sender === "我", m.text]), [[false, "周六几点见"], [true, "七点 老地方"]]);
  assert.equal(r.chats[0].messages[1].reply, "imessage:g1");
  assert.equal(r.chats[0].messages[0].ts, 1762000000);
  assert.equal(read({ file: f, oneWay: true }).chats.length, 2);
  assert.equal(read({ file: f, after: r.max }).chats.length, 0);
});

test("no access is reported, not worked around", () => {
  const r = read({ file: path.join(os.tmpdir(), "no-such-dir", "chat.db") });
  assert.ok(r.error && r.chats.length === 0);
});
