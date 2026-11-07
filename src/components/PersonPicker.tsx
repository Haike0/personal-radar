"use client";
import { Avatar, Badge, Drawer, Group, ScrollArea, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconChevronDown, IconSearch, IconUsers } from "@tabler/icons-react";
import { useState } from "react";
import { tagColor } from "@/components/TagEditor";
import { initial } from "@/lib/format";
import type { Person } from "@/lib/types";

/** "和谁聊": a button showing who the AI is about; opens a searchable list grouped by tags. */
export function PersonPicker({ people, value, onChange }: { people: Person[]; value: string | null; onChange: (key: string | null) => void }) {
  const desktop = useMediaQuery("(min-width: 48em)", false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const cur = people.find((p) => p.key === value);
  const tags = [...new Set(people.flatMap((p) => p.tags ?? []))];
  const list = people.filter((p) => (!tag || p.tags?.includes(tag)) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  const pick = (k: string | null) => { onChange(k); setOpen(false); setQ(""); };
  return (
    <>
      <UnstyledButton className="who-btn pressable" onClick={() => setOpen(true)} aria-label="选择和谁聊">
        {cur ? <Avatar src={`/api/avatar/${encodeURIComponent(cur.key)}`} size={24} radius={7} variant="gradient" gradient={{ from: "radar.5", to: "violet.5", deg: 135 }}>{initial(cur.name)}</Avatar>
          : <span className="who-all"><IconUsers size={14} /></span>}
        <Text size="sm" fw={600} truncate>{cur ? cur.name : "所有人"}</Text>
        <IconChevronDown size={14} className="faint" style={{ flex: "none" }} />
      </UnstyledButton>
      <Drawer opened={open} onClose={() => setOpen(false)} position={desktop ? "right" : "bottom"} size={desktop ? 380 : "auto"} zIndex={650}
        title={<Text fw={650}>和谁聊</Text>} styles={{ body: { paddingBottom: "calc(var(--safe-bottom) + 12px)" }, content: desktop ? undefined : { height: "auto", maxHeight: "85dvh" } }}>
        <Stack gap="sm">
          <TextInput radius="xl" placeholder="搜名字或备注" leftSection={<IconSearch size={15} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} data-autofocus />
          {tags.length > 0 && (
            <ScrollArea type="never">
              <Group gap={6} wrap="nowrap">
                {[null, ...tags].map((t) => (
                  <UnstyledButton key={t ?? "all"} onClick={() => setTag(t)} className={`ai-pill${tag === t ? " is-active" : ""}`}>
                    {t ?? "全部"} <Text span size="xs" className="faint">{t ? people.filter((p) => p.tags?.includes(t)).length : people.length}</Text>
                  </UnstyledButton>
                ))}
              </Group>
            </ScrollArea>
          )}
          <Stack gap={0}>
            {!q && !tag && (
              <UnstyledButton className="contact-row" data-active={value === null || undefined} onClick={() => pick(null)}>
                <span className="who-all big"><IconUsers size={20} /></span>
                <div className="contact-body"><Text fw={550}>所有人</Text><Text size="xs" className="faint">一起看所有私聊</Text></div>
              </UnstyledButton>
            )}
            {list.map((p) => (
              <UnstyledButton key={p.key} className="contact-row" data-active={p.key === value || undefined} onClick={() => pick(p.key)}>
                <Avatar src={`/api/avatar/${encodeURIComponent(p.key)}`} size={40} radius={10} variant="gradient" gradient={{ from: "radar.5", to: "violet.5", deg: 135 }} style={{ flex: "none" }}>{initial(p.name)}</Avatar>
                <div className="contact-body">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <Text fw={550} truncate>{p.name}</Text>
                    {p.tags?.map((t) => <Badge key={t} size="xs" variant="light" color={tagColor(t)} radius="sm" tt="none" style={{ flex: "none" }}>{t}</Badge>)}
                  </Group>
                </div>
              </UnstyledButton>
            ))}
            {!list.length && <Text size="sm" className="faint" ta="center" py="lg">没有找到</Text>}
          </Stack>
        </Stack>
      </Drawer>
    </>
  );
}
