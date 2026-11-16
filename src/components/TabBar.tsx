"use client";
import type { Icon } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

type Tab = { href: string; label: string; icon: Icon };

/**
 * The phone's bottom bar, after iOS 26's Liquid Glass tab bar: a glass capsule with a lens that marks the current tab.
 * Tap a tab and the lens glides there at once (before the page has loaded); press and slide along the bar and the lens
 * swells and follows the finger, then snaps to the nearest tab on release. Tapping the current tab scrolls to the top.
 */
export function TabBar({ tabs, activeIndex }: { tabs: Tab[]; activeIndex: number }) {
  const router = useRouter();
  const bar = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(activeIndex);
  const [drag, setDrag] = useState<{ x: number; over: number } | null>(null);
  const press = useRef<{ x0: number; moved: boolean; id: number } | null>(null);
  const swallowClick = useRef(false);
  const [w, setW] = useState(0);

  // the page changed by other means (back button, a link): follow it
  const [seen, setSeen] = useState(activeIndex);
  if (seen !== activeIndex) { setSeen(activeIndex); setCurrent(activeIndex); }
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => setW((el.clientWidth - 8) / tabs.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);
  // warm every tab's code, so switching never waits for a download
  useEffect(() => { for (const tb of tabs) router.prefetch(tb.href); }, [router, tabs]);

  const indexAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(tabs.length - 1, Math.floor((clientX - r.left - 4) / w)));
  };
  const lensX = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(r.width - 8 - w, clientX - r.left - 4 - w / 2));
  };
  const go = (i: number) => {
    if (i === current && i === activeIndex) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setCurrent(i);
    router.push(tabs[i].href);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { x0: e.clientX, moved: false, id: e.pointerId };
    bar.current!.dataset.touch = "";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved && Math.abs(e.clientX - p.x0) < 8) return;
    if (!p.moved) { p.moved = true; bar.current!.setPointerCapture(e.pointerId); }
    setDrag({ x: lensX(e.clientX), over: indexAt(e.clientX) });
  };
  const end = (e: React.PointerEvent, cancel = false) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    delete bar.current!.dataset.touch;
    if (p.moved) {
      swallowClick.current = true; // the click that follows a slide must not open the tab where the finger started
      setTimeout(() => { swallowClick.current = false; }, 400);
      setDrag(null);
      if (!cancel) go(indexAt(e.clientX));
    }
  };

  const shown = drag ? drag.over : current;
  const x = drag ? drag.x : current * w;
  return (
    <nav ref={bar} className="tabbar" aria-label={t("主导航")} data-drag={drag ? "" : undefined}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}>
      {w > 0 && <span className="tabbar-lens" aria-hidden style={{ width: w, translate: `${x}px 0` }} />}
      {tabs.map((tb, i) => (
        <Link key={tb.href} href={tb.href} className="tab" data-active={i === shown || undefined} aria-current={i === activeIndex ? "page" : undefined}
          draggable={false}
          onClick={(e) => { e.preventDefault(); if (!swallowClick.current) go(i); }}>
          <tb.icon size={24} stroke={i === shown ? 2.1 : 1.7} />
          <span>{tb.label}</span>
        </Link>
      ))}
    </nav>
  );
}
