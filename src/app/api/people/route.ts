import { connection } from "next/server";
import { listPeople } from "@/lib/db";

export async function GET() {
  await connection();
  return Response.json({ people: listPeople() });
}
