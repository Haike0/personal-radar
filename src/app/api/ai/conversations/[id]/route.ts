import { connection } from "next/server";
import { deleteConversation, getConversation } from "@/lib/ai/conversations";

export async function GET(_req: Request, ctx: RouteContext<"/api/ai/conversations/[id]">) {
  await connection();
  const c = getConversation(Number((await ctx.params).id));
  return c ? Response.json(c) : Response.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/ai/conversations/[id]">) {
  deleteConversation(Number((await ctx.params).id));
  return Response.json({ ok: true });
}
