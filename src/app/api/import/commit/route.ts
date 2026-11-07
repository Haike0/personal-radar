import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { commit } from "@/lib/importer";

export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  try {
    const b = (await req.json()) as { token: string; choices: { key: string; me?: string; name?: string }[] };
    return Response.json(commit(b.token, b.choices ?? []));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
