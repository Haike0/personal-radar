"use client";
import { t } from "@/lib/i18n";
import { ActionIcon, Box, Button, Collapse, CopyButton, Group, Menu, Modal, Paper, ScrollArea, SimpleGrid, Stack, Text, Textarea, TextInput, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMediaQuery } from "@mantine/hooks";
import { IconArrowUp, IconCheck, IconChevronRight, IconCopy, IconDots, IconEye, IconHistory, IconPlus, IconSearch, IconSparkles, IconTrash, IconWand } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { PersonPicker } from "@/components/PersonPicker";
import { ASSISTANTS, assistantOf, briefFor, DAY_QUICK, ITEM_QUICK, quickFor } from "@/lib/ai/assistants";
import { scopeKey as keyOf, scopeLabel, scopePerson, type Citation, type CompanionContext, type Proposal, type StreamEvent } from "@/lib/ai/types";
import { BottomSheet } from "./BottomSheet";
import { post, refreshAll, useApi } from "@/lib/client";
import type { Person } from "@/lib/types";
import { Md } from "./Md";

/** long built-in prompts show a short label on their button */
const qLabel = (q: string) => (q.startsWith("见面前简报") ? t("见面前简报：上次聊到哪、谁欠谁什么、这次聊什么") : q);
type Msg = { role: "user" | "assistant"; content: string; citations?: Citation[]; proposals?: Proposal[] };
type Conv = { id: number; personKey: string | null; assistant: string; title: string; updatedAt: string; messages: number; scope: CompanionContext | null };

/**
 * AI chat with saved history and assistant presets.
 * layout "page": full page (optional person picker); "embedded": inside a person tab; "drawer": inside the floating drawer.
 */
