import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { isKnowledge, unreviewed, type PersonProfile, type Category, type Certainty, type Evidence, type HistoryEntry, type Item, type ItemDetail, type Kind, type Mode, type Person, type Status } from "./types";
import { reseedDemo, seedDemo, type DemoSet } from "./seed-demo";
import * as chatlab from "./chatlab";

// Business data only (events, status, evidence refs, edits). Raw chat history stays in the chat databases (see chatlab.ts).
// Stored under DATA_DIR (default ~/.personal-radar).
import { DATA_DIR } from "./config";
import { migrateLegacy } from "../../scripts/lib/ai-services.mjs";
const DB_PATH = path.join(DATA_DIR, "radar.db");

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS items(
  id INTEGER PRIMARY KEY,
  mode TEXT NOT NULL,
  source_key TEXT,                 -- stable dedupe key from the extractor (mode+source_key unique)
  person_key TEXT NOT NULL, person_name TEXT NOT NULL, is_group INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL, summary TEXT, why TEXT, next_step TEXT,
  category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', certainty TEXT NOT NULL, kind TEXT NOT NULL,
  event_date TEXT, event_time TEXT, snooze_until TEXT, supersedes_id INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(mode, source_key));
CREATE TABLE IF NOT EXISTS evidence(
  id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  session_id TEXT, message_id TEXT, ts TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL,
  is_key INTEGER NOT NULL DEFAULT 1, ord INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS history(
  id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  action TEXT NOT NULL, actor TEXT NOT NULL DEFAULT 'user', note TEXT,
  before_json TEXT NOT NULL, after_json TEXT NOT NULL, at TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_items_mode ON items(mode, status, category);
CREATE INDEX IF NOT EXISTS idx_evidence_item ON evidence(item_id, ord);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  mode: "demo",
  demo_set: "life",
  quiet_start: "23:00",
  quiet_end: "08:00",
  digest_time: "09:00",
  daily_push_cap: "3",
  notify_urgent: "on",
  notify_overdue: "on",
  notify_digest: "on",
  notify_snooze: "on",
  remind_days_before: "1",
  ai_provider: "mock",
  ai_share_evidence: "minimal",
  bark_server: "https://api.day.app",
  bark_key: "",
  bark_encrypt_key: "",
  // AI model services (OpenAI-compatible). Keys are never stored here: they live in <data folder>/keys.json.
  ai_services: "[]",   // services you added: [{id, name, baseUrl, models}]
  ai_chat: "",         // "serviceId|model" for Q&A; empty = default (RADAR_AI_* from .env.local if set, else DeepSeek)
  ai_fast: "",         // "serviceId|model" for organizing chats and day summaries
  // what may leave the computer (see scripts/lib/redact.mjs)
  privacy_rules: '["secrets","contact","finance","ids","network"]',
  privacy_keywords: "[]",
  privacy_custom: "[]",
  ai_excluded: "[]",
  // organizing: off until you turn it on (it spends your API credit); times are local, comma-separated
  organize_auto: "off",
  organize_times: "21:50",
  // ChatLab local API (optional)
  chatlab_api_url: "http://127.0.0.1:3110",
  chatlab_api_token: "",
  chatlab_sessions: "[]",
  // Beeper Desktop local API (optional): one app that connects WhatsApp, Telegram, Signal, iMessage…
  beeper_api_url: "http://localhost:23373",
  beeper_api_token: "",
  beeper_chats: "[]",
  // any tool that speaks the ChatLab Pull protocol
  pull_api_url: "",
  pull_api_token: "",
  pull_sessions: "[]",
  // automatic import: pull connected platforms every N hours; import new export files dropped into a folder
  hub_sync: "6",
  hub_sync_last: "",
  watch_dir: "",
  watch_on: "off",
  watch_last: "",
  // first run: "" → show the welcome page; "demo" = chose to look around; "done" = finished setup
  onboarded: "",
  update_check: "on",
};

let _db: DatabaseSync | null = null;
/** Close the database handle (before deleting the data files); the next db() call starts fresh. */
export function closeDb() { try { _db?.close(); } catch {} _db = null; }
export function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const d = new DatabaseSync(DB_PATH);
  d.exec(SCHEMA);
  for (const col of ["observed_at TEXT", "subject TEXT NOT NULL DEFAULT 'them'", "facet TEXT", "origin TEXT", "review TEXT", "milestone INTEGER"])
    try { d.exec(`ALTER TABLE items ADD COLUMN ${col}`); } catch { /* already there */ }
  d.exec(`UPDATE items SET facet=CASE kind WHEN 'preference' THEN '喜好' WHEN 'need' THEN '明确需求' WHEN 'fact' THEN '近况' END WHERE mode='demo' AND facet IS NULL AND kind IN ('preference','need','fact')`);
  d.exec(`UPDATE items SET observed_at=(SELECT MAX(ts) FROM evidence e WHERE e.item_id=items.id AND e.is_key=1 AND e.ts<>'') WHERE observed_at IS NULL AND mode='demo'`);
  migrateSettings(d);
  const ins = d.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  const has = d.prepare("SELECT 1 FROM items WHERE mode='demo' LIMIT 1").get();
  if (!has) seedDemo(d, ((d.prepare("SELECT value FROM settings WHERE key='demo_set'").get() as { value?: string } | undefined)?.value ?? "life") as DemoSet);
  try {
    fs.chmodSync(DB_PATH, 0o600);
  } catch {}
  _db = d;
  return d;
}

