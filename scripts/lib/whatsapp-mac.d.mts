import type { Chat } from "./import-core.mjs";
export const CONTAINER: string;
export const chatId: (jid: string) => string;
export function find(container?: string): string | null;
export function read(opts?: { file?: string | null; after?: number; groups?: boolean }): { chats: (Chat & { id: string })[]; max: number; error?: string; noAccess?: boolean };
export function inspect(file?: string | null): { ok: boolean; error?: string; noAccess?: boolean; chats?: number; groups?: number };
