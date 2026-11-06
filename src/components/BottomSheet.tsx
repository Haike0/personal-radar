"use client";
import { Portal } from "@mantine/core";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Phone bottom sheet that always fits the part of the screen you can see.
 * iOS doesn't shrink the page when the keyboard opens — it slides the keyboard over it and scrolls the page, which is
 * what made the old drawer jump around while typing. This sheet follows window.visualViewport instead, so its bottom edge
 * (and the input in it) sits right on top of the keyboard and nothing is pushed off screen.
 */
export function BottomSheet({ opened, onClose, children, maxHeight = 0.92, zIndex = 300, label, fill }: {
  opened: boolean; onClose: () => void; children: ReactNode; maxHeight?: number; zIndex?: number; label: string;
  /** take the full allowed height (a chat) instead of shrinking to its content (a list) */
  fill?: boolean;
}) {
  const [vv, setVv] = useState<{ top: number; h: number } | null>(null);
  useEffect(() => {
    if (!opened) return;
    const v = window.visualViewport;
    const update = () => setVv({ top: v?.offsetTop ?? 0, h: v?.height ?? window.innerHeight });
    update();
    v?.addEventListener("resize", update);
    v?.addEventListener("scroll", update);
    // the page behind must not scroll while the sheet is up
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      v?.removeEventListener("resize", update);
      v?.removeEventListener("scroll", update);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [opened, onClose]);
  if (!opened) return null;
  const h = vv?.h ?? 0;
  // keyboard up → the home-indicator inset is hidden behind it; padding for it would leave a gap above the keyboard
  const keyboard = h > 0 && window.innerHeight - h > 120;
  return (
    <Portal>
      <div className="sheet-wrap" style={{ zIndex, top: vv?.top ?? 0, height: h || "100dvh" }}>
        <div className="sheet-backdrop" onClick={onClose} />
        <div className="sheet" role="dialog" aria-modal="true" aria-label={label} style={{ [fill ? "height" : "maxHeight"]: h ? Math.round(h * (keyboard ? 0.98 : maxHeight)) : `${maxHeight * 100}dvh`, paddingBottom: keyboard ? 0 : undefined }}>
          <div className="sheet-grip" aria-hidden="true" />
          {children}
        </div>
      </div>
    </Portal>
  );
}
