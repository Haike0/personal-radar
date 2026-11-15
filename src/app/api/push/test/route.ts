import { sendAll } from "@/lib/push";

/** Test notification to this device only (or every device when no endpoint is given). */
export async function POST(req: Request) {
  const { endpoint } = await req.json().catch(() => ({}));
  const r = await sendAll({ title: "ReadMe 通知已接通", body: "以后快到日子的事、延后到期的事和每日摘要会这样出现在锁屏上。", url: "/settings", tag: "test" }, endpoint || undefined);
  if (!r.total) return Response.json({ error: "服务器上没有这台设备的订阅，请重新开启通知" }, { status: 404 });
  if (!r.sent) return Response.json({ error: `发送失败：${r.errors.join("；")}` }, { status: 502 });
  return Response.json({ ok: true, sent: r.sent });
}
