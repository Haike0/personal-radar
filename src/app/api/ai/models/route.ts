import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { listModels } from "@/lib/ai-check";

export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  try {
    return Response.json(await listModels(await req.json()));
  } catch (e) {
    return Response.json({ models: [], error: (e as Error).message });
  }
}
