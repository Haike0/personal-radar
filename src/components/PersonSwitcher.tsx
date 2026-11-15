"use client";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { Avatar, Badge, Drawer, Group, ScrollArea, Skeleton, Text, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronRight, IconUsers } from "@tabler/icons-react";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { tagColor } from "@/components/TagEditor";
import { useApi } from "@/lib/client";
import { pickFocus } from "@/lib/focus";
import { initial, WEEKDAYS } from "@/lib/format";
import type { Item, Person } from "@/lib/types";

// Today and Timeline show one person at a time. The choice is shared between pages and remembered on this device.
const KEY = "radar:person";
const EVT = "radar:person";
let mem: string | null = null; // fallback when storage is blocked (private mode)
const read = () => { try { return localStorage.getItem(KEY) ?? mem; } catch { return mem; } };
const subscribe = (on: () => void) => { window.addEventListener(EVT, on); return () => window.removeEventListener(EVT, on); };

export function useCurrentPerson() {
  const { data, loading } = useApi<{ people: Person[] }>("/api/people");
  // read the saved choice during render (not in an effect), so the page never flashes the first contact before switching
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const contacts = (data?.people ?? []).filter((p) => !p.isGroup);
  const person = contacts.find((p) => p.key === stored) ?? contacts[0] ?? null;
  const pick = (key: string) => {
    mem = key;
    try { localStorage.setItem(KEY, key); } catch { /* private mode: just keep it for this visit */ }
    window.dispatchEvent(new Event(EVT));
  };
  return { person, contacts, pick, loading: loading && !data };
}

/** Messages-style time: today → 10:44, yesterday → 昨天, this week → 周二, older → 10/21 */
function shortWhen(sec: number | null | undefined) {
  if (!sec) return "";
  const d = new Date(sec * 1000), now = new Date();
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  const p = (n: number) => String(n).padStart(2, "0");
  if (days <= 0) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (days === 1) return t("昨天");
  if (days < 7) return WEEKDAYS[d.getDay()];
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function Face({ p, size, className }: { p: Person; size: number; className?: string }) {
  return (
    <Avatar src={`/api/avatar/${encodeURIComponent(p.key)}`} size={size} radius={size * 0.22} variant="gradient" className={className}
      gradient={{ from: "radar.5", to: "violet.5", deg: 135 }} style={{ flex: "none" }}>{initial(p.name)}</Avatar>
  );
}

/** Avatar + name of the person being shown, with a button on the right that lists every contact. */
export function PersonBar({ person, contacts, pick, loading, subtitle }: ReturnType<typeof useCurrentPerson> & { subtitle?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const desktop = useMediaQuery("(min-width: 48em)", false);
  // today's focus count per person, for the red badge in the list (same rule as the Today page)
  const { data: all } = useApi<{ items: Item[] }>(open ? "/api/items" : null);
  const focusCount = useMemo(() => {
    const by = new Map<string, Item[]>();
    for (const i of all?.items ?? []) by.set(i.personKey, [...(by.get(i.personKey) ?? []), i]);
    return new Map([...by].map(([k, list]) => [k, pickFocus(list).length]));
  }, [all]);

  const tags = [...new Set(contacts.flatMap((p) => p.tags ?? []))];
  const shown = tag ? contacts.filter((p) => p.tags?.includes(tag)) : contacts;
  if (loading) return <Skeleton h={64} radius="xl" />;
  if (!person) return <Text className="faint">{t("还没有联系人")}</Text>;
  return (
    <>
      <div className="person-bar surface">
        {/* tap the person → their page (portrait, analysis); tap the right button → switch contact */}
        <Link href={`/people/${encodeURIComponent(person.key)}`} className="person-link pressable" aria-label={t("打开{0}的画像", person.name)}>
          <Face p={person} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Group gap={4} wrap="nowrap"><Text fw={650} truncate>{person.name}</Text><IconChevronRight size={15} className="faint" style={{ flex: "none" }} /></Group>
            {subtitle && <Text size="xs" className="muted" truncate>{subtitle}</Text>}
          </div>
        </Link>
        <UnstyledButton className="person-more pressable" onClick={() => setOpen(true)} aria-label={t("切换联系人")}><IconUsers size={20} stroke={1.7} /></UnstyledButton>
      </div>

      <Drawer opened={open} onClose={() => setOpen(false)} position={desktop ? "right" : "bottom"} size={desktop ? 380 : "auto"}
        title={<Text fw={650}>{t("联系人")}</Text>} styles={{ body: { padding: "0 0 calc(var(--safe-bottom) + 12px)" }, content: desktop ? undefined : { height: "auto", maxHeight: "80dvh" } }}>
        {tags.length > 0 && (
          <ScrollArea type="never" px="md" pb={6}>
            <Group gap={6} wrap="nowrap">
              {[null, ...tags].map((g) => (
                <UnstyledButton key={g ?? "all"} onClick={() => setTag(g)} className={`ai-pill${tag === g ? " is-active" : ""}`}>
                  {g ? t(g) : t("全部")} <Text span size="xs" className="faint">{g ? contacts.filter((p) => p.tags?.includes(g)).length : contacts.length}</Text>
                </UnstyledButton>
              ))}
            </Group>
          </ScrollArea>
        )}
        <div className="contact-index">{tag ?? t("私聊")} · {shown.length}</div>
        {shown.map((p) => {
          const n = focusCount.get(p.key) ?? 0;
          return (
            <UnstyledButton key={p.key} className="contact-row" data-active={p.key === person.key || undefined}
              onClick={() => { pick(p.key); setOpen(false); }}>
              <Face p={p} size={44} />
              <div className="contact-body">
                <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={550} truncate>{p.name}</Text>
                  {p.tags?.map((t) => <Badge key={t} size="xs" variant="light" color={tagColor(t)} radius="sm" tt="none" style={{ flex: "none" }}>{t}</Badge>)}
                </Group>
                <div className="contact-side">
                  <Text size="xs" className="faint tabular">{shortWhen(p.lastTs)}</Text>
                  {n > 0 && <Badge size="sm" color="red" variant="filled" circle aria-label={t("今日焦点 {0} 件", n)}>{n}</Badge>}
                </div>
              </div>
            </UnstyledButton>
          );
        })}
        <Text size="xs" className="faint" ta="center" mt="md" px="md">{t("红色数字是今日焦点的件数")}</Text>
      </Drawer>
    </>
  );
}
