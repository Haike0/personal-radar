"use client";
import { t } from "@/lib/i18n";
import { Avatar, Badge, Drawer, Group, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconLock, IconSearch, IconTag, IconUserSearch } from "@tabler/icons-react";
import { useState } from "react";
import { tagColor } from "@/components/TagEditor";
import { scopeKey, scopeLabel, type CompanionContext } from "@/lib/ai/types";
import { initial } from "@/lib/format";
import type { Person } from "@/lib/types";

const face = (p: Person, size: number) => (
  <Avatar src={`/api/avatar/${encodeURIComponent(p.key)}`} size={size} radius={size > 30 ? 10 : 7} variant="gradient" gradient={{ from: "radar.5", to: "violet.5", deg: 135 }} style={{ flex: "none" }}>{initial(p.name)}</Avatar>
);

/**
 * "问谁的事": one button above the AI chat. Opens a searchable sheet where you pick one person,
 * or a whole tag (恋人 / 同事…). `extra` are scopes that came from the page you opened the AI on
 * (this item, this day), shown on top so you can go back to them.
 */
export function PersonPicker({ people, value, extra = [], onChange }: {
  people: Person[]; value: CompanionContext; extra?: CompanionContext[]; onChange: (c: CompanionContext) => void;
}) {
  const desktop = useMediaQuery("(min-width: 48em)", false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = value.page === "person" ? people.find((p) => p.key === value.personKey) : undefined;
  const tags = [...new Set(people.flatMap((p) => p.tags ?? []))];
  const count = (t: string) => people.filter((p) => p.tags?.includes(t)).length;
  const k = q.trim().toLowerCase();
  const hit = (p: Person) => !k || p.name.toLowerCase().includes(k) || (p.tags ?? []).some((t) => t.toLowerCase().includes(k));
  const pick = (c: CompanionContext) => { onChange(c); setOpen(false); setQ(""); };
  const narrowed = value.page !== "home" && value.page !== "companion" && value.page !== "timeline" && value.page !== "people" && value.page !== "settings";
  // without a search: people grouped under their first tag, untagged last (like a contact book)
  const groups = k ? [{ title: "", list: people.filter(hit) }]
    : [...tags.map((t) => ({ title: t, list: people.filter((p) => p.tags?.[0] === t) })), { title: t("没加标签"), list: people.filter((p) => !p.tags?.length) }].filter((g) => g.list.length);
  const shownTags = tags.filter((t) => !k || t.toLowerCase().includes(k));

  const label = cur ? cur.name : value.page === "tag" ? t("{0} · {1} 人", value.tag, count(value.tag)) : narrowed ? scopeLabel(value) : t("选人或标签");
  return (
    <>
      <UnstyledButton className="who-btn pressable" onClick={() => setOpen(true)} aria-label={t("选择问谁的事")}>
        {cur ? face(cur, 24)
          : <span className="who-all">{value.page === "tag" ? <IconTag size={14} /> : narrowed ? <IconLock size={13} /> : <IconUserSearch size={14} />}</span>}
        <Text size="sm" fw={600} truncate c={narrowed ? undefined : "dimmed"}>{label}</Text>
        <IconChevronDown size={14} className="faint" style={{ flex: "none" }} />
      </UnstyledButton>
      <Drawer opened={open} onClose={() => setOpen(false)} position={desktop ? "right" : "bottom"} size={desktop ? 380 : "auto"} zIndex={650}
        title={<Text fw={650}>{t("问谁的事")}</Text>} styles={{ body: { paddingBottom: "calc(var(--safe-bottom) + 12px)" }, content: desktop ? undefined : { height: "auto", maxHeight: "85dvh" } }}>
        <Stack gap="md">
          <TextInput radius="xl" placeholder={t("搜名字或标签")} leftSection={<IconSearch size={15} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} data-autofocus />

          {!k && extra.length > 0 && (
            <Stack gap={4}>
              <Text size="xs" fw={600} className="muted">{t("刚才在看的")}</Text>
              {extra.map((c) => (
                <UnstyledButton key={scopeKey(c)} className="contact-row" data-active={scopeKey(c) === scopeKey(value) || undefined} onClick={() => pick(c)}>
                  <span className="who-all big"><IconLock size={18} /></span>
                  <div className="contact-body"><Text fw={550} truncate>{c.page === "person" ? t("{0}的全部记录", c.personName ?? t("这个人")) : scopeLabel(c)}</Text></div>
                </UnstyledButton>
              ))}
            </Stack>
          )}

          {shownTags.length > 0 && (
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="xs" fw={600} className="muted">{t("按标签问一群人")}</Text>
                {narrowed && !k && <UnstyledButton onClick={() => pick({ page: "home" })}><Text size="xs" c="radar">{t("不限定")}</Text></UnstyledButton>}
              </Group>
              <Group gap={6}>
                {shownTags.map((t) => (
                  <UnstyledButton key={t} onClick={() => pick({ page: "tag", tag: t })} className={`ai-pill${value.page === "tag" && value.tag === t ? " is-active" : ""}`}>
                    <IconTag size={12} color={`var(--mantine-color-${tagColor(t)}-6)`} /> {t} <Text span size="xs" className="faint">{count(t)}</Text>
                  </UnstyledButton>
                ))}
              </Group>
            </Stack>
          )}

          <Stack gap={4}>
            {groups.map((g) => (
              <div key={g.title || "all"}>
                {g.title && <div className="group-head"><Text size="xs" fw={600} className="muted">{g.title}</Text><span /><Text size="xs" className="faint">{g.list.length}</Text></div>}
                {g.list.map((p) => (
                  <UnstyledButton key={p.key} className="contact-row" data-active={p.key === cur?.key || undefined} onClick={() => pick({ page: "person", personKey: p.key, personName: p.name })}>
                    {face(p, 40)}
                    <div className="contact-body">
                      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                        <Text fw={550} truncate>{p.name}</Text>
                        {p.tags?.map((t) => <Badge key={t} size="xs" variant="light" color={tagColor(t)} radius="sm" tt="none" style={{ flex: "none" }}>{t}</Badge>)}
                      </Group>
                    </div>
                  </UnstyledButton>
                ))}
              </div>
            ))}
            {!groups.length && !shownTags.length && <Text size="sm" className="faint" ta="center" py="lg">{t("没有找到")}</Text>}
          </Stack>
        </Stack>
      </Drawer>
    </>
  );
}
