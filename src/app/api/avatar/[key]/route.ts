import { connection, type NextRequest } from "next/server";
import { demoAvatar } from "@/lib/demo-avatars";

// Only the fictional demo people have pictures; everyone else falls back to their initial in the UI.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/avatar/[key]">) {
  await connection();
  const key = decodeURIComponent((await ctx.params).key);
  const svg = demoAvatar(key);
  if (svg) return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=86400" } });
  return new Response(null, { status: 404 });
}
