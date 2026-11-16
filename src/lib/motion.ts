"use client";
import { useAutoAnimate } from "@formkit/auto-animate/react";

/**
 * A list whose cards glide instead of jumping: a confirmed / finished card shrinks away and the rest slide up,
 * a new one fades in. Follows the system's "reduce motion" setting.
 */
export function useListMotion<T extends HTMLElement = HTMLDivElement>() {
  const [ref] = useAutoAnimate<T>({ duration: 260, easing: "cubic-bezier(.2, .8, .2, 1)" });
  return ref;
}
