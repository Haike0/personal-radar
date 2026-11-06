import { connection } from "next/server";
import { hasSubscription, publicKey, recentLog, sentToday, subscriptionCount } from "@/lib/push";

/** Public VAPID key + status for the settings page. `?endpoint=` tells the phone whether the server still knows it. */
export async function GET(req: Request) {
  await connection();
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  return Response.json({
    publicKey: publicKey(),
    devices: subscriptionCount(),
    known: endpoint ? hasSubscription(endpoint) : null,
    sentToday: sentToday(),
    recent: recentLog(5),
  });
}
