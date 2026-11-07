import "server-only";
import * as chatlab from "./chatlab";
import { complete } from "./ai/deepseek";
import { isExcluded } from "./ai-config";
import { db, listItems, nowStr } from "./db";
import type { Item } from "./types";

// 聊天记忆: one person's chat by day. Raw messages are read live from the chat databases (read-only);
// the only thing stored here is the optional one-day summary, made by your AI service the first time you ask for it.

let ready = false;
function d() {
  const x = db();
  if (!ready) {
    x.exec("CREATE TABLE IF NOT EXISTS day_summary(session_id TEXT NOT NULL, date TEXT NOT NULL, summary TEXT NOT NULL, messages INTEGER NOT NULL, generated_at TEXT NOT NULL, PRIMARY KEY(session_id, date))");
    ready = true;
  }
  return x;
}
type Row = Record<string, unknown>;

const learnedOn = (items: Item[], date: string) => items.filter((i) => i.status !== "ignored" && i.observedAt?.slice(0, 10) === date);

export function days(key: string) {
  const items = listItems({ person: key });
  const perDay = new Map<string, number>();
  for (const i of items) if (i.observedAt && i.status !== "ignored") perDay.set(i.observedAt.slice(0, 10), (perDay.get(i.observedAt.slice(0, 10)) ?? 0) + 1);
  const sums = new Map((d().prepare("SELECT date, summary FROM day_summary WHERE session_id=?").all(key) as Row[]).map((r) => [String(r.date), String(r.summary)]));
  return chatlab.dayCounts(key).map((x) => ({ ...x, items: perDay.get(x.date) ?? 0, summary: sums.get(x.date) ?? null }));
}

export function day(key: string, date: string) {
  const s = d().prepare("SELECT summary, messages, generated_at FROM day_summary WHERE session_id=? AND date=?").get(key, date) as Row | undefined;
  return {
    date, messages: chatlab.dayMessages(key, date), items: learnedOn(listItems({ person: key }), date),
    summary: s ? { text: String(s.summary), messages: Number(s.messages), at: String(s.generated_at) } : null,
  };
}

/** Summarize one day with the AI service (only that day's messages are sent) and keep it. */
export async function summarize(key: string, name: string, date: string) {
  if (isExcluded(key)) return null; // set to "不发给 AI" in 设置 → 隐私
  const msgs = chatlab.dayMessages(key, date, 800).filter((m) => m.text.trim() && !/^\[(表情|图片|动画表情)\]$/.test(m.text));
  if (!msgs.length) return null;
  const text = msgs.map((m) => `(${m.ts.slice(11)} ${m.sender}) ${m.text.replace(/\s+/g, " ").slice(0, 120)}`).join("\n");
  const out = await complete(
    `你在帮用户（下文“我”）回顾和${name}某一天的聊天。用 1–3 句中文写这一天聊了什么、发生了什么、有没有约定或情绪变化。只写聊天里有的，不猜；人称用“你”和“${name}”。不加标题、不分点。`,
    `${date} 的聊天：\n${text}`, 220);
  if (!out) return null;
  d().prepare("INSERT OR REPLACE INTO day_summary(session_id,date,summary,messages,generated_at) VALUES(?,?,?,?,?)").run(key, date, out, msgs.length, nowStr());
  return out;
}
