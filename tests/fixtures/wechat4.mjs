// Builds a tiny, made-up WeChat 4.x database pair (contact.db + message_0.db + message_1.db) in a temp folder,
// with the shapes that matter: zstd-compressed bodies, a quote reply, a group with "username:\n" prefixes,
// an unnamed group member, a system line, an official account to skip, and a chat split across two message files.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const MSG = `CREATE TABLE "{t}"(local_id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER, local_type INTEGER, sort_seq INTEGER, real_sender_id INTEGER,
  create_time INTEGER, status INTEGER, upload_status INTEGER, download_status INTEGER, server_seq INTEGER, origin_source INTEGER, source TEXT,
  message_content TEXT, compress_content TEXT, packed_info_data BLOB, WCDB_CT_message_content INTEGER, WCDB_CT_source INTEGER)`;
export const ME = "fixture_user_me", AMY = "fixture_user_amy", ROOM = "10001@chatroom", BOB = "fixture_user_bob", STRANGER = "fixture_user_x";

export function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-wx-"));
  fs.mkdirSync(path.join(dir, "db_storage", "contact"), { recursive: true });
  fs.mkdirSync(path.join(dir, "db_storage", "message"), { recursive: true });
  const c = new DatabaseSync(path.join(dir, "db_storage", "contact", "contact.db"));
  c.exec("CREATE TABLE contact(id INTEGER PRIMARY KEY, username TEXT, local_type INTEGER, remark TEXT, nick_name TEXT); CREATE TABLE stranger(id INTEGER PRIMARY KEY, username TEXT, local_type INTEGER, remark TEXT, nick_name TEXT)");
  const ci = c.prepare("INSERT INTO contact(username, local_type, remark, nick_name) VALUES(?,?,?,?)");
  ci.run(ME, 1, "", "测试自己"); ci.run(AMY, 1, "艾米", "Amy"); ci.run(BOB, 1, "", "阿波"); ci.run(ROOM, 2, "", "周末羽毛球"); ci.run("gh_fixture", 1, "", "某公众号");
  c.close();

  const db = (n, users) => {
    const d = new DatabaseSync(path.join(dir, "db_storage", "message", `message_${n}.db`));
    d.exec("CREATE TABLE Name2Id(user_name TEXT PRIMARY KEY, is_session INTEGER)");
    const ids = {};
    for (const u of users) { d.prepare("INSERT INTO Name2Id(user_name, is_session) VALUES(?, 1)").run(u); ids[u] = Number(d.prepare("SELECT rowid id FROM Name2Id WHERE user_name=?").get(u).id); }
    return { d, ids, add(chat, rows) {
      const t = `Msg_${md5(chat)}`;
      d.exec(MSG.replace("{t}", t));
      const ins = d.prepare(`INSERT INTO "${t}"(server_id, local_type, real_sender_id, create_time, message_content, WCDB_CT_message_content) VALUES(?,?,?,?,?,?)`);
      for (const [sid, type, who, ts, text, zip] of rows) ins.run(BigInt(sid), BigInt(type), ids[who] ?? 0, ts, zip ? zlib.zstdCompressSync(Buffer.from(text)) : text, zip ? 4 : 0);
    } };
  };
  const quote = (title, svrid) => `<msg><appmsg><title>${title}</title><type>57</type><refermsg><svrid>${svrid}</svrid><content>原话</content></refermsg></appmsg></msg>`;
  const T0 = 1762000000;
  const a = db(0, [ME, AMY, ROOM, BOB, STRANGER, "gh_fixture"]);
  a.add(AMY, [
    [9000000000000000001n, 1, AMY, T0, "周六一起吃火锅吗", false],
    [9000000000000000002n, 1, ME, T0 + 60, "好啊 几点", true],
    [9000000000000000003n, (57n << 32n) | 49n, AMY, T0 + 120, quote("晚上七点 老地方", "9000000000000000002"), true],
    [9000000000000000004n, 3, ME, T0 + 180, "<img/>", false],
    [9000000000000000005n, 10000, 0, T0 + 240, "你撤回了一条消息", false],
  ]);
  a.add(ROOM, [
    [9000000000000000101n, 1, BOB, T0 + 10, `${BOB}:\n明晚八点场地订好了`, true],
    [9000000000000000102n, 1, STRANGER, T0 + 20, `${STRANGER}:\n我也来`, false],
    [9000000000000000103n, 1, ME, T0 + 30, "收到", false],
  ]);
  a.add("gh_fixture", [[9000000000000000201n, 1, "gh_fixture", T0, "推送", false]]);
  a.d.close();
  const b = db(1, [AMY, ME]);
  b.add(AMY, [[9000000000000000006n, 1, AMY, T0 + 86400 * 3, "火锅好吃 下次还去", true]]);
  b.d.close();
  return dir;
}
