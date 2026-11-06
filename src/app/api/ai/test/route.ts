import { testAi } from "@/lib/ai-check";

export async function POST(req: Request) {
  try {
    return Response.json(await testAi(await req.json()));
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message });
  }
}