/** Settings renamed over time: carry old values over once, then drop the old rows. */
function migrateSettings(d: DatabaseSync) {
  migrateLegacy(d, DATA_DIR); // single AI endpoint (key in this database) → services + keys.json
  const old = (k: string) => (d.prepare("SELECT value FROM settings WHERE key=?").get(k) as { value?: string } | undefined)?.value;
  const on = old("auto_organize"), at = old("auto_organize_time");
  if (on !== undefined || at !== undefined) {
    const put = d.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
    if (on !== undefined) put.run("organize_auto", on === "on" ? "on" : "off");
    if (at && /^\d{2}:\d{2}$/.test(at)) put.run("organize_times", at);
    d.exec("DELETE FROM settings WHERE key IN ('auto_organize','auto_organize_time','last_auto_organize')");
  }
}

export const nowStr = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
export const todayStr = () => nowStr().slice(0, 10);

type Row = Record<string, unknown>;
function toItem(r: Row): Item {
  return {
    id: Number(r.id),
    mode: r.mode as Mode,
    personKey: String(r.person_key),
    personName: String(r.person_name),
    isGroup: Boolean(r.is_group),
    title: String(r.title),
    summary: (r.summary as string) ?? null,
    why: (r.why as string) ?? null,
    nextStep: (r.next_step as string) ?? null,
    category: r.category as Category,
    status: r.status as Status,
    certainty: r.certainty as Certainty,
    kind: r.kind as Kind,
    eventDate: (r.event_date as string) ?? null,
    eventTime: (r.event_time as string) ?? null,
    snoozeUntil: (r.snooze_until as string) ?? null,
    supersedesId: r.supersedes_id == null ? null : Number(r.supersedes_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    evidenceCount: r.evidence_count == null ? undefined : Number(r.evidence_count),
    observedAt: (r.observed_at as string) ?? null,
    subject: ((r.subject as string) ?? "them") as Item["subject"],
    facet: (r.facet as string) ?? null,
    origin: (r.origin as Item["origin"]) ?? null,
    review: (r.review as Item["review"]) ?? null,
    milestone: r.milestone == null ? null : Boolean(r.milestone),
  };
}

export function getSetting(key: string): string {
  const r = db().prepare("SELECT value FROM settings WHERE key=?").get(key) as Row | undefined;
  return r ? String(r.value) : DEFAULT_SETTINGS[key] ?? "";
}
export function getSettings(): Record<string, string> {
  const rows = db().prepare("SELECT key,value FROM settings").all() as Row[];
  return Object.fromEntries(rows.map((r) => [String(r.key), String(r.value)]));
}
export function setSettings(patch: Record<string, string>) {
  const up = db().prepare("UPDATE settings SET value=? WHERE key=?");
  for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS) up.run(String(v), k);
}
export const currentMode = () => getSetting("mode") as Mode;
/** Switch which fictional demo data the 演示 mode shows (生活 / 夜间接客). */
export function setDemoSet(set: DemoSet) {
  reseedDemo(db(), set);
}

