import { connection, type NextRequest } from "next/server";
import { editItem, getItem } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/items/[id]">) {
  await connection();
  const it = getItem(Number((await ctx.params).id));
  return it ? Response.json(it) : Response.json({ error: "not found" }, { status: 404 });
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/items/[id]">) {
  const id = Number((await ctx.params).id);
  try {
    const historyId = editItem(id, await req.json());
    return Response.json({ historyId, item: getItem(id) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
