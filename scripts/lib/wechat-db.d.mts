import type { Chat } from "./import-core.mjs";
export type WechatChat = Chat & { id: string };
export const chatId: (username: string) => string;
export function scan(dir: string): { contact: string | null; messages: string[] };
export function convert(base: number, sub: number, text: string): { type: number; text: string; reply?: string | null };
export function read(dir: string, opts?: { since?: Record<string, number>; groups?: boolean; only?: Set<string> | null }): { me: string; chats: WechatChat[]; files: { contact: boolean; messages: number } };
export type WechatEntry = { id: string; name: string; group: boolean; messages: number };
export function inspect(dir: string): { ok: boolean; error?: string; files: { contact: boolean; messages: number }; private?: WechatEntry[]; groups?: WechatEntry[] };
