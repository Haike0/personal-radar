import { connection } from "next/server";
import { checkUpdate } from "@/lib/updates";

export async function GET() {
  await connection();
  return Response.json(await checkUpdate());
}
