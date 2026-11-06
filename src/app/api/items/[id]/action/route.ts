import type { NextRequest } from "next/server";
import { applyAction, getItem, type Action } from "@/lib/db";

const ALLOWED: Action[] = ["followed", "snooze", "ignore", "done", "cancel", "reopen", "accept", "reject"];

export async function POST(req: NextRequest, ctx: RouteContext<"/api/items/[id]/action">) {
  const id = Number((await ctx.params).id);
  const body = await req.json();
  if (!ALLOWED.includes(body.action)) return Response.json({ error: "unknown action" }, { status: 400 });
  try {
    const historyId = applyAction(id, body.action, { days: body.days, until: body.until });
    return Response.json({ historyId, item: getItem(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
