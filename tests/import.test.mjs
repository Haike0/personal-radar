import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { plan, read, T, write } from "../scripts/lib/import-core.mjs";

const F = (f) => path.join(import.meta.dirname, "fixtures", f);
const load = (f, opts) => read(fs.readFileSync(F(f)), f, opts);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "radar-test-"));
const local = (s) => new Date(s * 1000).toLocaleString("sv-SE").slice(0, 16);

test("LINE (Japanese, BOM + CRLF, quoted multi-line, stickers, calls, unsent)", () => {
  const { format, chats } = load("line-ja.txt");
  assert.equal(format, "line");
  const c = chats[0];
  assert.equal(c.name, "佐藤 さん");
  assert.equal(c.messages.length, 8);
  assert.equal(c.messages[2].text, "新しくできたカフェ行きたい\n駅の近くのとこ");
  assert.deepEqual(c.messages.slice(3, 7).map((m) => m.type), [T.sticker, T.image, T.call, T.recall]);
  assert.equal(local(c.messages[7].ts), "2026-11-02 09:12");
  const p = plan(c, {}, tmp());
  assert.equal(p.ok, true);
  assert.equal(p.meName, "みなみ");
});

test("LINE (English, 12-hour clock)", () => {
  const c = load("line-en.txt").chats[0];
  assert.equal(c.name, "Ken");
  assert.equal(local(c.messages[0].ts), "2026-11-01 21:03");
  assert.equal(plan(c, {}, tmp()).meName, "Aya");
});

test("LINE group needs --me; system lines kept as system", () => {
  const c = load("line-group.txt").chats[0];
  assert.equal(c.group, true);
  assert.equal(c.messages.at(-1).type, T.system);
  const p = plan(c, {}, tmp());
  assert.equal(p.ok, false);
  assert.equal(p.needMe, true);
  assert.equal(plan(c, { me: "みなみ" }, tmp()).isGroup, true);
});

test("WhatsApp iOS export inside a zip (D/M/Y detected, banner is system)", () => {
  const { format, chats } = load("WhatsApp Chat - Alex.zip");
  assert.equal(format, "whatsapp");
  const c = chats[0];
  assert.equal(c.name, "Alex");
  assert.equal(c.messages[0].type, T.system);
  assert.equal(c.messages[3].text, "perfect\nalso can you bring the book");
  assert.equal(c.messages[4].type, T.image);
  assert.equal(local(c.messages[5].ts), "2026-11-13 09:00");
  assert.equal(plan(c, {}, tmp()).meName, "Sam");
});

test("WhatsApp Android export (M/D/YY, 12-hour, narrow no-break space)", () => {
  const c = load("WhatsApp Chat with Jordan.txt").chats[0];
  assert.equal(c.name, "Jordan");
  assert.equal(local(c.messages[1].ts), "2026-11-05 20:14");
  assert.equal(local(c.messages[3].ts), "2026-11-13 09:00");
  assert.equal(c.messages[3].type, T.image);
});

test("Telegram single chat and full account export", () => {
  const one = load("telegram-personal.json").chats[0];
  assert.equal(one.name, "Mika");
  assert.equal(one.messages[1].text, "good luck, call me");
  assert.equal(one.messages[1].reply, "tg:4242:1");
  assert.equal(one.messages[2].type, T.sticker);
  assert.equal(plan(one, {}, tmp()).meName, "Leo");
  const all = load("telegram-account.json").chats;
  assert.equal(all.length, 2);
  assert.equal(all[0].ownerId, "user200");
  assert.equal(all[1].group, true);
  assert.equal(plan(all[1], {}, tmp()).ok, true); // owner known from personal_information
});

test("Discord DM (JSON export)", () => {
  const c = load("discord-dm.json").chats[0];
  assert.equal(c.name, "nova");
  assert.equal(c.messages[2].type, T.image);
  assert.equal(c.messages[1].reply, "discord:1001");
});

test("Instagram: mojibake fixed, oldest first", () => {
  const c = load("instagram-message_1.json").chats[0];
  assert.equal(c.name, "Zoë");
  const p = plan(c, {}, tmp());
  assert.equal(p.meName, "Ren");
  assert.equal(c.messages[0].text, "Café ☕ on sunday?");
});

