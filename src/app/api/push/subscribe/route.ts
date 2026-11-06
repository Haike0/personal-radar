import { subscribe, unsubscribe } from "@/lib/push";

export async function POST(req: Request) {
  try {
    const { subscription } = await req.json();
    subscribe(subscription, req.headers.get("user-agent"));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { endpoint } = await req.json();
  if (endpoint) unsubscribe(String(endpoint));
  return Response.json({ ok: true });
}
