// After `next build` with output: "standalone", Next leaves a self-contained server in .next/standalone that carries
// only the files it needs (no compiler, no unused icons). It still needs the static assets next to it.
import fs from "node:fs";
import path from "node:path";

export function finishStandalone(root) {
  const sa = path.join(root, ".next", "standalone");
  if (!fs.existsSync(path.join(sa, "server.js"))) return false;
  fs.cpSync(path.join(root, ".next", "static"), path.join(sa, ".next", "static"), { recursive: true });
  if (fs.existsSync(path.join(root, "public"))) fs.cpSync(path.join(root, "public"), path.join(sa, "public"), { recursive: true });
  // Next points hashed aliases (telegram-ab12…) at external packages with symlinks; npm drops symlinks when packing,
  // so turn each into a real copy
  const aliases = path.join(sa, ".next", "node_modules");
  if (fs.existsSync(aliases)) for (const name of fs.readdirSync(aliases)) {
    const p = path.join(aliases, name);
    if (!fs.lstatSync(p).isSymbolicLink()) continue;
    const target = fs.realpathSync(p);
    fs.rmSync(p);
    fs.cpSync(target, p, { recursive: true, dereference: true });
  }
  return true;
}
