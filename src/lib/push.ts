import "server-only";
import fs from "node:fs";
import path from "node:path";
import webpush, { type PushSubscription } from "web-push";
import { db, nowStr, todayStr } from "./db";

// Web Push straight to the iPhone home-screen app (iOS 16.4+): no third-party app, no extra server.
// The payload is end-to-end encrypted to the phone's subscription keys; Apple's push service only relays ciphertext.
import { DATA_DIR } from "./config";
const VAPID_PATH = path.join(DATA_DIR, "vapid.json");
// Apple rejects VAPID tokens whose subject is not a real mailto:/https: address — set RADAR_PUSH_SUBJECT to your own
const SUBJECT = process.env.RADAR_PUSH_SUBJECT ?? "mailto:radar@example.com";

let ready = false;
function init() {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS push_subs(endpoint TEXT PRIMARY KEY, sub_json TEXT NOT NULL, ua TEXT, created_at TEXT NOT NULL, last_ok TEXT);
    CREATE TABLE IF NOT EXISTS push_log(key TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT, day TEXT NOT NULL, at TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0);
  `);
  const k = vapid();
  webpush.setVapidDetails(SUBJECT, k.publicKey, k.privateKey);
  ready = true;
}

function vapid(): { publicKey: string; privateKey: string } {
  try {
    return JSON.parse(fs.readFileSync(VAPID_PATH, "utf8"));
  } catch {
    const k = webpush.generateVAPIDKeys();
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(VAPID_PATH, JSON.stringify(k), { mode: 0o600 });
    return k;
  }
}

export const publicKey = () => { init(); return vapid().publicKey; };

export function subscribe(sub: PushSubscription, ua: string | null) {
  init();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("订阅信息不完整");
  db().prepare("INSERT INTO push_subs(endpoint,sub_json,ua,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET sub_json=excluded.sub_json, ua=excluded.ua")
    .run(sub.endpoint, JSON.stringify(sub), ua, nowStr());
}
export function unsubscribe(endpoint: string) {
  init();
  db().prepare("DELETE FROM push_subs WHERE endpoint=?").run(endpoint);
}
export function subscriptionCount() {
  init();
  return Number((db().prepare("SELECT COUNT(*) n FROM push_subs").get() as { n: number }).n);
}
export function hasSubscription(endpoint: string) {
  init();
  return Boolean(db().prepare("SELECT 1 FROM push_subs WHERE endpoint=?").get(endpoint));
}

export type Payload = { title: string; body: string; url?: string; tag?: string };

/** Send to every subscribed device. Dead subscriptions (404/410) are removed. */
export async function sendAll(p: Payload, only?: string) {
  init();
  const rows = (only
    ? db().prepare("SELECT endpoint, sub_json FROM push_subs WHERE endpoint=?").all(only)
    : db().prepare("SELECT endpoint, sub_json FROM push_subs").all()) as { endpoint: string; sub_json: string }[];
  let sent = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try {
      // urgency high + a TTL of 12h: delivered promptly, but a reminder that couldn't reach the phone for half a day is dropped
      await webpush.sendNotification(JSON.parse(r.sub_json), JSON.stringify(p), { TTL: 12 * 3600, urgency: "high" });
      db().prepare("UPDATE push_subs SET last_ok=? WHERE endpoint=?").run(nowStr(), r.endpoint);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) db().prepare("DELETE FROM push_subs WHERE endpoint=?").run(r.endpoint);
      errors.push(code ? `HTTP ${code}` : (e as Error).message);
    }
  }
  return { sent, total: rows.length, errors };
}

/** Send once per key (a reminder is never repeated) and keep a log for the settings page and the daily cap. */
export async function sendOnce(key: string, kind: string, p: Payload) {
  init();
  if (db().prepare("SELECT 1 FROM push_log WHERE key=?").get(key)) return "dup" as const;
  // claim the key first so two overlapping ticks can't both send it
  db().prepare("INSERT INTO push_log(key,kind,title,body,day,at) VALUES(?,?,?,?,?,?)").run(key, kind, p.title, p.body, todayStr(), nowStr());
  const r = await sendAll({ ...p, tag: p.tag ?? key });
  // nothing got through (e.g. no network): release the key so the next tick tries again
  if (!r.sent) db().prepare("DELETE FROM push_log WHERE key=?").run(key);
  else db().prepare("UPDATE push_log SET sent=? WHERE key=?").run(r.sent, key);
  return { ok: r.sent > 0, errors: r.errors };
}

export function sentToday() {
  init();
  return Number((db().prepare("SELECT COUNT(*) n FROM push_log WHERE day=? AND kind<>'test'").get(todayStr()) as { n: number }).n);
}
export function recentLog(limit = 5) {
  init();
  return db().prepare("SELECT kind, title, body, at, sent FROM push_log ORDER BY at DESC LIMIT ?").all(limit) as
    { kind: string; title: string; body: string | null; at: string; sent: number }[];
}
