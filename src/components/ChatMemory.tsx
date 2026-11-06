"use client";
import { Badge, Box, Button, Group, Loader, Paper, Skeleton, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronLeft, IconChevronRight, IconSearch, IconSparkles, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCompanion } from "@/components/Shell";
import type { ChatMessage } from "@/lib/chatlab";
import { post, useApi } from "@/lib/client";
import { WEEKDAYS } from "@/lib/format";
import type { Item } from "@/lib/types";

// 聊天记忆 (after ChatLab's 记忆 view): every day you talked, newest first → open a day to read it,
// see what was learned that day, get a short summary, and ask the AI about exactly that day. Plus a search over the words.

type Day = { date: string; messages: number; items: number; summary: string | null };
type DayDetail = { date: string; messages: ChatMessage[]; items: Item[]; summary: { text: string; messages: number; at: string } | null };

const dayLabel = (date: string) => {
  const x = new Date(date + "T00:00:00");
  return `${x.getMonth() + 1}月${x.getDate()}日 ${WEEKDAYS[x.getDay()]}`;
};
const monthLabel = (date: string) => `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`;
const line = { borderTop: "1px solid light-dark(rgba(20,24,39,.07), rgba(255,255,255,.06))" };

function DayList({ days, selected, onPick }: { days: Day[]; selected: string | null; onPick: (d: string) => void }) {
  return (
    <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
      {days.map((d, i) => {
        const header = i === 0 || monthLabel(days[i - 1].date) !== monthLabel(d.date);
        return (
          <Box key={d.date}>
            {header && <Text size="xs" fw={600} className="muted" px="md" pt="sm" pb={4} style={i ? line : undefined}>{monthLabel(d.date)}</Text>}
            <UnstyledButton onClick={() => onPick(d.date)} w="100%" px="md" py={10} className="pressable"
              style={{ background: selected === d.date ? "light-dark(rgba(0,168,145,.08), rgba(52,204,182,.12))" : undefined }}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" fw={550}>{dayLabel(d.date)}</Text>
                <Group gap={6} wrap="nowrap" style={{ flex: "none" }}>
                  {d.items > 0 && <Badge size="xs" color="radar" variant="light">记下 {d.items} 件</Badge>}
                  <Text size="xs" className="faint tabular">{d.messages} 条</Text>
                </Group>
              </Group>
              {d.summary && <Text size="xs" className="muted" lh={1.5} mt={2} lineClamp={1}>{d.summary}</Text>}
            </UnstyledButton>
          </Box>
        );
      })}
    </Paper>
  );
}

