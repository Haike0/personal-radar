"use client";
import { AppShell, Box, Group, NavLink, Stack, Text, ThemeIcon, useComputedColorScheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconCalendarEvent, IconRadar2, IconSettings, IconSparkles, IconUsers } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { registerSW } from "@/lib/push-client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CompanionContext } from "@/lib/ai/types";
import { Companion } from "./Companion";

const TABS = [
  { href: "/", label: "今天", icon: IconRadar2 },
  { href: "/people", label: "人物", icon: IconUsers },
  { href: "/timeline", label: "时间线", icon: IconCalendarEvent },
  { href: "/companion", label: "AI", icon: IconSparkles },
  { href: "/settings", label: "设置", icon: IconSettings },
];

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
            <ThemeIcon size={34} radius="md" variant="gradient" gradient={{ from: "radar.5", to: "violet.6", deg: 135 }}>
              <IconRadar2 size={20} />
            </ThemeIcon>
            <div>
              <Text fw={650} lh={1.1}>Personal Radar</Text>
              <Text size="xs" className="faint">私人关注中心</Text>
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
            {children}
          </Box>
        </AppShell.Main>
      </AppShell>

      {!desktop && !bare && (
        <nav className="tabbar" aria-label="主导航">
          {TABS.filter((t) => t.href !== "/companion").map((t) => (
            <Link key={t.href} href={t.href} className="tab" data-active={active(t.href) || undefined}>
              <t.icon size={24} stroke={active(t.href) ? 2.1 : 1.7} />
              <span>{t.label}</span>
            </Link>
          ))}
        </nav>
      )}
      {!onCompanionPage && !bare && (
        <button className="ai-fab" aria-label="打开 AI 助手" onClick={() => openCompanion()}>
          <IconSparkles size={26} stroke={1.8} />
        </button>
      )}
      <Companion opened={open} onClose={() => { setOpen(false); setOverride(null); }} context={override ?? pageContext} seedPrompt={seed} mode="drawer" desktop={desktop} />
    </CompanionCtx.Provider>
  );
}
