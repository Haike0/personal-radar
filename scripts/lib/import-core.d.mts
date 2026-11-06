export type Msg = { ts: number; senderId?: string; sender: string; text: string; type: number; pid?: string | null; reply?: string | null };
export type Chat = { platform: string; name: string | null; group?: boolean; ownerId?: string | null; messages: Msg[]; participants?: string[] };
export type Person = { id: string; name: string; messages: number };
export type Plan =
  | { ok: true; id: string; name: string; me: string; meName: string; isGroup: boolean; platform: string; people: Person[]; total: number; existing: number; fresh: number; first: number; last: number }
  | { ok: false; error: string; needMe?: boolean; people?: Person[]; isGroup?: boolean };
export const T: Record<string, number>;
export const FORMATS: { id: string; label: string; hint: string }[];
export function read(input: Buffer | string, filename?: string, opts?: { dateOrder?: "dmy" | "mdy" }): { format: string; chats: Chat[] };
export function plan(chat: Chat, opts: { me?: string; name?: string; id?: string }, chatsDir: string): Plan;
export function write(chat: Chat, plan: Extract<Plan, { ok: true }>, chatsDir: string): { added: number; dup: number; total: number };
export function writeState(dataDir: string, state: Record<string, unknown>): void;
export function fromChatLab(doc: unknown): Chat;
