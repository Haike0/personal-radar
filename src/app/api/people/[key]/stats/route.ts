import { connection, type NextRequest } from "next/server";
import { chatStats } from "@/lib/chatlab";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/people/[key]/stats">) {
  await connection();
  const key = decodeURIComponent((await ctx.params).key);
  return Response.json({ stats: chatStats(key) });
}
