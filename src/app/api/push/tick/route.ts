import { tick } from "@/lib/notifier";

// Called every minute by the in-process scheduler (src/instrumentation.ts). Requests through Tailscale Serve also come
// from 127.0.0.1, so the address can't tell them apart: a per-process random token is required instead.
export async function POST(req: Request) {
  const token = (globalThis as { __radarTickToken?: string }).__radarTickToken;
  if (!token || req.headers.get("x-radar-tick") !== token) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    return Response.json(await tick());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
