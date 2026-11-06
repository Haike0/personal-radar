import { connection, type NextRequest } from "next/server";
import * as chatlab from "@/lib/chatlab";
import { listPeople } from "@/lib/db";
import { day, days, summarize } from "@/lib/memory";

//   GET            → day list (messages per day, records learned that day, saved summary)
//   GET ?date=D    → that day's messages, records and summary
//   GET ?q=word    → messages containing the word (text and voice transcripts), newest first
//   POST {date}    → make (or remake) that day's summary with DeepSeek
export async function GET(req: NextRequest, ctx: RouteContext<"/api/people/[key]/memory">) {
  await connection();
  const key = decodeURIComponent((await ctx.params).key);
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  if (q) return Response.json({ q, messages: chatlab.search(key, q, 200) });
  const date = sp.get("date");
  if (date) return Response.json(day(key, date));
  return Response.json({ days: days(key) });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/people/[key]/memory">) {
  const key = decodeURIComponent((await ctx.params).key);
  const { date } = (await req.json()) as { date?: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "bad date" }, { status: 400 });
  const name = listPeople().find((p) => p.key === key)?.name ?? "对方";
  const s = await summarize(key, name, date);
  if (!s) return Response.json({ error: "没能生成摘要（AI 服务没有响应，或这天没有文字消息）" }, { status: 502 });
  return Response.json({ summary: s });
}
