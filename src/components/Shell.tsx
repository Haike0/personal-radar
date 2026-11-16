"use client";
import { t } from "@/lib/i18n";
import { AppShell, Box, Group, NavLink, Stack, Text, useComputedColorScheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCalendarEvent, IconRadar2, IconSettings, IconSparkles, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { registerSW } from "@/lib/push-client";
import { recordPath } from "@/lib/nav";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CompanionContext } from "@/lib/ai/types";
import { Companion } from "./Companion";
import { TabBar } from "./TabBar";

const TABS = [
  { href: "/", label: t("今天"), icon: IconRadar2 },
  { href: "/people", label: t("人物"), icon: IconUsers },
  { href: "/timeline", label: t("日历"), icon: IconCalendarEvent },
  { href: "/companion", label: "AI", icon: IconSparkles },
  { href: "/settings", label: t("设置"), icon: IconSettings },
];

const PHONE_TABS = TABS.filter((tb) => tb.href !== "/companion");

type Ctx = { openCompanion: (prompt?: string, context?: CompanionContext) => void; setPageContext: (c: CompanionContext) => void; pageContext: CompanionContext };
const CompanionCtx = createContext<Ctx | null>(null);
export const useCompanion = () => useContext(CompanionCtx)!;

/** Pages declare what they're showing so the AI can scope its answers to it. */
export function usePageContext(c: CompanionContext | null) {
  const { setPageContext } = useCompanion();
  const key = JSON.stringify(c);
  useEffect(() => {
    if (c) setPageContext(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setPageContext]);
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const desktop = useMediaQuery("(min-width: 48em)", false);
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<string | undefined>();
  const [pageContext, setPageContext] = useState<CompanionContext>({ page: "home" });
  // "问 AI" on one card scopes the drawer to that card, without changing what the page itself is about
  const [override, setOverride] = useState<CompanionContext | null>(null);
  const openCompanion = useCallback((prompt?: string, context?: CompanionContext) => { setOverride(context ?? null); setSeed(prompt); setOpen(true); }, []);
  const value = useMemo(() => ({ openCompanion, setPageContext, pageContext }), [openCompanion, pageContext]);
  useEffect(() => { recordPath(path); }, [path]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const onCompanionPage = path.startsWith("/companion");
  // first-run pages are a focused flow: no sidebar, no bottom tab bar, no AI button
  const bare = path.startsWith("/welcome") || path.startsWith("/setup");
  // reading pages (one item, settings) stay narrow; overview pages use the width of a desktop screen
  const wide = onCompanionPage; // everything else reads as one calm column
  // iOS Safari ignores user-scalable=no; block pinch-zoom gestures directly so the layout never ends up zoomed
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    return () => { document.removeEventListener("gesturestart", stop); document.removeEventListener("gesturechange", stop); };
  }, []);

  // service worker: fast launches + push. A tapped notification asks the open app to switch pages (no reload).
  const router = useRouter();
  useEffect(() => {
    registerSW().catch(() => {});
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "radar:open" && typeof e.data.url === "string") router.push(e.data.url); };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [router]);
  // browser/status-bar tint follows the in-app appearance choice, not only the system one
  const scheme = useComputedColorScheme("light", { getInitialValueInEffect: true });
  useEffect(() => {
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
      m.removeAttribute("media");
      m.setAttribute("content", scheme === "dark" ? "#141827" : "#f4f6fa");
    }
  }, [scheme]);

  return (
    <CompanionCtx.Provider value={value}>
      <AppShell navbar={{ width: 232, breakpoint: "sm", collapsed: { mobile: true, desktop: bare } }} padding={0}>
        <AppShell.Navbar p="md" style={{ background: "transparent", borderRight: "1px solid light-dark(rgba(20,24,39,.06), rgba(255,255,255,.05))" }}>
          <Group gap={10} mb="xl" px={6} mt={4}>
            <img src="/brand/icon.png" alt="" width={34} height={34} style={{ display: "block", borderRadius: 9 }} />
            <div>
              <Text fw={650} lh={1.1}>ReadMe</Text>
              <Text size="xs" className="faint">{t("记住 TA 说过的话")}</Text>
            </div>
          </Group>
          <Stack gap={4}>
            {TABS.map((t) => (
              <NavLink key={t.href} component={Link} href={t.href} label={t.label} active={active(t.href)}
                leftSection={<t.icon size={19} stroke={1.7} />} style={{ borderRadius: 10 }} />
            ))}
          </Stack>
        </AppShell.Navbar>
        <AppShell.Main>
          <Box maw={wide ? 1120 : 760} mx="auto" px={{ base: 16, sm: 32 }} pt={{ base: "calc(var(--safe-top) + 18px)", sm: 36 }}
            pb={{ base: bare ? "calc(var(--safe-bottom) + 28px)" : "calc(var(--tabbar-h) + var(--safe-bottom) + 28px)", sm: 48 }}>
            {/* each page fades in on its own; the old page is gone at once, so two pages never overlap,
                and only opacity animates (cheap on any phone, and fixed / sticky bars inside stay put) */}
            <div key={path} className="page-enter">{children}</div>
          </Box>
        </AppShell.Main>
      </AppShell>

      {!desktop && !bare && <TabBar tabs={PHONE_TABS} activeIndex={Math.max(0, PHONE_TABS.findIndex((tb) => active(tb.href)))} />}
      {!onCompanionPage && !bare && (
        <button className="ai-fab" aria-label={t("打开 AI 助手")} onClick={() => openCompanion()}>
          <IconSparkles size={26} stroke={1.8} />
        </button>
      )}
      <Companion opened={open} onClose={() => { setOpen(false); setOverride(null); }} context={override ?? pageContext} seedPrompt={seed} mode="drawer" desktop={desktop} />
    </CompanionCtx.Provider>
  );
}
