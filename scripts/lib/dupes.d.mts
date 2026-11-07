export type DupeItem = { id: string | number; kind: string; facet?: string | null; date?: string | number | null; title: string };
export function similarity(a: string, b: string): number;
export function candidatePairs<T extends DupeItem>(items: T[], min?: number): [T, T, number][];
