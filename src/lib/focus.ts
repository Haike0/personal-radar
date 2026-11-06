import { dayDiff } from "@/lib/format";
import { isKnowledge, type Category, type Item } from "@/lib/types";

export const ORDER: Category[] = ["urgent", "forgotten", "potential", "later"];

// Only fresh suggestions belong in "today": an AI guess first mentioned weeks ago is not today's focus.
const fresh = (i: Item) => i.category !== "potential" || (i.observedAt != null && -dayDiff(i.observedAt.slice(0, 10)) <= 7);

/** Up to 3 open, actionable items that deserve attention today (shared by Today and the contacts list). */
export function pickFocus(items: Item[]) {
  const open = items.filter((i) => !isKnowledge(i) && i.status === "open");
  const rank = (i: Item) => ORDER.indexOf(i.category) * 1000 + (i.eventDate ? Math.min(999, Math.max(0, Date.parse(i.eventDate) / 864e5 - Date.now() / 864e5)) : 500);
  return open.filter((i) => i.category !== "later" && fresh(i)).sort((a, b) => rank(a) - rank(b)).slice(0, 3);
}

const ACTION_KINDS = ["plan", "promise", "pending", "change"];
/**
 * May this item interrupt you with a push notification?
 * Anything you confirmed (or added yourself) may. An AI-organized item you haven't checked may only when it is a
 * concrete commitment — a plan/promise/reply/change with a stated date, marked confirmed, backed by a quoted message.
 * Guesses (uncertain, tentative, feelings/needs) stay inside the app until you confirm them.
 */
export function trusted(i: Item) {
  if (i.review === "rejected") return false;
  if (i.origin !== "ai" || i.review === "accepted") return true;
  return ACTION_KINDS.includes(i.kind) && (i.certainty === "confirmed" || i.certainty === "changed") && !!i.eventDate && (i.evidenceCount ?? 0) > 0;
}
