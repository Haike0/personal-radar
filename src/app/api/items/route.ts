import { connection } from "next/server";
import { counts, currentMode, listItems } from "@/lib/db";
import { syncStatus } from "@/lib/sync";

export async function GET(req: Request) {
  await connection();
  const person = new URL(req.url).searchParams.get("person") ?? undefined;
  const items = listItems({ person });
  return Response.json({ mode: currentMode(), items, counts: counts(items), sync: syncStatus() });
}
