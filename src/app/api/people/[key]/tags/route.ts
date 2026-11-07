import { type NextRequest } from "next/server";
import { setTags, TAG_SUGGESTIONS } from "@/lib/db";

export async function GET() {
  return Response.json({ suggestions: TAG_SUGGESTIONS });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/people/[key]/tags">) {
  const key = decodeURIComponent((await ctx.params).key);
  const { tags } = (await req.json()) as { tags?: string[] };
  setTags(key, Array.isArray(tags) ? tags.map(String) : []);
  return Response.json({ ok: true });
}
