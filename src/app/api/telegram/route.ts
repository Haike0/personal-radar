import { connection } from "next/server";
import { setSettings } from "@/lib/db";
import { logout, password, sendCode, signIn, startLive, status, sync } from "@/lib/telegram";

export async function GET() {
  await connection();
  return Response.json(await status());
}

/**
 * body: { action: "keys", apiId, apiHash } | { action: "code", phone } | { action: "signin", code } | { action: "password", password }
 *     | { action: "chats", ids } | { action: "on", on } | { action: "sync" } | { action: "logout" }
 */
export async function POST(req: Request) {
  const b = (await req.json()) as Record<string, unknown>;
  switch (b.action) {
    case "keys":
      if (!/^\d{3,12}$/.test(String(b.apiId ?? "")) || !/^[0-9a-f]{32}$/i.test(String(b.apiHash ?? ""))) return Response.json({ ok: false, error: "api_id 是一串数字，api_hash 是 32 位字母数字" }, { status: 400 });
      setSettings({ tg_api_id: String(b.apiId), tg_api_hash: String(b.apiHash) });
      return Response.json({ ok: true });
    case "code": return Response.json(await sendCode(String(b.phone ?? "")));
    case "signin": return Response.json(await signIn(String(b.code ?? "")));
    case "password": return Response.json(await password(String(b.password ?? "")));
    case "chats": setSettings({ tg_chats: JSON.stringify((b.ids as string[] | undefined)?.map(String) ?? []) }); return Response.json({ ok: true });
    case "on": {
      setSettings({ tg_on: b.on ? "on" : "off" });
      if (b.on) { const r = await sync(); await startLive().catch(() => false); return Response.json(r); }
      return Response.json({ ok: true });
    }
    case "sync": return Response.json(await sync());
    case "logout": await logout(); return Response.json({ ok: true });
  }
  return Response.json({ error: "action" }, { status: 400 });
}
