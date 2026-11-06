export type Category = "urgent" | "later" | "potential" | "forgotten";
export type Status = "open" | "followed" | "snoozed" | "ignored" | "done" | "cancelled" | "expired" | "superseded";
export type Certainty = "confirmed" | "tentative" | "changed" | "cancelled" | "uncertain";
export type Kind = "plan" | "promise" | "need" | "pending" | "preference" | "concern" | "change" | "fact";
export type Mode = "demo" | "real";

export interface Evidence {
  id: number;
  itemId: number;
  sessionId: string | null;
  messageId: string | null;
  ts: string; // "YYYY-MM-DD HH:mm"
  sender: string;
  text: string;
  isKey: boolean; // false = surrounding context
}

export interface HistoryEntry {
  id: number;
  itemId: number;
  action: string;
  actor: "user" | "ai";
  note: string | null;
  at: string;
  undone: boolean;
}

export interface Item {
  id: number;
  mode: Mode;
  personKey: string;
  personName: string;
  isGroup: boolean;
  title: string;
  summary: string | null;
  why: string | null;
  nextStep: string | null;
  category: Category;
  status: Status;
  certainty: Certainty;
  kind: Kind;
  eventDate: string | null; // YYYY-MM-DD
  eventTime: string | null; // HH:mm
  snoozeUntil: string | null;
  supersedesId: number | null;
  createdAt: string;
  updatedAt: string;
  evidenceCount?: number;
  observedAt?: string | null; // when this was learned (latest key message), "YYYY-MM-DD HH:mm"
  subject?: Subject;            // who the item is about
  facet?: string | null;        // portrait group for knowledge items (作息与工作 / 情况 / 喜好 / 明确需求 / 相处约定 …)
  origin?: "label" | "ai" | null; // ai = organized by the background Claude task, awaiting review
  review?: "pending" | "accepted" | "rejected" | null;
  /** for 近况 (kind fact): true = a real event in their life (换工作、搬家、生病…) → shown on the timeline; false = a small detail (有驾照) → only in their portrait; null = not sorted yet */
  milestone?: boolean | null;
}
export type Subject = "them" | "self" | "both";

export interface ItemDetail extends Item {
  evidence: Evidence[];
  history: HistoryEntry[];
  related: Item[];
  supersedes: Item | null;
  supersededBy: Item | null;
}

export interface Person {
  key: string;
  name: string;
  isGroup: boolean;
  messages?: number;
  lastTs?: number | null;
  open: number;
  total: number;
  latest: string | null;
  topTitle: string | null;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  urgent: "紧急",
  later: "不紧急",
  potential: "潜在关注",
  forgotten: "可能遗忘",
};
export const CATEGORY_HINT: Record<Category, string> = {
  urgent: "近期有截止，或答应过还没兑现",
  later: "需要记住，暂时可以放一放",
  potential: "AI 从聊天里发现的，需要你判断",
  forgotten: "之前确认过，之后没看到处理记录",
};
export const STATUS_LABEL: Record<Status, string> = {
  open: "待处理",
  followed: "已关心",
  snoozed: "已延后",
  ignored: "已忽略",
  done: "已完成",
  cancelled: "已取消",
  expired: "已过去",
  superseded: "已有新版本",
};
export const CERTAINTY_LABEL: Record<Certainty, string> = {
  confirmed: "已确认",
  tentative: "待定",
  changed: "已变更",
  cancelled: "已取消",
  uncertain: "待判断",
};
export const KIND_LABEL: Record<Kind, string> = {
  plan: "安排",
  promise: "承诺",
  need: "明确需求",
  pending: "待回复",
  preference: "偏好",
  concern: "值得关心",
  change: "改期",
  fact: "近况",
};

/** Things you know about a person (shown on their page), as opposed to things to act on (shown on Today). */
export const KNOWLEDGE_KINDS: Kind[] = ["fact", "preference", "need"];
export const isKnowledge = (i: { kind: Kind }) => KNOWLEDGE_KINDS.includes(i.kind);
/** AI-organized and not yet checked by the user ("待你核对" — not the same as 对方还没定 = certainty tentative). */
export const unreviewed = (i: { origin?: Item["origin"]; review?: Item["review"] }) => i.origin === "ai" && i.review === "pending";

export interface PersonProfile {
  key: string;
  name: string;
  isGroup: boolean;
  chat: { messages: number; firstAt: string | null; lastAt: string | null; last30: number; mineShare: number | null } | null;
  items: Item[];
  analysis: PersonAnalysis | null;
}
export interface PersonAnalysis {
  summary: string;
  sections: { title: string; points: { text: string; basis: "fact" | "inference"; items: number[] }[] }[];
  basisItems: number;
  generatedAt: string;
}
