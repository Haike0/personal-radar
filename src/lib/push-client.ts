"use client";
// Browser side of Web Push. On iPhone this only works in the home-screen app (iOS 16.4+), not in a Safari tab.

export type PushState =
  | { kind: "unsupported"; reason: "needs-install" | "browser" }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string };

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  // in development the build files are not content-hashed, so the worker must not cache them
  return navigator.serviceWorker.register(process.env.NODE_ENV === "production" ? "/sw.js" : "/sw.js?dev=1", { scope: "/", updateViaCache: "none" });
}

async function reg() {
  const r = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerSW());
  if (!r) throw new Error("Service Worker 不可用");
  await navigator.serviceWorker.ready;
  return r;
}

export async function pushState(): Promise<PushState> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return { kind: "unsupported", reason: isIOS() && !isStandalone() ? "needs-install" : "browser" };
  if (Notification.permission === "denied") return { kind: "denied" };
  const sub = await (await reg()).pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted") return { kind: "off" };
  // make sure the Mac still has this device (it drops subscriptions Apple reports as expired)
  const s = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { cache: "no-store" }).then((r) => r.json());
  if (!s.known) await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  return { kind: "on", endpoint: sub.endpoint };
}

function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Must be called from a tap (iOS only shows the permission prompt in response to a user gesture). */
export async function enablePush(): Promise<PushState> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? { kind: "denied" } : { kind: "off" };
  const r = await reg();
  const { publicKey } = await fetch("/api/push", { cache: "no-store" }).then((x) => x.json());
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return { kind: "on", endpoint: sub.endpoint };
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await reg()).pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
  return { kind: "off" };
}