/** Snoozed items whose date has arrived come back as open. */
function wakeSnoozed() {
  db()
    .prepare("UPDATE items SET status='open', snooze_until=NULL, updated_at=? WHERE status='snoozed' AND snooze_until<=?")
    .run(nowStr(), todayStr());
}

const daysUntil = (date: string, today: string) => Math.round((Date.parse(date + "T00:00:00") - Date.parse(today + "T00:00:00")) / 864e5);
let lastMaintain = 0;
/**
 * Keeps derived state honest as days pass (runs at most once a minute, from every read):
 * 1. an item replaced by a newer version (改期/变更/取消) stops being a reminder — and comes back if you reject the replacement;
 * 2. real items' category follows the calendar instead of being frozen at the moment they were organized.
 *    A category you set yourself is never overwritten.
 */
export function maintain(force = false) {
  if (!force && Date.now() - lastMaintain < 60_000) return;
  lastMaintain = Date.now();
  const d = db(), t = nowStr(), today = todayStr();
  const live = "SELECT 1 FROM items n WHERE n.supersedes_id=items.id AND COALESCE(n.review,'')<>'rejected'";
  d.prepare(`UPDATE items SET status='superseded', snooze_until=NULL, updated_at=? WHERE status IN ('open','snoozed') AND EXISTS (${live})`).run(t);
  d.prepare(`UPDATE items SET status='open', updated_at=? WHERE status='superseded' AND NOT EXISTS (${live})`).run(t);

  const userSet = `EXISTS (SELECT 1 FROM history h WHERE h.item_id=items.id AND h.undone=0 AND h.action='edit'
    AND json_extract(h.before_json,'$.category') IS NOT json_extract(h.after_json,'$.category'))`;
  const rows = d.prepare(`SELECT id, kind, certainty, category, review, event_date FROM items
    WHERE status='open' AND event_date IS NOT NULL AND kind IN ('plan','promise','pending','change','concern') AND NOT ${userSet}`).all() as Row[];
  const setCat = d.prepare("UPDATE items SET category=?, updated_at=? WHERE id=?");
  const expire = d.prepare("UPDATE items SET status='expired', updated_at=? WHERE id=?");
  for (const r of rows) {
    const n = daysUntil(String(r.event_date), today);
    const kind = String(r.kind);
    let cat: Category;
    if (r.certainty === "uncertain") cat = "potential";
    // a guess about someone's feelings or needs never becomes "urgent" on its own — only after you confirm it
    else if (kind === "concern" && r.review !== "accepted") cat = n >= 0 && n <= 7 ? "potential" : "later";
    else if (n >= 0) cat = n <= 7 ? "urgent" : "later";
    else if ((kind === "promise" || kind === "pending") && n >= -7) cat = "forgotten"; // 答应了、日子过了、没看到处理
    else if (n >= -2) cat = "urgent"; // keeps the "过了日子还没处理" reminder window (1–2 days)
    else { expire.run(t, Number(r.id)); continue; }
    if (cat !== r.category) setCat.run(cat, t, Number(r.id));
  }
}

