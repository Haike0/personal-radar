"use client";
import { t } from "@/lib/i18n";
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
      <Text size="xs" className="faint" style={{ flex: "none" }}>{r.trigger === "auto" ? t("自动") : t("手动")}</Text>
      <Text size="xs" c={r.ok === false ? "red" : undefined} className={r.ok === false ? undefined : "muted"} truncate>
        {r.ok === false ? r.note ?? t("失败") : r.added ? t("新增 {0} 条记录", r.added) : r.note ?? t("完成")}
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

  if (!data) return <Text size="xs" className="faint">{t("读取中…")}</Text>;
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
      if (patch.times) notifications.show({ radius: "lg", message: t("已更新整理时间"), autoClose: 1500 });
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
        <Text size="xs" c="orange">{t("整理要用你自己的 AI 密钥：先到")}{" "} <Anchor component={Link} href="/settings/ai" size="xs">{t("AI 设置")}</Anchor> {" "}{t("填上。")}</Text>
      )}
      <Group justify="space-between" wrap="nowrap" gap="md">
        <div style={{ minWidth: 0 }}>
          <Text size="sm">{t("手动整理")}</Text>
          <Text size="xs" className="faint">
            {running ? t("正在整理（{0} 开始）…", when(data.running!.startedAt))
              : !data.chats.length ? t("还没有可以整理的私聊，先导入聊天（群聊只导入查看，不整理）")
              : left ? t("还有 {0} 条新消息没整理", left.toLocaleString()) : t("聊天都已整理到最新")}
          </Text>
        </div>
        <Button size="sm" radius="md" loading={busy || running} disabled={!data.ready || !data.chats.length} onClick={go} style={{ flex: "none" }}>{t("立即整理")}</Button>
      </Group>

      {data.chats.length > 0 && (
        <Stack gap={6}>
          {data.chats.map((c) => (
            <Group key={c.session} justify="space-between" wrap="nowrap" gap="sm">
              <Text size="xs" className="muted" truncate>{c.name}<span className="faint"> {" "}{t("· {0} 条记录", c.aiItems)}</span></Text>
              <Group gap={4} wrap="nowrap" style={{ flex: "none" }}>
                {c.remainingTextMessages > 0 && (
                  <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconEye size={13} />} onClick={() => show(c)}>{t("会发什么")}</Button>
                )}
                <Badge size="sm" variant="light" color={c.remainingTextMessages ? "orange" : "teal"}>
                  {c.remainingTextMessages ? t("还差 {0} 条", c.remainingTextMessages.toLocaleString()) : t("已到最新")}
                </Badge>
              </Group>
            </Group>
          ))}
        </Stack>
      )}

      <Group justify="space-between" wrap="nowrap" gap="md">
        <div style={{ minWidth: 0 }}>
          <Text size="sm">{t("自动整理")}</Text>
          <Text size="xs" className="faint">
            {data.auto ? (data.next ? t("下次 {0}；App 开着时才会运行，先同步已连接的平台", data.next) : t("还没设时间")) : t("已关闭，只在你按按钮时整理")}
          </Text>
        </div>
        <Switch checked={data.auto} onChange={(e) => schedule({ auto: e.currentTarget.checked })} aria-label={t("自动整理")} />
      </Group>
      {data.auto && (
        <Group gap={8}>
          {data.times.map((tm) => (
            <Group key={tm} gap={2} wrap="nowrap" className="time-chip">
              <TextInput type="time" size="xs" w={92} variant="unstyled" value={tm} aria-label={t("整理时间 {0}", tm)}
                onChange={(e) => { const v = e.currentTarget.value; if (v) setTimes(data.times.map((x) => (x === tm ? v : x))); }} />
              <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t("删除 {0}", tm)} onClick={() => setTimes(data.times.filter((x) => x !== tm))}><IconX size={13} /></ActionIcon>
            </Group>
          ))}
          {draft === null ? (
            <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setDraft("12:00")} disabled={data.times.length >= 6}>{t("加时间")}</Button>
          ) : (
            <Group gap={4} wrap="nowrap">
              <TextInput type="time" size="xs" w={100} value={draft} onChange={(e) => setDraft(e.currentTarget.value)} autoFocus aria-label={t("新的整理时间")} />
              <Button size="compact-sm" onClick={() => { setTimes([...data.times, draft]); setDraft(null); }}>{t("添加")}</Button>
              <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setDraft(null)}>{t("取消")}</Button>
            </Group>
          )}
        </Group>
      )}

      {(data.recent.length > 0 || running) && (
        <Stack gap={4}>
          <Text size="xs" className="faint">{t("最近几次 · 用 {0}", data.model)}</Text>
          {data.recent.slice(0, 4).map((r) => <RunLine key={r.id} r={r} />)}
          {data.log.length > 0 && (
            <>
              <UnstyledButton onClick={() => setShowLog((x) => !x)} className="rules-toggle">
                <Text size="xs" className="muted">{running ? t("正在做什么") : t("上次的记录")}</Text>
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
      <Text size="xs" className="faint" lh={1.6}>{t("新消息按每段约 400 条发给整理模型，发出前先按「隐私」里的规则脱敏。聊天很长时一次只整理一部分，剩下的下次接着来，进度不会丢。")}</Text>

      <Modal opened={!!peek} onClose={() => setPeek(null)} size="lg" radius="lg" title={<Text fw={650}>{t("整理「{0}」时，第一段会发出去的内容（前 60 行）", peek?.name)}</Text>}>
        <Stack gap="xs">
          <Text size="xs" className="faint">{t("W = 你，T = 对方。数字是消息编号，AI 只能引用这些编号。{0}这是预览，什么都没发。", peek?.changed ? t("已按隐私规则替换了部分内容。") : "")}</Text>
          <ScrollArea.Autosize mah={420}><Code block style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{peek?.text}</Code></ScrollArea.Autosize>
        </Stack>
      </Modal>
    </Stack>
  );
}
