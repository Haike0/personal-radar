import { connection } from "next/server";
import { listSessions } from "@/lib/chatlab";
import { getSetting, setSettings } from "@/lib/db";

// Has this install been set up? Existing installs that already have chats count as set up.
export async function GET() {
  await connection();
  const v = getSetting("onboarded");
  return Response.json({ onboarded: Boolean(v) || listSessions("real").length > 0, state: v || null });
}

export async function POST(req: Request) {
  const { state } = (await req.json()) as { state?: string };
  if (state !== "demo" && state !== "done") return Response.json({ error: "state must be demo or done" }, { status: 400 });
  setSettings({ onboarded: state, ...(state === "demo" ? { mode: "demo" } : {}) });
  return Response.json({ ok: true });
}