export function AiChat({ context, layout, seedPrompt, onNavigate, picker }: {
  context: CompanionContext; layout: "page" | "embedded" | "drawer"; seedPrompt?: string; onNavigate?: () => void; picker?: boolean;
}) {
  const desktop = useMediaQuery("(min-width: 900px)") ?? false;
  const sidebar = desktop && layout !== "drawer";
  const { data: ppl } = useApi<{ people: Person[] }>("/api/people");
  const privates = (ppl?.people ?? []).filter((p) => !p.isGroup);

  // `over`: the scope picked above the chat (a person, a tag, or one restored from a past conversation)
  const [over, setOver] = useState<CompanionContext | null>(null);
  const canPick = picker || context.page === "home" || context.page === "companion";
  const ctx: CompanionContext = over ?? (canPick ? { page: "home" } : context);
  const personKey = scopePerson(ctx);
  const who = ctx.page === "person" || ctx.page === "day" ? (ctx.personName ?? null) : null;
  const itemTitle = ctx.page === "item" ? (ctx.title ?? t("这件事")) : null;
  const quick = (a: ReturnType<typeof assistantOf>) =>
    itemTitle ? ITEM_QUICK : ctx.page === "day" ? DAY_QUICK : who ? [briefFor(who), ...quickFor(a, who)] : quickFor(a, who);
  // scopes from the page the AI was opened on (this item / this day, and its person), offered on top of the picker
  const owner = context.page === "day" || (context.page === "item" && context.personKey) ? { key: context.personKey!, name: context.personName } : null;
  const extra: CompanionContext[] = canPick ? [] : [
    ...(context.page === "item" || context.page === "day" ? [context] : []),
    ...(owner ? [{ page: "person", personKey: owner.key, personName: owner.name } as CompanionContext] : []),
  ];
  const [preview, setPreview] = useState<{ question: string; text: string; chars: number } | null>(null);
  async function showPreview() {
    try { setPreview(await post("/api/ai/preview", { question: input, context: ctx })); }
    catch (e) { notifications.show({ color: "red", message: (e as Error).message }); }
  }

  // the side list (desktop page) shows this scope's person; the phone history sheet shows every chat, searchable
  const convs = useApi<{ conversations: Conv[] }>(`/api/ai/conversations?person=${encodeURIComponent(sidebar ? personKey ?? "" : "*")}`);
  const [historyQ, setHistoryQ] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [assistant, setAssistant] = useState("general");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState("AI");
  const [historyOpen, setHistoryOpen] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const a = assistantOf(assistant);

  // a different scope is a different conversation
  const scopeKey = keyOf(ctx);
  const [seenScope, setSeenScope] = useState(scopeKey);
  if (seenScope !== scopeKey) { setSeenScope(scopeKey); setActiveId(null); setMsgs([]); }

  const sendSeed = useEffectEvent((p: string) => { void send(p); });
  useEffect(() => { if (seedPrompt) sendSeed(seedPrompt); }, [seedPrompt]);
  useEffect(() => { viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  async function open(id: number) {
    setHistoryOpen(false);
    const r = await fetch(`/api/ai/conversations/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const c = (await r.json()) as Conv & { items: Msg[] };
    // reopening an old chat also brings back exactly what it was about
    if (c.scope && keyOf(c.scope) !== scopeKey) { setOver(c.scope); setSeenScope(keyOf(c.scope)); }
    setActiveId(c.id); setAssistant(c.assistant); setMsgs(c.items);
  }
  function fresh() { setActiveId(null); setMsgs([]); setHistoryOpen(false); }
  async function remove(id: number) {
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (id === activeId) fresh();
    convs.reload();
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, context: ctx, assistant, conversationId: activeId }) });
      if (!r.ok || !r.body) throw new Error();
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l) as StreamEvent;
          if (ev.type === "conversation") setActiveId(ev.id);
          else if (ev.type === "meta") setModel(ev.model ?? ev.provider);
          else if (ev.type === "text" || ev.type === "citations" || ev.type === "proposals")
            setMsgs((m) => {
              const last = { ...m[m.length - 1] };
              if (ev.type === "text") last.content += ev.delta;
              else if (ev.type === "citations") last.citations = ev.items;
              else last.proposals = ev.items;
              return [...m.slice(0, -1), last];
            });
        }
      }
    } catch {
      setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: t("连不上家里的 Mac，稍后再试。") }]);
    } finally {
      setBusy(false);
      convs.reload();
    }
  }

  const list = (
    <Stack gap={4}>
      <UnstyledButton onClick={fresh} className="conv-new pressable">
        <Group gap={8}><IconPlus size={16} /><Text size="sm" fw={550}>{t("开始新对话")}</Text></Group>
      </UnstyledButton>
      {!convs.data?.conversations.length && <Text size="xs" className="faint" ta="center" py="lg">{t("还没有历史对话")}</Text>}
      {convs.data?.conversations.filter((c) => !historyQ.trim() || `${c.title} ${c.scope ? scopeLabel(c.scope) : ""}`.includes(historyQ.trim())).map((c) => (
        <Group key={c.id} gap={4} wrap="nowrap" className={`conv-row${c.id === activeId ? " is-active" : ""}`}>
          <UnstyledButton onClick={() => open(c.id)} style={{ flex: 1, minWidth: 0 }} py={8} px={10}>
            <Text size="sm" truncate>{c.title}</Text>
            <Text size="11px" className="faint" truncate>{c.scope ? scopeLabel(c.scope) : c.personKey ? privates.find((p) => p.key === c.personKey)?.name ?? t("某个联系人") : t("所有人")} · {assistantOf(c.assistant).name} · {c.updatedAt.slice(5, 16)}</Text>
          </UnstyledButton>
          <ActionIcon size="sm" variant="subtle" color="gray" className="conv-del" aria-label={t("删除对话")} onClick={() => remove(c.id)}><IconTrash size={14} /></ActionIcon>
        </Group>
      ))}
    </Stack>
  );

  // four assistants up front; the rest behind 更多
  const [moreA, setMoreA] = useState(false);
  const shown = ASSISTANTS.filter((x) => x.pinned || moreA || x.id === assistant);
  const pills = (
    <Stack gap={8} w="100%" maw={560}>
      <SimpleGrid cols={2} spacing={8}>
        {shown.map((x) => (
          <UnstyledButton key={x.id} onClick={() => setAssistant(x.id)} className={`assistant-card${x.id === assistant ? " is-active" : ""}`}>
            <Text size="sm" fw={600}>{x.name}</Text>
            <Text size="xs" className="faint" truncate>{x.desc}</Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      <UnstyledButton onClick={() => setMoreA((m) => !m)} style={{ alignSelf: "center" }}>
        <Text size="xs" c="radar">{moreA ? t("收起") : t("更多助手（{0}）", ASSISTANTS.filter((x) => !x.pinned).length)}</Text>
      </UnstyledButton>
    </Stack>
  );

  const empty = (
    <Stack align="center" gap="md" py={desktop ? 56 : 24} px="xs">
      <Box className="ai-orb"><IconSparkles size={24} /></Box>
      <Title order={3} ta="center" fz={desktop ? 24 : 20}>{who ? t("想知道{0}的什么？", who) : t("想问什么，直接问")}</Title>
      {pills}
      <Text size="xs" className="faint" ta="center" maw={520}>{a.intro}</Text>
      <Stack gap={8} w="100%" maw={560}>
        {quick(a).slice(0, 4).map((q) => (
          <UnstyledButton key={q} className="quick-row pressable" onClick={() => send(q)}>
            <Text size="sm" style={{ flex: 1 }}>{qLabel(q)}</Text>
            <IconChevronRight size={16} className="faint" />
          </UnstyledButton>
        ))}
      </Stack>
    </Stack>
  );

  const thread = (
    <Stack gap="lg" py="md">
      {msgs.map((m, i) => m.role === "user" ? (
        <Group key={i} justify="flex-end"><Box className="bubble-me"><Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{m.content}</Text></Box></Group>
      ) : (
        <Group key={i} align="flex-start" gap={10} wrap="nowrap" className="fade-in">
          <Box className="ai-avatar"><IconSparkles size={14} /></Box>
          <Stack gap={8} style={{ flex: 1, minWidth: 0 }}>
            {m.content ? <Md text={m.content} onCite={onNavigate} /> : <Text size="sm" className="faint typing">{t("正在翻记录…")}</Text>}
            {(m.content && !(busy && i === msgs.length - 1)) && <Answerbar text={m.content} citations={m.citations} onNavigate={onNavigate} />}
            {!!m.proposals?.length && !(busy && i === msgs.length - 1) && <Proposals items={m.proposals} />}
          </Stack>
        </Group>
      ))}
    </Stack>
  );

  const composer = (
    <Box pt="xs" pb={layout === "drawer" ? 8 : 0}>
      <Paper className="composer" radius="xl" p={6} pl={16}>
        <Group gap={8} wrap="nowrap" align="flex-end">
          <Textarea variant="unstyled" style={{ flex: 1 }} placeholder={ctx.page === "day" ? t("问问这一天的事…") : itemTitle ? t("问问这件事…") : who ? t("问问关于{0}的事…", who) : t("问点什么…")} autosize minRows={1} maxRows={6} value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
          <ActionIcon size={36} radius="xl" variant="filled" loading={busy} disabled={!input.trim()} onClick={() => send(input)} aria-label={t("发送")} mb={2}><IconArrowUp size={18} /></ActionIcon>
        </Group>
      </Paper>
    </Box>
  );

  const header = (
    <Group justify="space-between" wrap="nowrap" gap={6} pb={8}>
      <Box style={{ flex: 1, minWidth: 0 }}><PersonPicker people={privates} value={ctx} extra={extra} onChange={setOver} /></Box>
      {!sidebar && <Button size="compact-sm" variant="subtle" color="gray" leftSection={<IconHistory size={15} />} onClick={() => setHistoryOpen(true)}>{t("历史")}</Button>}
      <Button size="compact-sm" variant="light" leftSection={<IconPlus size={15} />} onClick={fresh}>{t("新对话")}</Button>
      <Menu position="bottom-end" withinPortal zIndex={600}>
        <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label={t("更多")}><IconDots size={18} /></ActionIcon></Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{a.name} · {model}</Menu.Label>
          <Menu.Item leftSection={<IconEye size={14} />} onClick={showPreview}>{t("看看这次会发出去什么")}</Menu.Item>
          {msgs.length > 0 && <Menu.Divider />}
          {msgs.length > 0 && <Menu.Label>{t("换个助手")}</Menu.Label>}
          {msgs.length > 0 && ASSISTANTS.map((x) => <Menu.Item key={x.id} onClick={() => setAssistant(x.id)} leftSection={x.id === assistant ? <IconCheck size={14} /> : <span style={{ width: 14 }} />}>{x.name}</Menu.Item>)}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );

  const height = layout === "drawer" ? "100%" : layout === "embedded" ? (desktop ? "min(720px, calc(100dvh - 160px))" : "calc(100dvh - var(--tabbar-h) - var(--safe-bottom) - 140px)") : (desktop ? "calc(100dvh - 150px)" : "calc(100dvh - var(--tabbar-h) - var(--safe-bottom) - 150px)");
  const main = (
    <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
      {header}
      <ScrollArea viewportRef={viewport} style={{ flex: 1 }} type="never">{msgs.length ? thread : empty}</ScrollArea>
      {composer}
    </Stack>
  );

  return (
    <>
      {layout !== "drawer" && <span className="ai-inline" hidden />}
      {sidebar ? (
        <Box className="ai-shell" style={{ height }}>
          <Paper className="surface ai-side" p="sm"><ScrollArea h="100%" type="never">{list}</ScrollArea></Paper>
          <Paper className="surface" p="md" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>{main}</Paper>
        </Box>
      ) : (
        <Box style={{ height, display: "flex", flexDirection: "column" }} px={layout === "drawer" ? "md" : 0}>{main}</Box>
      )}
      <Modal opened={!!preview} onClose={() => setPreview(null)} size="lg" zIndex={500} title={<Text fw={650}>{t("这次提问会发给 AI 服务的内容")}</Text>}>
        {preview && (
          <Stack gap="sm">
            <Text size="xs" className="faint">{t("问题：{0} · 共 {1} 个字符 · 另外还有固定的回答规则和最近 8 轮对话。还没发送，关掉就不会发。", preview.question, preview.chars.toLocaleString())}</Text>
            <Paper className="surface" p="sm" radius="md" mah="60dvh" style={{ overflow: "auto" }}>
              <Text size="xs" style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, Menlo, monospace" }}>{preview.text || t("（这个问题不会附带任何记录）")}</Text>
            </Paper>
          </Stack>
        )}
      </Modal>
      <BottomSheet opened={historyOpen} onClose={() => setHistoryOpen(false)} label={t("历史对话")} zIndex={450} maxHeight={0.8}>
        <Stack gap="sm" px="md" pb="md" style={{ minHeight: 0, flex: 1 }}>
          <Text fw={650}>{t("历史对话")}</Text>
          <TextInput radius="xl" placeholder={t("搜问过的问题、人名")} value={historyQ} onChange={(e) => setHistoryQ(e.currentTarget.value)} leftSection={<IconSearch size={16} />} />
          <Box style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>{list}</Box>
        </Stack>
      </BottomSheet>
    </>
  );
}

function Answerbar({ text, citations, onNavigate }: { text: string; citations?: Citation[]; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap={6}>
      <Group gap={6}>
        <CopyButton value={text}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? t("已复制") : t("复制回答")}><ActionIcon size="sm" variant="subtle" color="gray" onClick={copy} aria-label={t("复制")}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}</ActionIcon></Tooltip>
          )}
        </CopyButton>
        {!!citations?.length && (
          <UnstyledButton onClick={() => setOpen((o) => !o)}><Text size="xs" c="violet">{t("依据 {0} 条记录 {1}", citations.length, open ? "▴" : "▾")}</Text></UnstyledButton>
        )}
      </Group>
      <Collapse expanded={open}>
        <Stack gap={6}>
          {citations?.map((c) => (
            <Paper key={c.itemId} component={Link} href={`/items/${c.itemId}`} onClick={onNavigate} className="surface pressable" p="sm" radius="md">
              <Text size="sm" fw={550}>#{c.itemId} {c.title}</Text>
              {c.quote && (
                <div className="quote" data-key="" style={{ marginTop: 4 }}>
                  <Text size="xs" className="faint">{c.quote.ts.slice(5)} · {c.quote.sender}</Text>
                  <Text size="sm" lineClamp={3}>“{c.quote.text}”</Text>
                </div>
              )}
            </Paper>
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}

/** Changes the AI suggests. Nothing happens until you tap 确认; every applied change can be undone. */
function Proposals({ items }: { items: Proposal[] }) {
  const [state, setState] = useState<Record<string, "done" | "skip" | "busy">>({});
  async function apply(p: Proposal) {
    setState((s) => ({ ...s, [p.id]: "busy" }));
    try {
      const r = await post<{ historyId: number | null }>("/api/ai/apply", p);
      setState((s) => ({ ...s, [p.id]: "done" }));
      refreshAll();
      const nid = `ai-${r.historyId}`;
      notifications.show({ id: nid, radius: "lg", autoClose: 7000, withCloseButton: false, message: (
        <Group justify="space-between" wrap="nowrap"><Text size="sm">{t("已按建议修改")}</Text>
          {r.historyId && <Button size="compact-sm" variant="subtle" onClick={async () => { await post(`/api/history/${r.historyId}/undo`, {}); notifications.hide(nid); refreshAll(); setState((s) => ({ ...s, [p.id]: "skip" })); }}>{t("撤销")}</Button>}
        </Group>) });
    } catch (e) {
      setState((s) => { const n = { ...s }; delete n[p.id]; return n; });
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }
  return (
    <Stack gap={6}>
      <Group gap={6}><IconWand size={14} color="var(--mantine-color-violet-5)" /><Text size="xs" c="violet" fw={600}>{t("AI 建议修改记录（你确认后才生效）")}</Text></Group>
      {items.map((p) => (
        <Paper key={p.id} className="surface" p="sm" radius="md">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Box style={{ minWidth: 0 }}>
              <Text size="sm">{p.label}</Text>
              <Text size="xs" component={Link} href={`/items/${p.itemId}`} c="radar">#{p.itemId}</Text>
            </Box>
            {state[p.id] === "done" ? <Text size="xs" c="teal" style={{ flex: "none" }}>{t("已修改")}</Text>
              : state[p.id] === "skip" ? <Text size="xs" className="faint" style={{ flex: "none" }}>{t("没改")}</Text>
              : <Group gap={4} wrap="nowrap" style={{ flex: "none" }}>
                  <Button size="compact-sm" color="violet" loading={state[p.id] === "busy"} onClick={() => apply(p)}>{t("确认")}</Button>
                  <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setState((s) => ({ ...s, [p.id]: "skip" }))}>{t("不用")}</Button>
                </Group>}
          </Group>
        </Paper>
      ))}
    </Stack>
  );
}
