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
  return () => (stack.length > 1 ? router.back() : router.push(fallback));
}
