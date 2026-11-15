import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/** Every package (with its nested copies) that `names` need at run time, as tracing globs. */
function runtimeDeps(names: string[]) {
  const seen = new Set<string>();
  const find = (name: string, from: string): string | null => {
    for (let d = from; ; d = path.dirname(d)) {
      const p = path.join(d, "node_modules", name);
      if (fs.existsSync(path.join(p, "package.json"))) return p;
      if (path.dirname(d) === d) return null;
    }
  };
  const walk = (dir: string) => {
    if (seen.has(dir)) return;
    seen.add(dir);
    const pj = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    for (const n of Object.keys({ ...pj.dependencies, ...pj.optionalDependencies })) { const r = find(n, dir); if (r) walk(r); }
  };
  for (const n of names) { const r = find(n, process.cwd()); if (r) walk(r); }
  return [...seen].map((d) => `${path.relative(process.cwd(), d)}/**`);
}

// All pages fetch live data from the local SQLite API at request time, so the
// prerendering/caching model (cacheComponents) buys nothing here and conflicts
// with client hooks like usePathname in the app shell.
const nextConfig: NextConfig = {
  cacheComponents: false,
  // a self-contained server with only the files it needs: the installed package stays small
  output: "standalone",
  // the code reads demo/, docs/ and scripts/ from the package folder at run time (RADAR_ROOT), so they needn't be
  // copied into the server; images are never resized, so the image library isn't needed either
  outputFileTracingExcludes: { "*": ["demo/**", "docs/**", "media/**", "dist/**", "src/**", "tests/**", "examples/**", "agent/**", "scripts/**", "bin/**", "*.md", "Dockerfile", "docker-compose.yml", "tsconfig*", "eslint.config.mjs", "package-lock.json", "node_modules/@img/**", "node_modules/sharp/**", "node_modules/typescript/**"] },
  images: { unoptimized: true },
  // Telegram's and web-push's own dependencies are loaded at run time in ways the tracer can miss: include them whole.
  // Next's own route runtimes too: instrumentation.ts (background sync, real data only) needs app-route-turbo, which
  // the tracer leaves out, so a fresh install worked in demo mode and broke as soon as real chats were imported.
  outputFileTracingIncludes: { "*": [...runtimeDeps(["telegram", "web-push"]), "node_modules/next/dist/compiled/next-server/*.prod.js"] },
  // the floating "N" dev-tools badge only exists in dev mode; hide it so it doesn't cover the UI
  devIndicators: false,
  // iPhone access later goes through a Tailscale HTTPS hostname
  allowedDevOrigins: ["*.ts.net"],
  // Telegram's client opens sockets and loads optional modules at run time: keep it out of the bundle
  serverExternalPackages: ["telegram"],
};

export default nextConfig;
