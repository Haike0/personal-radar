import "server-only";
import { db, nowStr } from "@/lib/db";
import type { Citation, CompanionContext } from "./types";

// Saved AI conversations live in the app's own radar.db (local only).
export interface ConversationSummary { id: number; personKey: string | null; assistant: string; title: string; updatedAt: string; messages: number; scope: CompanionContext | null }
export interface StoredMessage { role: "user" | "assistant"; content: string; citations?: Citation[]; at: string }

let ready = false;
function d() {
  const x = db();
  if (!ready) {
    x.exec(`CREATE TABLE IF NOT EXISTS ai_conversations(id INTEGER PRIMARY KEY, person_key TEXT, assistant TEXT NOT NULL, title TEXT NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS ai_messages(id INTEGER PRIMARY KEY, conv_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
              role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT, created_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS ai_messages_conv ON ai_messages(conv_id, id);`);
    try { x.exec("ALTER TABLE ai_conversations ADD COLUMN scope_json TEXT"); } catch { /* already there */ }
    ready = true;
  }
  return x;
}

type Row = Record<string, unknown>;
const summary = (r: Row): ConversationSummary => ({
  id: Number(r.id), personKey: (r.person_key as string) ?? null, assistant: String(r.assistant), title: String(r.title),
  updatedAt: String(r.updated_at), messages: Number(r.n ?? 0),
  scope: r.scope_json ? (JSON.parse(String(r.scope_json)) as CompanionContext) : null,
});

/** person = a key → that person's chats; null → chats about everyone; "*" → every chat (the searchable history sheet) */
export function listConversations(person: string | null): ConversationSummary[] {
  const where = person === "*" ? "1=1" : person ? "c.person_key=?" : "c.person_key IS NULL";
  const rows = d().prepare(`SELECT c.*, (SELECT COUNT(*) FROM ai_messages m WHERE m.conv_id=c.id) n FROM ai_conversations c
    WHERE ${where} ORDER BY c.updated_at DESC, c.id DESC LIMIT 300`).all(...(person && person !== "*" ? [person] : [])) as Row[];
  return rows.map(summary);
}

export function createConversation(person: string | null, assistant: string, firstQuestion: string, scope?: CompanionContext): number {
  const t = nowStr();
  const title = firstQuestion.replace(/\s+/g, " ").trim().slice(0, 40) || "新对话";
  const r = d().prepare("INSERT INTO ai_conversations(person_key,assistant,title,created_at,updated_at,scope_json) VALUES(?,?,?,?,?,?)").run(person, assistant, title, t, t, scope ? JSON.stringify(scope) : null);
  return Number(r.lastInsertRowid);
}

export function getConversation(id: number): (ConversationSummary & { items: StoredMessage[] }) | null {
  const c = d().prepare("SELECT c.*, 0 n FROM ai_conversations c WHERE id=?").get(id) as Row | undefined;
  if (!c) return null;
  const items = (d().prepare("SELECT role, content, citations, created_at FROM ai_messages WHERE conv_id=? ORDER BY id").all(id) as Row[]).map((m) => ({
    role: m.role as "user" | "assistant", content: String(m.content), at: String(m.created_at),
    citations: m.citations ? (JSON.parse(String(m.citations)) as Citation[]) : undefined,
  }));
  return { ...summary(c), messages: items.length, items };
}

export function appendMessage(id: number, role: "user" | "assistant", content: string, citations?: Citation[]) {
  const t = nowStr();
  d().prepare("INSERT INTO ai_messages(conv_id,role,content,citations,created_at) VALUES(?,?,?,?,?)").run(id, role, content, citations?.length ? JSON.stringify(citations) : null, t);
  d().prepare("UPDATE ai_conversations SET updated_at=? WHERE id=?").run(t, id);
}

export function setAssistant(id: number, assistant: string) {
  d().prepare("UPDATE ai_conversations SET assistant=? WHERE id=?").run(assistant, id);
}

export function deleteConversation(id: number) {
  d().prepare("DELETE FROM ai_messages WHERE conv_id=?").run(id);
  d().prepare("DELETE FROM ai_conversations WHERE id=?").run(id);
}
