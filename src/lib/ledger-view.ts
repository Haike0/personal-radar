import { t } from "@/lib/i18n";
// How a ledger row counts, shared by the share card, the home entry and the ledger page.
// The user's own call wins; otherwise the AI's. A promise nobody mentioned again after its day counts as 没下文 (owed).

export type LedgerWho = "me" | "them" | "both";
export type LedgerState = "done" | "not" | "silent" | "waiting" | "skip";
export interface LedgerRowView {
  id: number; title: string; who: LedgerWho; saidAt: string | null; due: string | null; future: boolean;
  quote: { mid: string | null; ts: string; sender: string; text: string } | null;
  ai: { result: "done" | "not" | "unclear"; reason: string | null; proof: { mid: string; ts: string; sender: string; text: string } | null } | null;
  verdict: "done" | "not" | "skip" | null;
}
export type LedgerData = { rows: LedgerRowView[]; unchecked: number; aiReady: boolean };

export function stateOf(r: LedgerRowView): LedgerState {
  if (r.verdict) return r.verdict;
  if (r.ai?.result === "done") return "done";
  if (r.ai?.result === "not") return "not";
  return r.future ? "waiting" : "silent";
}
export const STATE_LABEL: Record<LedgerState, string> = { done: t("做到了"), not: t("没做"), silent: t("没下文"), waiting: t("还没到日子"), skip: t("不算") };
export const owed = (s: LedgerState) => s === "not" || s === "silent";

export function tally(rows: LedgerRowView[]) {
  const side = (who: LedgerWho) => {
    const list = rows.filter((r) => r.who === who).map((r) => ({ ...r, state: stateOf(r) })).filter((r) => r.state !== "skip");
    return { list, owed: list.filter((r) => owed(r.state)).length, kept: list.filter((r) => r.state === "done").length,
      proven: list.filter((r) => r.state === "not").length }; // 没做 with a message (or the user's word) behind it
  };
  return { me: side("me"), them: side("them"), both: side("both") };
}

/** The joke line under the score. "证据确凿" only when a 没做 with a message behind it is there to back it up. */
export function punchline(meOwed: number, themOwed: number, name: string, meProven = 0, themProven = 0) {
  if (!meOwed && !themOwed) return t("说到做到，你俩谁也挑不出毛病");
  if (meOwed - themOwed >= 3) return meProven ? t("证据确凿：你就是那个光说不做的人") : t("答应了一堆都没下文，你自己心里清楚");
  if (meOwed > themOwed) return t("你比{0}多欠了 {1} 件，还不快去还", name, meOwed - themOwed);
  if (themOwed - meOwed >= 3) return themProven ? t("证据确凿：{0}欠你的，可以开始翻旧账了", name) : t("{0}答应你的一堆都没下文，可以开始翻旧账了", name);
  if (themOwed > meOwed) return t("{0}比你多欠 {1} 件，这局你赢", name, themOwed - meOwed);
  return t("半斤八两，谁也别说谁");
}

/** "小雨答应会跟爸妈说" → "会跟爸妈说": the section header already says who promised. */
export function shortTitle(title: string, name: string) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const t = title
    // 小雨答应会跟爸妈说 → 会跟爸妈说
    .replace(new RegExp(`^(我|${esc})?(答应|说好|保证|承诺)(了)?(要|会)?`), "")
    // Amy said she'll cook for me → cook for me;  I promised to pick up Amy → pick up Amy
    .replace(new RegExp(`^((I|${esc})\\s+)?(promised|said|agreed|swore)\\s+(that\\s+)?(to\\s+)?((she|he|they|I|we)('ll|'d| will| would)\\s+)?`, "i"), "")
    // みさきは明日食べ物を持ってきてくれると約束した → 明日食べ物を持ってきてくれる
    .replace(new RegExp(`^(${esc}|私|俺|僕|自分)(は|が)`), "").replace(/(と|を)?約束(した|する)?[。.]?$/, "")
    .replace(/^[，,、\s]+/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : title;
}

export function daysAgo(ts: string | null) {
  if (!ts) return null;
  const ms = new Date(ts.slice(0, 10) + "T00:00:00").getTime();
  const n = Math.round((Date.now() - ms) / 86400000);
  return n <= 0 ? t("今天说的") : n === 1 ? t("昨天说的") : t("{0} 天前说的", n);
}
