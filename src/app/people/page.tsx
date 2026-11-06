"use client";
import { Avatar, Badge, Collapse, Group, Paper, Skeleton, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconUsersGroup } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";
import { initial, sinceText } from "@/lib/format";
import type { Person } from "@/lib/types";

const fmtTs = (t: number) => { const d = new Date(t * 1000); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

function PersonRow({ p }: { p: Person }) {
  return (
    <Paper component={Link} href={`/people/${encodeURIComponent(p.key)}`} className="surface pressable" p="md" radius="xl">
      <Group wrap="nowrap">
        <Avatar src={p.isGroup ? undefined : `/api/avatar/${encodeURIComponent(p.key)}`} radius="xl" size={48} variant={p.isGroup ? "light" : "gradient"} color="violet" gradient={{ from: "radar.5", to: "violet.5", deg: 135 }}>
          {p.isGroup ? <IconUsersGroup size={22} /> : initial(p.name)}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group gap={6}><Text fw={600}>{p.name}</Text>{p.open > 0 && <Badge size="xs" color="red" variant="filled">{p.open}</Badge>}</Group>
          <Text size="xs" className="muted" truncate>
            {p.topTitle ? `关注：${p.topTitle}` : p.total ? `${p.total} 条记录` : "还没有记录"}
          </Text>
          {(p.lastTs || p.messages) && <Text size="xs" className="faint">{p.lastTs ? `最近联系 ${sinceText(fmtTs(p.lastTs))}` : ""}{p.messages ? ` · 聊天 ${p.messages.toLocaleString()} 条` : ""}</Text>}
        </div>
        <IconChevronRight size={18} className="faint" />
      </Group>
    </Paper>
  );
}

export default function People() {
  usePageContext({ page: "people" });
  const { data, loading } = useApi<{ people: Person[] }>("/api/people");
  const [showGroups, setShowGroups] = useState(false);
  const people = data?.people ?? [];
  const contacts = people.filter((p) => !p.isGroup);
  const groups = people.filter((p) => p.isGroup);
  return (
    <Stack gap="lg" className="fade-in">
      <div>
        <Title order={1} fz={28}>人物</Title>
        <Text className="muted" size="sm" mt={4}>每个人的画像、动态和要关心的事。只记事实，不打亲密度之类的分数。</Text>
      </div>
      {loading && !data ? <Stack>{[0, 1, 2].map((i) => <Skeleton key={i} h={80} radius="xl" />)}</Stack> : (
        <>
          <Stack gap="sm">{contacts.map((p) => <PersonRow key={p.key} p={p} />)}{!contacts.length && <Text className="faint" ta="center" py="xl">还没有联系人</Text>}</Stack>
          {groups.length > 0 && (
            <Stack gap="xs">
              <UnstyledButton onClick={() => setShowGroups((s) => !s)}>
                <Group gap={6}><Text size="sm" className="muted">群聊 · {groups.length}（暂不做画像）</Text>
                  <IconChevronDown size={14} style={{ transform: showGroups ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} /></Group>
              </UnstyledButton>
              <Collapse expanded={showGroups}><Stack gap="sm">{groups.map((p) => <PersonRow key={p.key} p={p} />)}</Stack></Collapse>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
