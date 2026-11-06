import { connection } from "next/server";
import { listConversations } from "@/lib/ai/conversations";

/** GET ?person=<key> → that person's saved chats; no person → chats about everyone */
export async function GET(req: Request) {
  await connection();
  const person = new URL(req.url).searchParams.get("person");
  return Response.json({ conversations: listConversations(person || null) });
}
