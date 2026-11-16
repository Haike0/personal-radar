"use client";
import { useEffect, useState, type ReactNode } from "react";
import { lang, syncServerLang } from "@/lib/i18n";

/**
 * Render only in the browser: the interface language lives there, and a local app has nothing to gain from server HTML.
 * Before the first paint the server learns the language, so demo data comes in the same language.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  // once the Mac has this language, later launches draw at once and re-check in the background
  // (waiting for that round trip every time left the phone on a blank screen for a beat over 4G)
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // right after hydration (not during it: the server HTML is empty here, so the first client render must be too)
    let synced = false;
    try { synced = localStorage.getItem("radar.langSynced") === lang(); } catch {}
    if (synced) void Promise.resolve().then(() => setReady(true));
    let alive = true;
    void syncServerLang().then(() => { try { localStorage.setItem("radar.langSynced", lang()); } catch {} }).finally(() => alive && setReady(true));
    return () => { alive = false; };
  }, []);
  return ready ? children : null;
}
