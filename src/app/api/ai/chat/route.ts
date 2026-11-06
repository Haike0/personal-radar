import { provider } from "@/lib/ai";
import { assistantOf } from "@/lib/ai/assistants";
import { appendMessage, createConversation, getConversation, setAssistant } from "@/lib/ai/conversations";
import { scopePerson, type Citation, type CompanionContext, type StreamEvent } from "@/lib/ai/types";
import { getItem } from "@/lib/db";

/** body: { question, context, assistant, conversationId? } — history is read from (and saved to) the local DB */
export async function POST(req: Request) {
  const { question, context, assistant, conversationId } = (await req.json()) as {
    question: string; context?: CompanionContext; assistant?: string; conversationId?: number | null;
  };
  const q = String(question ?? "").trim();
  if (!q) return Response.json({ error: "empty question" }, { status: 400 });
  const ctx: CompanionContext = context ?? { page: "home" };
  const a = assistantOf(assistant).id;
  // conversations are filed under the person they're about (an item's person too), with their exact scope
  const person = scopePerson(ctx) ?? (ctx.page === "item" ? getItem(ctx.itemId)?.personKey ?? null : null);
  const id = conversationId && getConversation(conversationId) ? conversationId : createConversation(person, a, q, ctx);
  const prior = getConversation(id)!;
  if (prior.assistant !== a) setAssistant(id, a);
  const history = [...prior.items.map(({ role, content }) => ({ role, content })), { role: "user" as const, content: q }];
  appendMessage(id, "user", q);

  const p = provider();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (ev: StreamEvent) => ctrl.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      send({ type: "conversation", id });
      let answer = "";
      let cites: Citation[] | undefined;
      try {
        for await (const ev of p.respond(history.slice(-12), ctx, a)) {
          if (ev.type === "text") answer += ev.delta;
          if (ev.type === "citations") cites = ev.items;
          send(ev);
        }
      } catch (e) {
        const msg = `\n出错了：${(e as Error).message}`;
        answer += msg;
        send({ type: "text", delta: msg });
      }
      if (answer.trim()) appendMessage(id, "assistant", answer, cites);
      ctrl.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
