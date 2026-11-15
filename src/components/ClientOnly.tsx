"use client";
import { useSyncExternalStore, type ReactNode } from "react";

const noop = () => () => {};
/** Render only in the browser: the interface language lives there, and a local app has nothing to gain from server HTML. */
export function ClientOnly({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? children : null;
}
