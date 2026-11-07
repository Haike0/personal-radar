import { DEMO_ONLY } from "@/lib/config";
import { connection } from "next/server";
import { listSessions } from "@/lib/chatlab";
import { getSetting, setDemoSet, setSettings } from "@/lib/db";

// Has this install been set up? Existing installs that already have chats count as set up.
export async function GET() {
  await connection();
  if (DEMO_ONLY) return Response.json({ onboarded: true, state: "demo", demoOnly: true });
  const v = getSetting("onboarded");
  return Response.json({ onboarded: Boolean(v) || listSessions("real").length > 0, state: v || null });
}

export async function POST(req: Request) {
  const { state, demo_set } = (await req.json()) as { state?: string; demo_set?: string };
  if (state !== "demo" && state !== "done") return Response.json({ error: "state must be demo or done" }, { status: 400 });
  setSettings({ onboarded: state, ...(state === "demo" ? { mode: "demo" } : {}) });
  // picking a scenario on the welcome page loads that demo
  if (state === "demo" && (demo_set === "love" || demo_set === "work" || demo_set === "night") && getSetting("demo_set") !== demo_set) {
    setSettings({ demo_set }); setDemoSet(demo_set);
  }
  return Response.json({ ok: true });
}
