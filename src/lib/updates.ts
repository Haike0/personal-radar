import "server-only";
import pkg from "../../package.json";
import { getSetting } from "./db";

// Checks GitHub once a day for a newer release, so self-hosted installs don't silently fall behind.
// Turn off with update_check = off (设置 → 关于). Sends one anonymous GET to api.github.com; nothing about you.
export const REPO = "Haike0/personal-radar";
let cache: { at: number; latest: string | null; url: string | null } | null = null;
const newer = (a: string, b: string) => {
  const pa = a.replace(/^v/, "").split(/[.-]/).map(Number), pb = b.replace(/^v/, "").split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};
export async function checkUpdate() {
  const current = pkg.version;
  if (getSetting("update_check") === "off") return { current, latest: null, url: null, available: false, off: true };
  if (!cache || Date.now() - cache.at > 24 * 3600e3) {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(8000) });
      const j = r.ok ? await r.json() : null;
      cache = { at: Date.now(), latest: j?.tag_name ?? null, url: j?.html_url ?? null };
    } catch { cache = { at: Date.now(), latest: null, url: null }; }
  }
  return { current, latest: cache.latest, url: cache.url, available: Boolean(cache.latest && newer(cache.latest, current)), off: false };
}
