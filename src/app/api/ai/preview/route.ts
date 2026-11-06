import { material } from "@/lib/ai/deepseek";
import type { CompanionContext } from "@/lib/ai/types";

/** Shows exactly what a question would send to the cloud model — nothing is sent. */
export async function POST(req: Request) {
  const { question, context } = (await req.json()) as { question?: string; context?: CompanionContext };
  const q = String(question ?? "").trim() || "最近有什么值得我注意的？";
  const m = material(q, context ?? { page: "home" });
  return Response.json({ question: q, people: m.people, text: m.text, chars: m.text.length });
}
