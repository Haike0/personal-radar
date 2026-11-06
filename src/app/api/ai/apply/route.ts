import { applyAction, editItem, getItem } from "@/lib/db";
import type { Proposal } from "@/lib/ai/types";

// Applies an AI proposal ONLY after the user tapped “确认” in the UI. Recorded with actor='ai' and undoable.
export async function POST(req: Request) {
  const p = (await req.json()) as Proposal;
  try {
    let historyId: number | null;
    if (p.type === "edit") historyId = editItem(p.itemId, p.patch ?? {}, "ai");
    else if (p.type === "snooze") historyId = applyAction(p.itemId, "snooze", { days: p.days ?? 3, actor: "ai" });
    else if (["followed", "ignore", "done", "cancel"].includes(p.type)) historyId = applyAction(p.itemId, p.type as "followed" | "ignore" | "done" | "cancel", { actor: "ai", note: p.label ?? null });
    else return Response.json({ error: "unsupported" }, { status: 400 });
    return Response.json({ historyId, item: getItem(p.itemId) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
