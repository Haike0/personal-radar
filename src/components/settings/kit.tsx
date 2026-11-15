"use client";
import { t } from "@/lib/i18n";
import { Badge, Group, Paper, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { usePageContext } from "@/components/Shell";
import { post, refreshAll, useApi } from "@/lib/client";
import { useBack } from "@/lib/nav";

/** A settings sub-page: back to 设置, a title, one short line, then the content. */
export function SubPage({ title, intro, children, back = "/settings", backLabel = t("设置") }: { title: string; intro?: string; children: ReactNode; back?: string; backLabel?: string }) {
  usePageContext({ page: "settings" });
  const goBack = useBack(back);
  return (
    <Stack gap="lg" className="fade-in">
      <div>
        <UnstyledButton onClick={goBack} className="back-link"><IconChevronLeft size={18} />{backLabel}</UnstyledButton>
        <Title order={1} fz={26} mt={6}>{title}</Title>
        {intro && <Text size="sm" className="muted" mt={4}>{intro}</Text>}
      </div>
      {children}
    </Stack>
  );
}

/** A titled white block of rows (iOS-style group). */
export function SettingsGroup({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <Stack gap={6}>
      {title && <Text size="xs" fw={600} className="faint" px={4}>{title}</Text>}
      <Paper className="surface set-group" radius="xl">{children}</Paper>
      {footer && <Text size="xs" className="faint" px={4} lh={1.6}>{footer}</Text>}
    </Stack>
  );
}

/** One row: icon, label, current value, chevron. A link when `href` is set. */
export function Row({ icon: Icon, color = "radar", label, value, badge, href, onClick, right }: {
  icon?: typeof IconChevronRight; color?: string; label: string; value?: ReactNode; badge?: { text: string; color: string }; href?: string; onClick?: () => void; right?: ReactNode;
}) {
  const body = (
    <Group gap="sm" wrap="nowrap" className="set-row">
      {Icon && <ThemeIcon size={30} radius="md" variant="light" color={color} style={{ flex: "none" }}><Icon size={17} /></ThemeIcon>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm">{label}</Text>
        {value && <Text size="xs" className="faint" truncate>{value}</Text>}
      </div>
      {badge && <Badge size="sm" variant="light" color={badge.color} style={{ flex: "none" }}>{badge.text}</Badge>}
      {right}
      {(href || onClick) && !right && <IconChevronRight size={17} className="faint" style={{ flex: "none" }} />}
    </Group>
  );
  if (href) return <Link href={href} className="set-row-link">{body}</Link>;
  if (onClick) return <UnstyledButton onClick={onClick} w="100%" className="set-row-link">{body}</UnstyledButton>;
  return body;
}

/** Label + hint on the left, a control on the right. */
export function Line({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md" className="set-row">
      <div style={{ minWidth: 0 }}><Text size="sm">{label}</Text>{hint && <Text size="xs" className="faint">{hint}</Text>}</div>
      {children}
    </Group>
  );
}

type S = Record<string, string>;
/** Read and save the plain settings table (secrets come back as "已设置"). */
export function useSettings<T extends { settings: S } = { settings: S }>() {
  const api = useApi<T>("/api/settings");
  const [local, setLocal] = useState<S>({});
  const s: S | null = api.data ? { ...api.data.settings, ...local } : null;
  async function save(patch: S, msg = t("已保存")) {
    setLocal((x) => ({ ...x, ...patch }));
    try {
      await post("/api/settings", patch, "PATCH");
      if ("mode" in patch || "demo_set" in patch) refreshAll();
      notifications.show({ message: msg, radius: "lg", autoClose: 1200 });
    } catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  }
  return { s, data: api.data, save, reload: api.reload };
}
