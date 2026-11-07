export const LEDGER_SYSTEM: string;
export type LedgerWho = "me" | "them" | "both";
export type LedgerResult = "done" | "not" | "unclear";
export function ledgerInput(
  p: { title: string; summary?: string | null; whoGuess: string; quotes: string[]; name: string },
  after: { who: string; text: string; ts: string }[],
): string;
export function parseLedger(raw: string | null, size: number): { who: LedgerWho | null; result: LedgerResult; proof: number | null; reason: string | null } | null;
