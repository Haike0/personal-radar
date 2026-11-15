import { NextResponse, type NextRequest } from "next/server";
import { checkRequest } from "../scripts/lib/guard.mjs";

const EXTRA = (process.env.RADAR_ALLOWED_HOSTS ?? "").split(",");

// Runs before every page and API call: refuses requests a website could forge or read through your browser.
// The rules (and why) are in scripts/lib/guard.mjs.
export function proxy(req: NextRequest) {
  const h = req.headers;
  const why = checkRequest({
    method: req.method, path: req.nextUrl.pathname,
    host: h.get("host"), forwardedHost: h.get("x-forwarded-host"), origin: h.get("origin"), secFetchSite: h.get("sec-fetch-site"),
  }, EXTRA);
  if (!why) return NextResponse.next();
  const text = why === "host"
    ? "ReadMe 只接受 localhost、127.0.0.1 和 Tailscale（*.ts.net）地址，防止别的网站借你的浏览器读取数据。要用别的地址，启动前设置 RADAR_ALLOWED_HOSTS。"
    : "这个请求来自别的网页，已拒绝。ReadMe 只接受它自己页面发出的操作。";
  return new NextResponse(text, { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon).*)" };