export function listItems(opts: { mode?: Mode; person?: string } = {}): Item[] {
  wakeSnoozed();
  maintain();
  const mode = opts.mode ?? currentMode();
  const where = ["i.mode=?", "COALESCE(i.review,'') <> 'rejected'"];
  const args: string[] = [mode];
  if (opts.person) {
    where.push("i.person_key=?");
    args.push(opts.person);
  }
  const rows = db()
    .prepare(
      `SELECT i.*, (SELECT COUNT(*) FROM evidence e WHERE e.item_id=i.id AND e.is_key=1) evidence_count
       FROM items i WHERE ${where.join(" AND ")}
       ORDER BY CASE i.category WHEN 'urgent' THEN 0 WHEN 'forgotten' THEN 1 WHEN 'potential' THEN 2 ELSE 3 END,
                COALESCE(i.event_date,'9999-12-31'), i.id`,
    )
    .all(...args) as Row[];
  return rows.map(toItem);
}

export function getItem(id: number): ItemDetail | null {
  wakeSnoozed();
  maintain();
  const r = db().prepare("SELECT * FROM items WHERE id=?").get(id) as Row | undefined;
  if (!r) return null;
  const it = toItem(r);
  const evRows = db().prepare("SELECT * FROM evidence WHERE item_id=? ORDER BY ord, ts").all(id) as Row[];
  const evidence = it.mode === "real" ? resolveRealEvidence(id, evRows) : evRows.map(
    (e): Evidence => ({
      id: Number(e.id),
      itemId: id,
      sessionId: (e.session_id as string) ?? null,
      messageId: (e.message_id as string) ?? null,
      ts: String(e.ts),
      sender: String(e.sender),
      text: String(e.text),
      isKey: Boolean(e.is_key),
    }),
  );
  const history = (db().prepare("SELECT * FROM history WHERE item_id=? ORDER BY id DESC").all(id) as Row[]).map(
    (h): HistoryEntry => ({
      id: Number(h.id),
      itemId: id,
      action: String(h.action),
      actor: h.actor as "user" | "ai",
      note: (h.note as string) ?? null,
      at: String(h.at),
      undone: Boolean(h.undone),
    }),
  );
  const related = (
    db()
      .prepare("SELECT * FROM items WHERE mode=? AND person_key=? AND id<>? ORDER BY COALESCE(event_date,'0') DESC LIMIT 5")
      .all(it.mode, it.personKey, id) as Row[]
  ).map(toItem);
  const supersedes = it.supersedesId ? getBrief(it.supersedesId) : null;
  const sb = db().prepare("SELECT * FROM items WHERE supersedes_id=?").get(id) as Row | undefined;
  return { ...it, evidence, history, related, supersedes, supersededBy: sb ? toItem(sb) : null };
}
/** Real items store only ChatLab message IDs; text and surrounding context are read live (read-only) from the chat databases. */
function resolveRealEvidence(itemId: number, rows: Row[]): Evidence[] {
  const bySession = new Map<string, string[]>();
  for (const r of rows) {
    const sid = String(r.session_id);
    bySession.set(sid, [...(bySession.get(sid) ?? []), String(r.message_id)]);
  }
  const out = new Map<string, Evidence>();
  let n = 0;
  for (const [sid, ids] of bySession) {
    const keys = new Set(ids);
    const found = new Set(chatlab.getMessages(sid, ids).map((m) => m.messageId));
    for (const mid of ids) {
      for (const m of chatlab.getContext(sid, mid, 2, 2)) {
        const prev = out.get(m.messageId);
        if (prev) { prev.isKey ||= keys.has(m.messageId); continue; }
        out.set(m.messageId, { id: ++n, itemId, sessionId: sid, messageId: m.messageId, ts: m.ts, sender: m.sender, text: m.text, isKey: keys.has(m.messageId) });
      }
      if (!found.has(mid)) out.set(mid, { id: ++n, itemId, sessionId: sid, messageId: mid, ts: "", sender: "—", text: "（在聊天记录里找不到这条消息）", isKey: true });
    }
  }
  return [...out.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}

function getBrief(id: number): Item | null {
  const r = db().prepare("SELECT * FROM items WHERE id=?").get(id) as Row | undefined;
  return r ? toItem(r) : null;
}

/** People's tags (恋人 / 同事 / 同学…), set by you. Stored per mode so demo tags never mix with yours. */
export const TAG_SUGGESTIONS = ["恋人", "家人", "朋友", "同学", "老师", "同事", "上司", "客户", "客人"];
function tagTable() {
  db().exec("CREATE TABLE IF NOT EXISTS person_tags(mode TEXT NOT NULL, person_key TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(mode, person_key, tag))");
  return db();
}
export function tagsOf(mode: Mode): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of tagTable().prepare("SELECT person_key, tag FROM person_tags WHERE mode=? ORDER BY rowid").all(mode) as Row[])
    m.set(String(r.person_key), [...(m.get(String(r.person_key)) ?? []), String(r.tag)]);
  return m;
}
export function setTags(key: string, tags: string[], mode = currentMode()) {
  const d = tagTable();
  d.prepare("DELETE FROM person_tags WHERE mode=? AND person_key=?").run(mode, key);
  const ins = d.prepare("INSERT OR IGNORE INTO person_tags(mode, person_key, tag) VALUES(?,?,?)");
  for (const t of tags.map((x) => x.trim()).filter(Boolean).slice(0, 8)) ins.run(mode, key, t.slice(0, 12));
}

