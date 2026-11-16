"use client";
import { useRouter } from "next/navigation";

// In-app navigation history, so 返回 goes to the page you actually came from (Today → 小雨 → back = Today),
// and only falls back to a default page when there is nothing to go back to (a link opened directly).
const stack: string[] = [];
export function recordPath(path: string) {
  if (stack[stack.length - 1] === path) return;
  if (stack[stack.length - 2] === path) stack.pop(); // a back navigation
  else stack.push(path);
}
export function useBack(fallback: string) {
  const router = useRouter();
  return () => {
    document.documentElement.dataset.nav = "pop";
    if (stack.length <= 1) { router.push(fallback); return; }
    // a history step isn't a React transition, so React won't animate it: run the slide-back ourselves (globals.css, .vt-back)
    const vt = (document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } }).startViewTransition;
    if (!vt || matchMedia("(prefers-reduced-motion: reduce)").matches) { router.back(); return; }
    const from = location.pathname;
    document.documentElement.classList.add("vt-back");
    vt.call(document, () => new Promise<void>((done) => {
      router.back();
      const t0 = performance.now();
      const wait = () => (location.pathname !== from || performance.now() - t0 > 500
        ? setTimeout(() => requestAnimationFrame(() => done()), 40) // let React draw the page we're returning to
        : setTimeout(wait, 16));
      wait();
    })).finished.finally(() => document.documentElement.classList.remove("vt-back"));
  };
}
