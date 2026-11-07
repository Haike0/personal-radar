"use client";
import { ActionIcon, Anchor, Badge, Button, Code, Collapse, Group, Modal, ScrollArea, Stack, Switch, Text, TextInput, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconEye, IconPlus, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";
import type { ChatStatus, OrganizeStatus, Run } from "@/lib/organizer";

const when = (t: string) => t.slice(5, 16).replace("-", "/");
const oops = (e: unknown) => notifications.show({ color: "orange", radius: "lg", message: (e as Error).message });

function RunLine({ r }: { r: Run }) {
  return (
    <Group gap={8} wrap="nowrap">
      <Text size="xs" className="faint tabular" style={{ flex: "none" }}>{when(r.startedAt)}</Text>
      <Text size="xs" className="faint" style={{ flex: "none" }}>{r.trigger === "auto" ? "自动" : "手动"}</Text>
      <Text size="xs" c={r.ok === false ? "red" : undefined} className={r.ok === false ? undefined : "muted"} truncate>
        {r.ok === false ? r.note ?? "失败" : r.added ? `新增 ${r.added} 条记录` : r.note ?? "完成"}
      </Text>
    </Group>
  );
}

/** 整理: the 立即整理 button, the schedule (editable times), what each chat still has to go, and what the last runs did. */
export function OrganizeCard() {
  const { data, reload } = useApi<OrganizeStatus>("/api/organize");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [peek, setPeek] = useState<{ name: string; text: string; changed: boolean } | null>(null);
  const running = !!data?.running;

  // poll while a run is going; refresh everything when it ends
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 2000);
    return () => { clearInterval(t); refreshAll(); };
  }, [running, reload]);

  if (!data) return <Text size="xs" className="faint">读取中…</Text>;
  const left = data.chats.reduce((n, c) => n + c.remainingTextMessages, 0);

  async function go() {
    setBusy(true);
    try { await post("/api/organize", { action: "start" }); reload(); }
    catch (e) { oops(e); }
    finally { setBusy(false); }
  }
  async function schedule(patch: { auto?: boolean; times?: string[] }) {
    try {
      await post("/api/organize", { action: "schedule", ...patch });
      if (patch.times) notifications.show({ radius: "lg", message: "已更新整理时间", autoClose: 1500 });
    } catch (e) { oops(e); }
    reload();
  }
  const setTimes = (list: string[]) => schedule({ times: [...new Set(list.filter(Boolean))].sort() });
  async function show(c: ChatStatus) {
    try { setPeek({ name: c.name, ...(await post<{ text: string; changed: boolean }>("/api/organize", { action: "preview", session: c.session })) }); }
    catch (e) { oops(e); }
  }

  return (
    <Stack gap="md">
      {!data.ready && (
        <Text size="xs" c="orange">整理要用你自己的 AI 密钥：先到 <Anchor component={Link} href="/settings/ai" size="xs">AI 设置</Anchor> 填上。</Text>
      )}
      <Group justify="space-between" wrap="nowrap" gap="md">
        <div style={{ minWidth: 0 }}>
          <Text size="sm">手动整理</Text>
          <Text size="xs" className="faint">
            {running ? `正在整理（${when(data.running!.startedAt)} 开始）…`
              : !data.chats.length ? "还没有可以整理的私聊，先导入聊天（群聊只导入查看，不整理）"
              : left ? `还有 ${left.toLocaleString()} 条新消息没整理` : "聊天都已整理到最新"}
          </Text>
        </div>
        <Button size="sm" radius="md" loading={busy || running} disabled={!data.ready || !data.chats.length} onClick={go} style={{ flex: "none" }}>立即整理</Button>
      </Group>

      {data.chats.length > 0 && (
        <Stack gap={6}>
          {data.chats.map((c) => (
            <Group key={c.session} justify="space-between" wrap="nowrap" gap="sm">
              <Text size="xs" className="muted" truncate>{c.name}<span className="faint"> · {c.aiItems} 条记录</span></Text>
              <Group gap={4} wrap="nowrap" style={{ flex: "none" }}>
                {c.remainingTextMessages > 0 && (
                  <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconEye size={13} />} onClick={() => show(c)}>会发什么</Button>
                )}
                <Badge size="sm" variant="light" color={c.remainingTextMessages ? "orange" : "teal"}>
                  {c.remainingTextMessages ? `还差 ${c.remainingTextMessages.toLocaleString()} 条` : "已到最新"}
                </Badge>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      <Group justify="space-between" wrap="nowrap" gap="md">
        <div style={{ minWidth: 0 }}>
          <Text size="sm">自动整理</Text>
          <Text size="xs" className="faint">
            {data.auto ? (data.next ? `下次 ${data.next}；App 开着时才会运行，先同步已连接的平台` : "还没设时间") : "已关闭，只在你按按钮时整理"}
          </Text>
        </div>
        <Switch checked={data.auto} onChange={(e) => schedule({ auto: e.currentTarget.checked })} aria-label="自动整理" />
      </Group>
      {data.auto && (
        <Group gap={8}>
          {data.times.map((t) => (
            <Group key={t} gap={2} wrap="nowrap" className="time-chip">
              <TextInput type="time" size="xs" w={92} variant="unstyled" value={t} aria-label={`整理时间 ${t}`}
                onChange={(e) => { const v = e.currentTarget.value; if (v) setTimes(data.times.map((x) => (x === t ? v : x))); }} />
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={`删除 ${t}`} onClick={() => setTimes(data.times.filter((x) => x !== t))}><IconX size={13} /></ActionIcon>
            </Group>
          ))}
          {draft === null ? (
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setDraft("12:00")} disabled={data.times.length >= 6}>加时间</Button>
          ) : (
            <Group gap={4} wrap="nowrap">
              <TextInput type="time" size="xs" w={100} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} autoFocus aria-label="新的整理时间" />
              <Button size="compact-sm" onClick={() => { setTimes([...data.times, draft]); setDraft(null); }}>添加</Button>
              <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setDraft(null)}>取消</Button>
            </Group>
          )}
        </Group>
      )}

      {(data.recent.length > 0 || running) && (
        <Stack gap={4}>
          <Text size="xs" className="faint">最近几次 · 用 {data.model}</Text>
          {data.recent.slice(0, 4).map((r) => <RunLine key={r.id} r={r} />)}
          {data.log.length > 0 && (
            <>
              <UnstyledButton onClick={() => setShowLog((x) => !x)} className="rules-toggle">
                <Text size="xs" className="muted">{running ? "正在做什么" : "上次的记录"}</Text>
                <IconChevronDown size={14} style={{ transform: showLog || running ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
              </UnstyledButton>
              <Collapse expanded={showLog || running}>
                <ScrollArea.Autosize mah={180} type="auto" className="hint-box">
                  <Code block style={{ background: "transparent", fontSize: 11, whiteSpace: "pre-wrap" }}>{data.log.join("\n")}</Code>
                </ScrollArea.Autosize>
              </Collapse>
            </>
          )}
        </Stack>
      )}
      <Text size="xs" className="faint" lh={1.6}>新消息按每段约 400 条发给整理模型，发出前先按「隐私」里的规则脱敏。聊天很长时一次只整理一部分，剩下的下次接着来，进度不会丢。</Text>

      <Modal opened={!!peek} onClose={() => setPeek(null)} size="lg" radius="lg" title={<Text fw={650}>整理「{peek?.name}」时，第一段会发出去的内容（前 60 行）</Text>}>
        <Stack gap="xs">
          <Text size="xs" className="faint">W = 你，T = 对方。数字是消息编号，AI 只能引用这些编号。{peek?.changed ? "已按隐私规则替换了部分内容。" : ""}这是预览，什么都没发。</Text>
          <ScrollArea.Autosize mah={420}><Code block style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{peek?.text}</Code></ScrollArea.Autosize>
        </Stack>
      </Modal>
    </Stack>
  );
}
