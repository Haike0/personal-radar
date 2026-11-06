import "server-only";
import { currentMode, db, getSettings, listItems, todayStr } from "./db";
import { pickFocus, trusted } from "./focus";
import { dayDiff, relDate } from "./format";
import { sendOnce, sentToday, subscriptionCount, type Payload } from "./push";
import { isKnowledge, unreviewed, type Item } from "./types";

// Runs every minute (src/instrumentation.ts → /api/push/tick). Every reminder has a unique key and is sent at most once,
// so the tick can run as often as it likes. Quiet hours only delay: whatever is still due goes out when they end.

const mins = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
function inQuiet(now: number, start: string, end: string) {
  const s = mins(start), e = mins(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}
const who = (i: Item) => i.personName.replace(/^演示·/, "");
const line = (i: Item) => (i.nextStep ? `${i.title}\n${i.nextStep}` : i.title) + (unreviewed(i) ? "\n（AI 整理，你还没核对）" : "");

type Candidate = { key: string; kind: string; p: Payload };

export async function tick(): Promise<{ sent: string[]; failed?: string[]; due?: number; skipped?: string }> {
  if (!subscriptionCount()) return { sent: [], skipped: "没有订阅的设备" };
  const s = getSettings();
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  if (inQuiet(now, s.quiet_start, s.quiet_end)) return { sent: [], skipped: "免打扰时段" };
  const cap = Number(s.daily_push_cap || 0);
  let left = cap - sentToday();
  if (left <= 0) return { sent: [], skipped: "今天已达上限" };

  const mode = currentMode();
  // demo data is fictional: never push it to a real phone
  if (mode === "demo") return { sent: [], skipped: "演示数据不推送" };
  const items = listItems({ mode }); // also wakes snoozed items whose date has arrived
  // only items that passed the push rule (see trusted()); unconfirmed guesses stay inside the app
  const open = items.filter((i) => i.status === "open" && !isKnowledge(i) && trusted(i));
  const today = todayStr();
  const before = Math.max(0, Number(s.remind_days_before || 0));
  const out: Candidate[] = [];

  // 1. the day itself
  if (s.notify_urgent === "on")
    for (const i of open) if (i.eventDate && dayDiff(i.eventDate) === 0)
      out.push({ key: `due:${i.id}:${i.eventDate}:day`, kind: "due", p: { title: `今天${i.eventTime ? ` ${i.eventTime}` : ""} · ${who(i)}`, body: line(i), url: `/items/${i.id}` } });

  // 2. snoozed items coming back today
  if (s.notify_snooze === "on") {
    const rows = db().prepare(`
      SELECT i.id, json_extract(h.after_json,'$.snooze_until') until FROM items i
      JOIN history h ON h.id=(SELECT MAX(id) FROM history WHERE item_id=i.id AND undone=0)
      WHERE i.mode=? AND i.status='open' AND h.action='snooze' AND json_extract(h.after_json,'$.snooze_until')=?`).all(mode, today) as { id: number; until: string }[];
    for (const r of rows) {
      const i = open.find((x) => x.id === r.id);
      if (i) out.push({ key: `snooze:${i.id}:${r.until}`, kind: "snooze", p: { title: `延后的事到了 · ${who(i)}`, body: line(i), url: `/items/${i.id}` } });
    }
  }

  // 3. heads-up N days before
  if (s.notify_urgent === "on" && before > 0)
    for (const i of open) if (i.eventDate) {
      const n = dayDiff(i.eventDate);
      if (n >= 1 && n <= before)
        out.push({ key: `due:${i.id}:${i.eventDate}:before`, kind: "due", p: { title: `${relDate(i.eventDate, i.eventTime)} · ${who(i)}`, body: line(i), url: `/items/${i.id}` } });
    }

  // 4. date passed but never handled (only the first couple of days; older ones are history, not news)
  if (s.notify_overdue === "on")
    for (const i of open) if (i.eventDate) {
      const n = dayDiff(i.eventDate);
      if (n < 0 && n >= -2)
        out.push({ key: `over:${i.id}:${i.eventDate}`, kind: "overdue", p: { title: `过了日子还没处理 · ${who(i)}`, body: line(i), url: `/items/${i.id}` } });
    }

  // 5. one daily digest, from digest_time until 6 hours later (so a Mac that was asleep at 9:00 still sends it)
  if (s.notify_digest === "on") {
    const t = mins(s.digest_time || "09:00");
    if (now >= t && now < t + 360) {
      const byPerson = new Map<string, Item[]>();
      for (const i of open) byPerson.set(i.personKey, [...(byPerson.get(i.personKey) ?? []), i]);
      const focus = [...byPerson.values()].flatMap((list) => pickFocus(list));
      if (focus.length)
        out.push({ key: `digest:${today}`, kind: "digest", p: {
          title: `今天值得留意的 ${focus.length} 件事`,
          body: focus.slice(0, 4).map((i) => `${who(i)}：${i.title}`).join("\n"),
          url: "/",
        } });
    }
  }

  const sent: string[] = [], failed: string[] = [];
  for (const c of out) {
    if (left <= 0) break;
    const r = await sendOnce(c.key, c.kind, c.p);
    if (r === "dup") continue;
    if (r.ok) { sent.push(c.key); left--; } else failed.push(`${c.key} (${r.errors.join("; ")})`);
  }
  return { sent, failed, due: out.length };
}
