"use client";
import { useCallback, useEffect, useState } from "react";

const BUS = "radar:refresh";
/** Tell every mounted useApi() hook to refetch (after an action, undo, AI apply…). */
export const refreshAll = () => window.dispatchEvent(new Event(BUS));

// Last good response per URL, kept for the life of the page. Switching tabs shows it instantly
// (like a native app) and refreshes in the background instead of flashing skeletons every time.
const cache = new Map<string, unknown>();

const PATCHED = "radar:patched";
/**
 * Change one item everywhere it's cached and redraw at once, before the Mac answers: tapping 完成 / 对 / 明天再提醒
 * should move the card the moment the finger lifts, not after a round trip over 4G plus a full refetch.
 */
export function patchItem(id: number, patch: Record<string, unknown>) {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      let changed = false;
      const out = v.map((x) => { const y = walk(x); if (y !== x) changed = true; return y; });
      return changed ? out : v;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.id === id && "status" in o && "title" in o) return { ...o, ...patch };
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const k in o) { out[k] = walk(o[k]); if (out[k] !== o[k]) changed = true; }
      return changed ? out : v;
    }
    return v;
  };
  for (const [k, v] of cache) cache.set(k, walk(v));
  window.dispatchEvent(new Event(PATCHED));
}

export function useApi<T>(url: string | null) {
  const cached = url ? (cache.get(url) as T | undefined) : undefined;
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null; loading: boolean }>(
    { url, data: cached ?? null, error: null, loading: cached === undefined },
  );
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  // url changed (e.g. another person picked): show that url's cached data right away, never the previous one's
  if (state.url !== url) {
    const c = url ? (cache.get(url) as T | undefined) : undefined;
    setState({ url, data: c ?? null, error: null, loading: c === undefined });
  }
  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
        return (await r.json()) as T;
      })
      .then((data) => { cache.set(url, data); if (alive) setState({ url, data, error: null, loading: false }); })
      .catch((e: Error) => alive && setState((s) => ({ ...s, error: navigator.onLine ? e.message : "离线：连不上家里的 Mac", loading: false })));
    return () => { alive = false; };
  }, [url, tick]);
  // an optimistic patch: redraw from the cache, no request
  useEffect(() => {
    if (!url) return;
    const onPatch = () => { const c = cache.get(url) as T | undefined; if (c) setState((s) => (s.data === c ? s : { ...s, data: c })); };
    window.addEventListener(PATCHED, onPatch);
    return () => window.removeEventListener(PATCHED, onPatch);
  }, [url]);
  useEffect(() => {
    // coming back to the app (PWA resumed from background) also counts as "look again"
    const onVisible = () => document.visibilityState === "visible" && reload();
    window.addEventListener(BUS, reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(BUS, reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

export async function post<T = unknown>(url: string, body: unknown, method = "POST"): Promise<T> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as T;
}
