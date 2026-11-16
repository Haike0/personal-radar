// A thin front door in front of the Next server: it passes every request through unchanged and gzips JSON answers.
// Next compresses pages and build files but never API answers (it drops Content-Encoding from route handlers on purpose),
// and the phone reaches the Mac over 4G + Tailscale, where a raw 350 KB item list made every tab feel slow.
// Streams (AI replies as text/event-stream, uploads, video ranges) pass straight through, untouched.
import http from "node:http";
import net from "node:net";
import zlib from "node:zlib";

/** A free port on this computer for the inner Next server. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

export function startFront({ port, host, inner }) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  const server = http.createServer((req, res) => {
    const up = http.request({ host: "127.0.0.1", port: inner, method: req.method, path: req.url, headers: req.headers, agent }, (r) => {
      const type = String(r.headers["content-type"] ?? "");
      const zip = req.method !== "HEAD" && r.statusCode !== 204 && r.statusCode !== 304
        && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))
        && !r.headers["content-encoding"] && /^application\/json/i.test(type)
        && !(Number(r.headers["content-length"]) < 1024);
      if (!zip) { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); return; }
      const h = { ...r.headers, "content-encoding": "gzip" };
      delete h["content-length"];
      h.vary = h.vary ? `${h.vary}, Accept-Encoding` : "Accept-Encoding";
      res.writeHead(r.statusCode ?? 200, h);
      r.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    });
    up.on("error", () => { if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" }); res.end("ReadMe 正在启动，稍等几秒再刷新。"); });
    req.pipe(up);
    res.on("close", () => { if (!res.writableFinished) up.destroy(); });
  });
  server.keepAliveTimeout = 65_000;
  return new Promise((resolve, reject) => { server.once("error", reject); server.listen(Number(port), host, () => resolve(server)); });
}
