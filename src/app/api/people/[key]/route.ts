import { connection, type NextRequest } from "next/server";
import { getProfile } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/people/[key]">) {
  await connection();
  const p = getProfile(decodeURIComponent((await ctx.params).key));
  return p ? Response.json(p) : Response.json({ error: "not found" }, { status: 404 });
}