test("ChatLab JSONL", () => {
  const c = load("chatlab.jsonl").chats[0];
  assert.equal(c.platform, "weixin");
  assert.equal(plan(c, {}, tmp()).me, "me");
});

test("write is incremental and never duplicates", () => {
  const dir = tmp();
  const c1 = load("line-ja.txt").chats[0];
  const p1 = plan(c1, {}, dir);
  assert.equal(write(c1, p1, dir).added, 8);
  const c2 = load("line-ja.txt").chats[0];
  const p2 = plan(c2, {}, dir);
  assert.equal(p2.fresh, 0);
  assert.equal(write(c2, p2, dir).added, 0);
  const d = new DatabaseSync(path.join(dir, `${p1.id}.db`), { readOnly: true });
  assert.equal(d.prepare("SELECT owner_id FROM meta").get().owner_id, "みなみ");
  assert.equal(d.prepare("SELECT COUNT(*) n FROM message").get().n, 8);
  d.close();
});

test("unknown files get a readable error", () => {
  assert.throws(() => read(Buffer.from("hello world"), "notes.txt"), /认不出/);
  assert.throws(() => read(Buffer.from('{"a":1}'), "x.json"), /认不出这个 JSON/);
});

test("QQ export JSON: owner from selfUid, elements text, image type", () => {
  const { format, chats } = load("qce-private.json");
  assert.equal(format, "qq");
  const c = chats[0];
  assert.equal(c.name, "小周");
  assert.equal(c.group, false);
  assert.equal(c.messages[1].text, "好啊，8点集合");
  assert.equal(c.messages[2].type, T.image);
  const p = plan(c, {}, tmp());
  assert.equal(p.meName, "阿明");
});

test("QQ legacy .txt export (CRLF, multi-line body)", () => {
  const { format, chats } = load("qq-legacy.txt");
  assert.equal(format, "qq");
  const c = chats[0];
  assert.equal(c.name, "老王");
  assert.equal(c.messages.length, 3);
  assert.equal(c.messages[1].text, "收到，我改一下日历\n顺便把材料发你");
  assert.equal(c.messages[2].type, T.image);
  assert.equal(local(c.messages[0].ts), "2026-11-03 20:15");
  assert.equal(plan(c, {}, tmp()).meName, "小李");
});

test("Google Chat Takeout zip: DM, owner from user_info, narrow-space dates", () => {
  const { format, chats } = load("takeout-googlechat.zip");
  assert.equal(format, "googlechat");
  const c = chats[0];
  assert.equal(c.name, "Rin");
  assert.equal(c.group, false);
  assert.equal(new Date(c.messages[0].ts * 1000).toISOString(), "2026-11-04T21:03:12.000Z");
  assert.equal(plan(c, {}, tmp()).meName, "Kai");
});

test("Markdown, one line per message with [type]", () => {
  const { format, chats } = load("text-oneline.md");
  assert.equal(format, "text");
  const c = chats[0];
  assert.equal(c.name, "阿杰");
  assert.equal(c.messages.length, 4);
  assert.equal(c.messages[2].type, T.image);
  assert.equal(plan(c, {}, tmp()).meName, "我");
});

test("Text log with name+time header lines and multi-line bodies", () => {
  const c = load("text-header.txt").chats[0];
  assert.equal(c.messages.length, 3);
  assert.equal(c.messages[0].text, "早，今天降温\n记得带伞");
  assert.equal(c.messages[2].type, T.sticker);
  assert.equal(local(c.messages[1].ts), "2026-11-04 09:05");
  assert.equal(plan(c, {}, tmp()).meName, "我");
});

test("Markdown with date headings, 'time name：text' and '**name** time' lines", () => {
  const c = load("text-dayhead.md").chats[0];
  assert.equal(c.name, "老周");
  assert.equal(c.messages.length, 3);
  assert.equal(local(c.messages[2].ts), "2026-11-06 08:40");
  assert.equal(c.messages[2].text, "材料发你邮箱了");
});

test("Zip of several Markdown files → one chat each", () => {
  const { format, chats } = load("text-bundle.zip");
  assert.equal(format, "text");
  assert.deepEqual(chats.map((c) => c.name).sort(), ["老周", "阿杰"].sort());
});