export function listPeople(mode?: Mode): Person[] {
  const md = mode ?? currentMode();
  const items = listItems({ mode: md });
  const m = new Map<string, Person>();
  for (const s of chatlab.listSessions(md))
      m.set(s.id, { key: s.id, name: s.name, isGroup: s.isGroup, messages: s.messages, lastTs: s.lastTs, open: 0, total: 0, latest: null, topTitle: null });
  for (const i of items) {
    const p = m.get(i.personKey) ?? { key: i.personKey, name: i.personName, isGroup: i.isGroup, open: 0, total: 0, latest: null, topTitle: null };
    p.total++;
    if (i.status === "open" && !isKnowledge(i)) {
      p.open++;
      p.topTitle ??= i.title;
    }
    if (i.eventDate && (!p.latest || i.eventDate > p.latest)) p.latest = i.eventDate;
    m.set(i.personKey, p);
  }
  const tags = tagsOf(md);
  for (const p of m.values()) p.tags = tags.get(p.key) ?? [];
  return [...m.values()].sort((a, b) => b.open - a.open || (b.latest ?? "").localeCompare(a.latest ?? ""));
}

// ---- mutations (every change is recorded with a before/after snapshot so it can be undone) ----
const EDITABLE = ["title", "summary", "why", "next_step", "category", "certainty", "kind", "event_date", "event_time"] as const;

function snapshot(id: number): Row {
  return db().prepare("SELECT * FROM items WHERE id=?").get(id) as Row;
}
function record(id: number, action: string, actor: "user" | "ai", note: string | null, before: Row) {
  const after = snapshot(id);
  db()
    .prepare("INSERT INTO history(item_id,action,actor,note,before_json,after_json,at) VALUES(?,?,?,?,?,?,?)")
    .run(id, action, actor, note, JSON.stringify(before), JSON.stringify(after), nowStr());
  return Number((db().prepare("SELECT last_insert_rowid() id").get() as Row).id);
}

export type Action = "followed" | "snooze" | "ignore" | "done" | "cancel" | "reopen" | "accept" | "reject";
export function applyAction(id: number, action: Action, opts: { days?: number; until?: string; actor?: "user" | "ai"; note?: string } = {}) {
  const before = snapshot(id);
  if (!before) throw new Error("not found");
  const t = nowStr();
  const set = (status: Status, snooze: string | null = null) =>
    db().prepare("UPDATE items SET status=?, snooze_until=?, updated_at=? WHERE id=?").run(status, snooze, t, id);
  let note = opts.note ?? null;
  switch (action) {
    case "followed": set("followed"); break;
    case "ignore": set("ignored"); break;
    case "done": set("done"); break;
    case "cancel": set("cancelled"); break;
    case "reopen": set("open"); break;
    case "accept": db().prepare("UPDATE items SET review='accepted', updated_at=? WHERE id=?").run(t, id); break;
    case "reject": db().prepare("UPDATE items SET review='rejected', status='ignored', updated_at=? WHERE id=?").run(t, id); break;
    case "snooze": {
      const until = opts.until ?? addDays(todayStr(), opts.days ?? 3);
      set("snoozed", until);
      note = `延后到 ${until}`;
      break;
    }
  }
  return record(id, action, opts.actor ?? "user", note, before);
}

