import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { connection } from "next/server";
import { selected, status, sync } from "@/lib/pull-api";
import { getSetting, setSettings } from "@/lib/db";

// ChatLab Pull protocol source; same shape as /api/chatlab-api so one UI component serves all connections.
export async function GET() {
  await connection();
  const url = getSetting("pull_api_url"), hasToken = Boolean(url); // the token is optional for Pull sources; "configured" = has an address
  if (!hasToken) return Response.json({ url, hasToken, connected: false, selected: selected() });
  try {
    return Response.json({ url, hasToken, connected: true, selected: selected(), ...(await status()) });
  } catch (e) {
    return Response.json({ url, hasToken, connected: false, selected: selected(), error: (e as Error).message });
  }
}

export async function PATCH(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  const b = (await req.json()) as { url?: string; token?: string };
  try {
    const s = await status({ url: b.url?.trim(), token: b.token?.trim() });
    setSettings({ ...(b.url ? { pull_api_url: b.url.trim().replace(/\/+$/, "") } : {}), ...(b.token ? { pull_api_token: b.token.trim() } : {}) });
    return Response.json({ ok: true, ...s });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  const b = (await req.json()) as { ids?: string[] };
  return Response.json({ results: await sync(Array.isArray(b.ids) ? b.ids.map(String) : undefined) });
}
