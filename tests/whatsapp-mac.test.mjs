import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { find, read } from "../scripts/lib/whatsapp-mac.mjs";

// a made-up ChatStorage.sqlite with the columns WhatsApp uses
function fake() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-wa-"));
  const d = new DatabaseSync(path.join(dir, "ChatStorage.sqlite"));
  d.exec(`CREATE TABLE ZWACHATSESSION(Z_PK INTEGER PRIMARY KEY, ZCONTACTJID TEXT, ZPARTNERNAME TEXT, ZSESSIONTYPE INTEGER);
    CREATE TABLE ZWAGROUPMEMBER(Z_PK INTEGER PRIMARY KEY, ZMEMBERJID TEXT, ZCONTACTNAME TEXT);
    CREATE TABLE ZWAMESSAGE(Z_PK INTEGER PRIMARY KEY, ZCHATSESSION INTEGER, ZISFROMME INTEGER, ZFROMJID TEXT, ZGROUPMEMBER INTEGER, ZTEXT TEXT, ZMESSAGEDATE REAL, ZMESSAGETYPE INTEGER, ZSTANZAID TEXT, ZPUSHNAME TEXT);
    INSERT INTO ZWACHATSESSION VALUES(1,'10000000001@s.whatsapp.net','Maria',0),(2,'120000000000000001@g.us','Book club',1),(3,'status@broadcast','',0);
    INSERT INTO ZWAGROUPMEMBER VALUES(1,'10000000002@s.whatsapp.net','Leo');`);
  const at = (sec) => sec - 978307200 + 0.5;
  const ins = d.prepare("INSERT INTO ZWAMESSAGE VALUES(?,?,?,?,?,?,?,?,?,?)");
  ins.run(1, 1, 0, "10000000001@s.whatsapp.net", null, "Dinner Saturday?", at(1762000000), 0, "S1", null);
  ins.run(2, 1, 1, null, null, "Sure, 7pm", at(1762000060), 0, "S2", null);
  ins.run(3, 1, 0, "10000000001@s.whatsapp.net", null, null, at(1762000120), 1, "S3", null);
  ins.run(4, 2, 0, "120000000000000001@g.us", 1, "Chapter 3 by Friday", at(1762000200), 0, "S4", null);
  ins.run(5, 3, 0, "x", null, "status update", at(1762000300), 0, "S5", null);
  d.close();
  return dir;
}

test("reads private chats, placeholders for media, skips status; groups only when asked", () => {
  const dir = fake();
  const file = find(dir);
  const r = read({ file });
  assert.equal(r.chats.length, 1);
  assert.deepEqual(r.chats[0].messages.map((m) => [m.sender, m.text]), [["Maria", "Dinner Saturday?"], ["我", "Sure, 7pm"], ["Maria", "[图片]"]]);
  assert.equal(r.chats[0].messages[0].ts, 1762000000);
  assert.equal(r.chats[0].messages[0].pid, "whatsapp:S1");
  const g = read({ file, groups: true }).chats.find((c) => c.group);
  assert.deepEqual(g.messages.map((m) => [m.sender, m.text]), [["Leo", "Chapter 3 by Friday"]]);
  assert.equal(read({ file, after: r.max }).chats.length, 0);
});

test("missing install is reported", () => {
  assert.equal(find(fs.mkdtempSync(path.join(os.tmpdir(), "radar-wa-none-"))), null);
  assert.ok(read({ file: null }).error);
});
