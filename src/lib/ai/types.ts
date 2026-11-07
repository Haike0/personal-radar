export type CompanionContext =
  | { page: "home" | "timeline" | "people" | "settings" | "companion" }
  | { page: "item"; itemId: number; title?: string; personName?: string; personKey?: string }
  | { page: "person"; personKey: string; personName?: string }
  /** everyone carrying one tag (恋人 / 同事…): the AI reads only those people */
  | { page: "tag"; tag: string }
  /** one day of one person's chat (from 聊天记忆): the AI reads only that day */
  | { page: "day"; personKey: string; personName?: string; date: string };

/** What the AI is reading, in words — shown at the top of the chat so you always know its scope. */
export function scopeLabel(c: CompanionContext): string {
  if (c.page === "day") { const [, m, d] = c.date.split("-"); return `${c.personName ?? ""} · ${Number(m)}月${Number(d)}日的聊天`; }
  if (c.page === "item") return `${c.personName ? c.personName + " · " : ""}这件事：${c.title ?? ""}`;
  if (c.page === "person") return c.personName ?? "这个人";
  if (c.page === "tag") return `标签：${c.tag}`;
  return "所有人";
}
/** Changing this resets the chat to a fresh conversation (a different scope is a different conversation). */
export const scopeKey = (c: CompanionContext) =>
  c.page === "day" ? `day:${c.personKey}:${c.date}` : c.page === "item" ? `item:${c.itemId}` : c.page === "person" ? `person:${c.personKey}` : c.page === "tag" ? `tag:${c.tag}` : "all";
/** The person a scope belongs to (conversations are filed under them). */
export const scopePerson = (c: CompanionContext) => (c.page === "person" || c.page === "day" ? c.personKey : null);

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Citation {
  itemId: number;
  title: string;
  personName: string;
  quote?: { ts: string; sender: string; text: string };
}

/** A change the AI suggests. Nothing is applied until the user taps “确认”. */
export interface Proposal {
  id: string;
  label: string;
  itemId: number;
  type: "followed" | "snooze" | "ignore" | "done" | "cancel" | "edit";
  days?: number;
  patch?: Record<string, string | null>;
}

export type StreamEvent =
  | { type: "meta"; provider: string; simulated: boolean; model?: string }
  | { type: "conversation"; id: number }
  | { type: "text"; delta: string }
  | { type: "citations"; items: Citation[] }
  | { type: "proposals"; items: Proposal[] }
  | { type: "draft"; text: string }
  | { type: "done" };

export interface CompanionProvider {
  name: string;
  simulated: boolean;
  respond(history: ChatTurn[], ctx: CompanionContext, assistant?: string): AsyncGenerator<StreamEvent>;
}
