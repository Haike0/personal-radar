"use client";
import { useCallback, useEffect, useState } from "react";

const BUS = "radar:refresh";
/** Tell every mounted useApi() hook to refetch (after an action, undo, AI apply…). */
export const refreshAll = () => window.dispatchEvent(new Event(BUS));

// Last good response per URL, kept for the life of the page. Switching tabs shows it instantly
// (like a native app) and refreshes in the background instead of flashing skeletons every time.
const cache = new Map<string, unknown>();

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
