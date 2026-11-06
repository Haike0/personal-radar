export const RULE_GROUPS: { id: string; label: string; hint: string; on: boolean }[];
export type PrivacyConfig = { groups: Set<string>; keywords: string[]; custom: { pattern: string; replace?: string; name?: string }[]; excluded: Set<string> };
export function privacyConfig(get: (key: string) => string | null | undefined): PrivacyConfig;
export function redactText(text: string, cfg: PrivacyConfig): string;
export function outbound(text: string, cfg: PrivacyConfig): { text: string; dropped: number };
