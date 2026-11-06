import { preview, replan } from "@/lib/importer";

/** multipart/form-data with one or more `file` fields → what each chat would import (nothing is written). */
export async function POST(req: Request) {
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) {
      const b = (await req.json()) as { token: string; key: string; me?: string; name?: string };
      return Response.json({ plan: replan(b.token, b.key, b) });
    }
    const form = await req.formData();
    const files = await Promise.all(form.getAll("file").filter((f): f is File => typeof f === "object").map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })));
    if (!files.length) return Response.json({ error: "没有收到文件" }, { status: 400 });
    const order = form.get("dateOrder");
    return Response.json(preview(files, order === "mdy" || order === "dmy" ? order : undefined));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
