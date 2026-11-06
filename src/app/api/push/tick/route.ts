import { tick } from "@/lib/notifier";
import { maybeAuto } from "@/lib/organizer";
import { selected, sync } from "@/lib/chatlab-api";

// Called every minute by the in-process scheduler (src/instrumentation.ts). Requests through Tailscale Serve also come
// from 127.0.0.1, so the address can't tell them apart: a per-process random token is required instead.
export async function POST(req: Request) {
  const token = (globalThis as { __radarTickToken?: string }).__radarTickToken;
  if (!token || req.headers.get("x-radar-tick") !== token) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const auto = await maybeAuto(() => (selected().length ? sync() : Promise.resolve()));
    return Response.json({ ...(await tick()), ...(auto ? { autoOrganize: auto } : {}) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
