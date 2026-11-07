import { DEMO_ONLY, demoOnlyResponse } from "@/lib/config";
import { testAi } from "@/lib/ai-check";

/** 测试连接: one tiny request to check the address, key and model name. {id, model} or {baseUrl, key, model}. */
export async function POST(req: Request) {
  if (DEMO_ONLY) return demoOnlyResponse();
  try {
    return Response.json(await testAi(await req.json()));
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message });
  }
}
