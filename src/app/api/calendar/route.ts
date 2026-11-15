import { connection } from "next/server";
import { listItems, listPeople } from "@/lib/db";
import { isKnowledge } from "@/lib/types";

/** Everything with a date, for everyone (the calendar filters by group on the page), plus people and their tags. */
export async function GET() {
  await connection();
  const events = listItems()
    .filter((i) => i.eventDate && !i.isGroup && !isKnowledge(i) && !["superseded", "ignored", "cancelled"].includes(i.status))
    .map((i) => ({ id: i.id, person: i.personKey, title: i.title, date: i.eventDate!, time: i.eventTime, kind: i.kind, certainty: i.certainty, status: i.status, category: i.category }));
  const people = listPeople().filter((p) => !p.isGroup).map((p) => ({ key: p.key, name: p.name.replace(/^演示·/, ""), tags: p.tags ?? [] }));
  return Response.json({ events, people });
}
