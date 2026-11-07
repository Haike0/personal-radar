import { connection, type NextRequest } from "next/server";
import { listItems } from "@/lib/db";
import { check, decide, list, type Verdict, type Who } from "@/lib/ledger";

type Ctx = { params: Promise<{ key: string }> };
const keyOf = async (ctx: Ctx) => decodeURIComponent((await ctx.params).key);

/** 说话算数账本: every promise between you two, with the AI's call on whether it was kept. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  await connection();
  return Response.json(list(await keyOf(ctx)));
}

/** Let the AI look through promises it hasn't checked yet; call again while `remaining` > 0. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const key = await keyOf(ctx);
  const name = (listItems({ person: key })[0]?.personName ?? "对方").replace(/^演示·/, "");
  const r = await check(key, name);
  return Response.json(r, { status: "error" in r ? 400 : 200 });
}

/** body: { id, verdict?: "done"|"not"|"skip"|null, who?: "me"|"them"|"both" } */
export async function PATCH(req: NextRequest) {
  const b = (await req.json()) as { id: number; verdict?: Verdict | null; who?: Who };
  if (!Number.isInteger(b.id)) return Response.json({ error: "id" }, { status: 400 });
  if (b.verdict !== undefined && b.verdict !== null && !["done", "not", "skip"].includes(b.verdict)) return Response.json({ error: "verdict" }, { status: 400 });
  if (b.who !== undefined && !["me", "them", "both"].includes(b.who)) return Response.json({ error: "who" }, { status: 400 });
  decide(b.id, { verdict: b.verdict, who: b.who });
  return Response.json({ ok: true });
}
