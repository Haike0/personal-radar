import type { NextRequest } from "next/server";
import { getItem, undo } from "@/lib/db";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/history/[id]/undo">) {
  try {
    const itemId = undo(Number((await ctx.params).id));
    return Response.json({ item: getItem(itemId) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
