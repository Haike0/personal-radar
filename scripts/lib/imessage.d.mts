import type { Chat } from "./import-core.mjs";
export const DEFAULT_DB: string;
export const chatId: (guid: string) => string;
export function bodyText(blob: Uint8Array | null | undefined): string;
export function read(opts?: { file?: string; after?: number; groups?: boolean; oneWay?: boolean }): { chats: (Chat & { id: string })[]; max: number; error?: string; noAccess?: boolean };
export function inspect(file?: string): { ok: boolean; error?: string; noAccess?: boolean; chats?: number; groups?: number; conversations?: number };
