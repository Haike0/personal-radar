"use client";
import { useEffect, useState, type ReactNode } from "react";
import { syncServerLang } from "@/lib/i18n";

/**
 * Render only in the browser: the interface language lives there, and a local app has nothing to gain from server HTML.
 * Before the first paint the server learns the language, so demo data comes in the same language.
 */
export function ClientOnly({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { let alive = true; void syncServerLang().finally(() => alive && setReady(true)); return () => { alive = false; }; }, []);
  return ready ? children : null;
}