function DayView({ personKey, personName, date, onBack, focusId }: { personKey: string; personName: string; date: string; onBack?: () => void; focusId?: string | null }) {
  const { data, loading, reload } = useApi<DayDetail>(`/api/people/${encodeURIComponent(personKey)}/memory?date=${date}`);
  const { openCompanion } = useCompanion();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!focusId || !data) return;
    document.querySelector(`[data-mid="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
  }, [focusId, data]);
  async function summarize() {
    setBusy(true);
    try { await post(`/api/people/${encodeURIComponent(personKey)}/memory`, { date }); reload(); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
    finally { setBusy(false); }
  }
  const ask = () => openCompanion(undefined, { page: "day", personKey, personName, date });
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          {onBack && <Button variant="subtle" color="gray" px={4} onClick={onBack} aria-label="回到日期列表"><IconChevronLeft size={20} /></Button>}
          <div><Text fw={650}>{dayLabel(date)}</Text><Text size="xs" className="faint">{data ? `${data.messages.length} 条消息` : " "}</Text></div>
        </Group>
        <Button size="xs" radius="xl" variant="light" color="violet" leftSection={<IconSparkles size={14} />} onClick={ask}>问 AI 这一天</Button>
      </Group>
      {loading && !data ? <Skeleton h={240} radius="xl" /> : data && (
        <>
          <Paper p="sm" radius="lg" style={{ background: "light-dark(rgba(124,108,240,.05), rgba(124,108,240,.1))" }}>
            {data.summary ? (
              <>
                <Text size="xs" c="violet" fw={600} mb={2}>这天的摘要 · AI 写的</Text>
                <Text size="sm" lh={1.65}>{data.summary.text}</Text>
              </>
            ) : (
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Text size="xs" className="muted" lh={1.5}>这天还没有摘要。生成时只把这一天的消息发给你配置的 AI 服务，生成一次就存下来。</Text>
                <Button size="compact-sm" variant="light" color="violet" loading={busy} onClick={summarize} style={{ flex: "none" }}>生成摘要</Button>
              </Group>
            )}
          </Paper>
          {data.items.length > 0 && (
            <div>
              <Text size="xs" className="faint" mb={4}>这天记下的事</Text>
              <Group gap={6}>{data.items.map((i) => (
                <Badge key={i.id} component={Link} href={`/items/${i.id}`} variant="light" color="gray" radius="xl" size="lg"
                  styles={{ label: { fontWeight: 500, textTransform: "none" } }} style={{ cursor: "pointer", maxWidth: "100%" }}>{i.title}</Badge>
              ))}</Group>
            </div>
          )}
          <Stack gap={6} mt={4}>
            {data.messages.map((m) => (
              <Box key={m.messageId} data-mid={m.messageId} className={`mem-msg${m.isSelf ? " is-me" : ""}${focusId === m.messageId ? " is-focus" : ""}`}>
                <Text size="10px" className="faint">{m.isSelf ? "" : `${m.sender} · `}{m.ts.slice(11)}</Text>
                <Text size="sm" lh={1.55} className="quote-text" style={{ whiteSpace: "pre-wrap" }}>{m.text || "（空）"}</Text>
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

export function ChatMemory({ personKey, personName, initialDate = null }: { personKey: string; personName: string; initialDate?: string | null }) {
  const wide = useMediaQuery("(min-width: 900px)") ?? false;
  const { data, loading } = useApi<{ days: Day[] }>(`/api/people/${encodeURIComponent(personKey)}/memory`);
  const [selected, setSelected] = useState<string | null>(initialDate);
  const top = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ q: string; messages: ChatMessage[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const days = data?.days ?? [];
  const current = selected ?? (wide ? days[0]?.date ?? null : null);

  async function search() {
    const w = q.trim();
    if (!w) { setHits(null); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/people/${encodeURIComponent(personKey)}/memory?q=${encodeURIComponent(w)}`, { cache: "no-store" });
      setHits(await r.json());
    } finally { setSearching(false); }
  }
  const open = (date: string, mid: string | null = null) => { setSelected(date); setFocusId(mid); if (!wide) setTimeout(() => top.current?.scrollIntoView({ block: "start" }), 0); };

  const searchBox = (
    <TextInput radius="xl" placeholder="搜原话，比如「餐厅」「面试」" value={q} onChange={(e) => setQ(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void search(); }}
      leftSection={searching ? <Loader size={14} /> : <IconSearch size={16} />}
      rightSection={q ? <UnstyledButton onClick={() => { setQ(""); setHits(null); }} aria-label="清空搜索"><IconX size={16} /></UnstyledButton> : null} />
  );
  const results = hits && (
    <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
      <Text size="xs" className="faint" px="md" pt="sm" pb={4}>「{hits.q}」找到 {hits.messages.length} 条{hits.messages.length >= 200 ? "（只显示最近 200 条）" : ""}</Text>
      {hits.messages.map((m) => (
        <UnstyledButton key={m.messageId} onClick={() => open(m.ts.slice(0, 10), m.messageId)} w="100%" px="md" py={9} className="pressable" style={line}>
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Box style={{ minWidth: 0 }}>
              <Text size="xs" className="faint">{m.ts.slice(0, 16)} · {m.sender}</Text>
              <Text size="sm" lh={1.5} lineClamp={2}>{m.text}</Text>
            </Box>
            <IconChevronRight size={16} className="faint" style={{ flex: "none" }} />
          </Group>
        </UnstyledButton>
      ))}
    </Paper>
  );

  if (loading && !data) return <Skeleton h={300} radius="xl" />;
  if (!days.length) return <Text className="faint" ta="center" py="xl">还没有和{personName}的聊天记录</Text>;
  if (!wide && current) return <div ref={top} style={{ scrollMarginTop: 12 }}><DayView personKey={personKey} personName={personName} date={current} focusId={focusId} onBack={() => { setSelected(null); setFocusId(null); }} /></div>;
  if (!wide) return <Stack gap="sm">{searchBox}{results ?? <DayList days={days} selected={null} onPick={open} />}</Stack>;
  return (
    <div className="mem-grid">
      <Stack gap="sm" className="mem-side">{searchBox}{results ?? <DayList days={days} selected={current} onPick={open} />}</Stack>
      <div className="mem-main">{current && <DayView key={current} personKey={personKey} personName={personName} date={current} focusId={focusId} />}</div>
    </div>
  );
}
