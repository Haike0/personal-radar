import type { DatabaseSync } from "node:sqlite";
import { DatabaseSync as Sqlite } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { closeDemo, demoDir } from "./chatlab";
import { LEDGER_SQL } from "./ledger-schema";

// 夜间接客演示（全部虚构）。数据不写在代码里：demo/night/ 下的三个文件由 scripts/demo-gen.mjs 用 DeepSeek 生成——
//   chats.json     12 位常客、180 天的 LINE 聊天（约 2 万条），日期是相对天数
//   items.json     用和真实数据相同的整理规则从聊天里整理出的事项，refs 指向消息序号
//   analysis.json  每位客人的「分析」
// 导入时把聊天按今天的日期写成 ChatLab 格式的数据库（放在 app 自己的数据目录 demo-chats/，不碰 ChatLab），
// 这样人物页、聊天记忆、搜原话、AI 问答都走和真实数据完全一样的代码。

type Msg = [number, string, "C" | "A" | "M", string];
type Session = { id: string; name: string; avatar: string; tag?: string; messages: Msg[] };
type Ex = { tmp: string; title: string; kind: string; facet: string | null; subject: string; certainty: string; milestone: boolean | null;
  event_day: number | null; event_time: string | null; summary: string; why: string; refs: number[]; supersedes: string | null };
type Analysis = { summary: string; sections: { title: string; points: { text: string; basis: string; items: number[] }[] }[] };

// Each demo scenario is a folder under demo/ with the same three files. How "me" is named and which app it imitates:
const SETS: Record<string, { platform: string; me: string; memo: string | null; tag: string }> = {
  night: { platform: "line", me: "あかり", memo: "席後メモ", tag: "客人" },
  love: { platform: "weixin", me: "周远", memo: null, tag: "朋友" },
  work: { platform: "weixin", me: "周远", memo: null, tag: "同事" },
};
let SET = "night";
const SRC = (set = SET) => path.join(process.env.RADAR_DEMO_DIR ?? path.join(process.cwd(), "demo"), set);
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(SRC(), f), "utf8")) as T;

export function nightAvailable(set = "night") {
  return fs.existsSync(path.join(SRC(set), "chats.json"));
}

/** Remove the demo chat dbs (when a scenario has no files). */
export function clearNightChats() {
  closeDemo();
  try { for (const f of fs.readdirSync(demoDir())) if (/^demo_.*\.db(-wal|-shm)?$/.test(f)) fs.rmSync(path.join(demoDir(), f)); } catch {}
}