export function editItem(id: number, patch: Partial<Record<(typeof EDITABLE)[number], string | null>>, actor: "user" | "ai" = "user") {
  const before = snapshot(id);
  if (!before) throw new Error("not found");
  const keys = Object.keys(patch).filter((k): k is (typeof EDITABLE)[number] => (EDITABLE as readonly string[]).includes(k));
  if (!keys.length) throw new Error("nothing to edit");
  const changes = keys.filter((k) => (before[k] ?? null) !== (patch[k] ?? null));
  if (!changes.length) return null;
  db()
    .prepare(`UPDATE items SET ${changes.map((k) => `${k}=?`).join(",")}, updated_at=? WHERE id=?`)
    .run(...changes.map((k) => patch[k] ?? null), nowStr(), id);
  const labels: Record<string, string> = { title: "标题", event_date: "日期", event_time: "时间", category: "分类", certainty: "确定程度", next_step: "建议", summary: "描述", why: "提醒原因", kind: "类型" };
  return record(id, "edit", actor, `修改了${changes.map((k) => labels[k] ?? k).join("、")}`, before);
}

/** Undo a history entry by restoring its "before" snapshot (only the latest active change of that item). */
export function undo(historyId: number) {
  const h = db().prepare("SELECT * FROM history WHERE id=?").get(historyId) as Row | undefined;
  if (!h || h.undone) throw new Error("nothing to undo");
  const latest = db().prepare("SELECT id FROM history WHERE item_id=? AND undone=0 ORDER BY id DESC LIMIT 1").get(h.item_id as number) as Row;
  if (Number(latest.id) !== historyId) throw new Error("only the latest change can be undone");
  const b = JSON.parse(String(h.before_json)) as Row;
  const cols = ["status", "snooze_until", "review", ...EDITABLE];
  db()
    .prepare(`UPDATE items SET ${cols.map((c) => `${c}=?`).join(",")}, updated_at=? WHERE id=?`)
    .run(...cols.map((c) => (b[c] as string | null) ?? null), nowStr(), Number(h.item_id));
  db().prepare("UPDATE history SET undone=1 WHERE id=?").run(historyId);
  return Number(h.item_id);
}

export function addDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00");
  x.setDate(x.getDate() + n);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export function counts(items: Item[]) {
  const open = items.filter((i) => i.status === "open" && !isKnowledge(i));
  const action = open.filter((i) => i.category === "urgent" || i.category === "forgotten").length;
  return {
    action,                                       // 需要行动：近期有截止，或答应了还没做
    review: open.filter(unreviewed).length,       // 待你核对：AI 整理、你还没确认的行动类记录
    watching: open.length - action,               // 持续观察：其余还开着的事
  };
}

export function getProfile(key: string): PersonProfile | null {
  const items = listItems({ person: key });
  const session = chatlab.listSessions(currentMode()).find((s) => s.id === key);
  if (!items.length && !session) return null;
  return {
    key,
    name: session?.name ?? items[0]?.personName ?? key,
    isGroup: session?.isGroup ?? items[0]?.isGroup ?? false,
    chat: session ? chatlab.sessionStats(key) : null,
    items,
    analysis: getAnalysis(key),
    tags: tagsOf(currentMode()).get(key) ?? [],
  };
}

export function getAnalysis(key: string): PersonProfile["analysis"] {
  try {
    const r = db().prepare("SELECT content, basis_items, generated_at FROM person_analysis WHERE session_id=?").get(key) as Row | undefined;
    if (!r) return null;
    const c = JSON.parse(String(r.content));
    return { summary: c.summary, sections: c.sections, basisItems: Number(r.basis_items), generatedAt: String(r.generated_at) };
  } catch {
    return null; // table not created yet (the bridge creates it on first run)
  }
}
