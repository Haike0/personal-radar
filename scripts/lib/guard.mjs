// Radar has no login, so the browser on your own computer is the thing to guard. Two attacks go through it:
//  1. DNS rebinding: a website points its own domain name at 127.0.0.1, and then its scripts can read
//     http://<its-domain>:3210/api/… as if they were Radar's own pages. → only answer host names we know.
//  2. Cross-site requests (CSRF): any page you visit can submit a form or fetch() to localhost to change
//     settings or delete data, even without reading the answer. → API calls must come from Radar's own pages.
// Scripts on this computer (curl, the CLI, the reminder timer) send no Origin header and are not affected.

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** "localhost:3210" → "localhost", "[::1]:3210" → "[::1]" */
export function hostname(host) {
  const h = String(host ?? "").trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.replace(/:\d+$/, "");
}

/** Local names, Tailscale names (*.ts.net) and whatever RADAR_ALLOWED_HOSTS adds ("radar.home" or "*.home"). */
export function allowedHost(host, extra = []) {
  const name = hostname(host);
  if (!name) return false;
  if (LOCAL.has(name) || name.endsWith(".ts.net")) return true;
  return extra.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
    .some((x) => (x.startsWith("*.") ? name.endsWith(x.slice(1)) : name === x));
}

/**
 * Returns null when the request may go on, or a short reason when it must be refused.
 * `forwardedHost` is X-Forwarded-Host from a proxy in front (Tailscale serve); it counts only if it is allowed itself.
 */
export function checkRequest({ method = "GET", path = "/", host, forwardedHost, origin, secFetchSite }, extra = []) {
  if (host && !allowedHost(host, extra)) return "host";
  if (!path.startsWith("/api/")) return null; // pages: following a link to Radar from anywhere is fine
  const write = !["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
  if (origin) {
    if (origin === "null") return write ? "origin" : null; // sandboxed frames and file:// pages
    let from;
    try { from = new URL(origin).host.toLowerCase(); } catch { return "origin"; }
    const ours = [host, forwardedHost].filter((h) => h && allowedHost(h, extra)).map((h) => String(h).toLowerCase());
    if (!ours.includes(from)) return "origin";
    return null;
  }
  if (secFetchSite === "cross-site") return "origin";
  return null;
}