export function seedNight(d: DatabaseSync, now: string, dateOf: (off: number) => string, set = "night") {
  SET = set;
  const cfg = SETS[set] ?? SETS.night;
  const MEMO = cfg.memo ?? "备注";
  const { sessions } = read<{ sessions: Session[] }>("chats.json");
  const items = fs.existsSync(path.join(SRC(), "items.json")) ? read<Record<string, Ex[]>>("items.json") : {};
  const analysis = fs.existsSync(path.join(SRC(), "analysis.json")) ? read<Record<string, Analysis>>("analysis.json") : {};

  // 1) chats → ChatLab-format dbs
  closeDemo();
  const dir = demoDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const f of fs.readdirSync(dir)) if (/^demo_.*\.db(-wal|-shm)?$/.test(f)) fs.rmSync(path.join(dir, f));
  const epoch = (off: number, hm: string) => Math.floor(new Date(`${dateOf(off)}T${hm}:00`).getTime() / 1000);
  for (const s of sessions) {
    const c = new Sqlite(path.join(dir, `${s.id}.db`));
    c.exec(`CREATE TABLE meta(name TEXT NOT NULL, platform TEXT NOT NULL, type TEXT NOT NULL, imported_at INTEGER NOT NULL, group_id TEXT, group_avatar TEXT, owner_id TEXT, schema_version INTEGER DEFAULT 10, session_gap_threshold INTEGER);
      CREATE TABLE member(id INTEGER PRIMARY KEY AUTOINCREMENT, platform_id TEXT NOT NULL UNIQUE, account_name TEXT, group_nickname TEXT, aliases TEXT DEFAULT '[]', avatar TEXT, roles TEXT DEFAULT '[]');
      CREATE TABLE message(id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, sender_account_name TEXT, sender_group_nickname TEXT, ts INTEGER NOT NULL, type INTEGER NOT NULL, content TEXT, reply_to_message_id TEXT DEFAULT NULL, platform_message_id TEXT DEFAULT NULL);
      CREATE INDEX idx_message_ts ON message(ts); CREATE INDEX idx_message_platform_id ON message(platform_message_id);`);
    c.prepare("INSERT INTO meta(name,platform,type,imported_at,owner_id) VALUES(?,?,?,?,?)").run(s.name, cfg.platform, "private", Math.floor(Date.now() / 1000), "me");
    const mem = c.prepare("INSERT INTO member(platform_id,account_name) VALUES(?,?)");
    mem.run("me", cfg.me); mem.run(s.id, s.name); mem.run("memo", MEMO);
    const who = { A: 1, C: 2, M: 3 } as const;
    const ins = c.prepare("INSERT INTO message(sender_id,sender_account_name,ts,type,content,platform_message_id) VALUES(?,?,?,?,?,?)");
    c.exec("BEGIN");
    s.messages.forEach(([off, hm, from, text], i) => ins.run(who[from], from === "A" ? cfg.me : from === "M" ? MEMO : s.name, epoch(off, hm), typeOf(text), text, String(i + 1)));
    c.exec("COMMIT");
    c.close();
  }

  // tags for the demo people (恋人 / 朋友 / 客人…)
  d.exec("CREATE TABLE IF NOT EXISTS person_tags(mode TEXT NOT NULL, person_key TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(mode, person_key, tag))");
  d.exec("DELETE FROM person_tags WHERE mode='demo'");
  const tagIns = d.prepare("INSERT OR IGNORE INTO person_tags(mode, person_key, tag) VALUES('demo', ?, ?)");
  for (const s of sessions) tagIns.run(s.id, s.tag ?? cfg.tag);

  // 2) items + evidence (原话从聊天里取)
  const insItem = d.prepare(`INSERT INTO items(mode,source_key,person_key,person_name,is_group,title,summary,why,next_step,category,status,certainty,kind,event_date,event_time,created_at,updated_at,subject,facet,milestone,origin)
    VALUES('demo',?,?,?,0,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,'chat')`);
  const insEv = d.prepare("INSERT INTO evidence(item_id,session_id,message_id,ts,sender,text,is_key,ord) VALUES(?,?,?,?,?,?,1,?)");
  const ids = new Map<string, number>();
  for (const s of sessions) {
    const list = items[s.id] ?? [];
    for (const x of list) {
      const refs = [...new Set(x.refs)].filter((r) => s.messages[r - 1]).sort((a, b) => a - b);
      if (!refs.length) continue;
      const lastOff = s.messages[refs[refs.length - 1] - 1][0];
      const status = x.certainty === "cancelled" ? "cancelled" : "open";
      insItem.run(x.tmp, s.id, s.name, x.title, x.summary || null, x.why || null, initialCategory(x, lastOff), status, x.certainty ?? "uncertain", x.kind,
        x.event_day == null ? null : dateOf(x.event_day), x.event_time ?? null, now, now, x.subject || "them", x.facet ?? null, x.milestone == null ? null : x.milestone ? 1 : 0);
      const id = Number((d.prepare("SELECT last_insert_rowid() id").get() as { id: number }).id);
      ids.set(x.tmp, id);
      refs.forEach((r, ord) => {
        const [off, hm, from, text] = s.messages[r - 1];
        insEv.run(id, s.id, String(r), `${dateOf(off)} ${hm}`, from === "A" ? "我" : from === "M" ? MEMO : s.name, text, ord);
      });
    }
    for (const x of list) if (x.supersedes && ids.has(x.supersedes) && ids.has(x.tmp))
      d.prepare("UPDATE items SET supersedes_id=? WHERE id=?").run(ids.get(x.supersedes)!, ids.get(x.tmp)!);
  }
  d.exec("UPDATE items SET observed_at=(SELECT MAX(ts) FROM evidence e WHERE e.item_id=items.id) WHERE mode='demo'");

  // 3) 说话算数账本, judged ahead of time by scripts/demo-gen-ledger.mjs so the demo card shows up instantly
  d.exec(LEDGER_SQL);
  const ledger = fs.existsSync(path.join(SRC(), "ledger.json")) ? read<Record<string, { who: string; result: string; proof: number | null; reason: string | null }>>("ledger.json") : {};
  const insL = d.prepare("INSERT OR REPLACE INTO ledger(item_id,who,ai,reason,proof_mid,proof_ts,proof_sender,proof_text,checked_at) VALUES(?,?,?,?,?,?,?,?,?)");
  for (const s of sessions) for (const x of items[s.id] ?? []) {
    const l = ledger[x.tmp], id = ids.get(x.tmp);
    if (!l || id == null) continue;
    const m = l.proof ? s.messages[l.proof - 1] : undefined;
    insL.run(id, l.who, l.result, l.reason, m ? String(l.proof) : null, m ? `${dateOf(m[0])} ${m[1]}` : null, m ? (m[2] === "A" ? "我" : m[2] === "M" ? MEMO : s.name) : null, m ? m[3] : null, now);
  }

  // 4) analysis: items in the file are indexes into that person's list
  const ins = d.prepare("INSERT OR REPLACE INTO person_analysis(session_id,content,basis_items,basis_until,generated_at) VALUES(?,?,?,?,?)");
  for (const s of sessions) {
    const a = analysis[s.id]; if (!a) continue;
    const list = items[s.id] ?? [];
    const sections = a.sections.map((sec) => ({ title: sec.title, points: sec.points.map((p) => ({ text: p.text, basis: p.basis === "fact" ? "fact" : "inference",
      items: (p.items ?? []).map((i) => ids.get(list[i]?.tmp ?? "")).filter((v): v is number => v != null) })) }));
    ins.run(s.id, JSON.stringify({ summary: a.summary, sections }), list.length, now, now);
  }
}

// [图片] / [表情] / [语音] placeholders get the matching message type, so the chat report counts them right
function typeOf(text: string) {
  const t = text.trim();
  return /^\[(图片|写真|照片)\]$/.test(t) ? 1 : /^\[(表情|スタンプ|动画表情)\]$/.test(t) ? 5 : /^\[(语音|ボイスメッセージ)\]$/.test(t) ? 2 : /^\[(视频通话|语音通话|通話)/.test(t) ? 23 : 0;
}

// 有日期的事项之后由 maintain() 按天重算；这里给没日期的一个合理初值
function initialCategory(x: Ex, lastOff: number): string {
  if (x.event_day != null) return x.event_day >= 0 && x.event_day <= 7 ? "urgent" : "later";
  if (x.certainty === "uncertain") return "potential";
  if (x.kind === "promise") return lastOff >= -7 ? "urgent" : "forgotten";
  if (x.kind === "pending") return lastOff >= -3 ? "urgent" : "potential";
  if (x.kind === "concern") return "potential";
  return "later";
}
