import { connection } from "next/server";
import { selected, status, sync } from "@/lib/chatlab-api";
import { getSetting, setSettings } from "@/lib/db";

// GET → connection status + conversation list (with which ones are selected)
export async function GET() {
  await connection();
  const url = getSetting("chatlab_api_url"), hasToken = Boolean(getSetting("chatlab_api_token"));
  if (!hasToken) return Response.json({ url, hasToken, connected: false, selected: selected() });
  try {
    return Response.json({ url, hasToken, connected: true, selected: selected(), ...(await status()) });
  } catch (e) {
    return Response.json({ url, hasToken, connected: false, selected: selected(), error: (e as Error).message });
  }
}

// PATCH {url?, token?} → test, then save   ·   POST {ids} → copy those conversations now
export async function PATCH(req: Request) {
  const b = (await req.json()) as { url?: string; token?: string };
  try {
    const s = await status({ url: b.url?.trim(), token: b.token?.trim() });
    setSettings({ ...(b.url ? { chatlab_api_url: b.url.trim() } : {}), ...(b.token ? { chatlab_api_token: b.token.trim() } : {}) });
    return Response.json({ ok: true, ...s });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const b = (await req.json()) as { ids?: string[] };
  return Response.json({ results: await sync(Array.isArray(b.ids) ? b.ids.map(String) : undefined) });
}
