import { connection } from "next/server";
import * as chatlab from "@/lib/chatlab";

export async function GET() {
  await connection();
  return Response.json({ status: chatlab.status(), sessions: chatlab.listSessions() });
}
