import { connection } from "next/server";
import { health } from "@/lib/health";

export async function GET(req: Request) {
  await connection();
  const person = new URL(req.url).searchParams.get("person") ?? undefined;
  return Response.json(health(person));
}
