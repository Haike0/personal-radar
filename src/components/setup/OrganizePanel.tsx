"use client";
import { Badge, Button, Code, Group, Modal, ScrollArea, Stack, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye, IconPlayerPlay } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";

type Chat = { session: string; name: string; remainingTextMessages: number; aiItems: number; analysisAt: string | null };
type Status = {
  running: boolean; run: { trigger: string; startedAt: string; finishedAt?: string; exitCode?: number | null } | null; log: string[]; chats: Chat[];
  ai: { ready: boolean; baseUrl: string; model: string }; auto: { on: boolean; time: string; last: string | null };
};

/** Start organizing, watch it run, see exactly what a chat would send, and turn on the daily run. */
export function OrganizePanel() {
  const { data, reload } = useApi<Status>("/api/organize");
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState<{ name: string; text: string; changed: boolean } | null>(null);
  const running = data?.running ?? false;

  // poll while running; refresh everything once it finishes
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 2000);
    return () => { clearInterval(t); refreshAll(); };
  }, [running, reload]);

  if (!data) return <Text size="xs" className="faint">读取中…</Text>;
  const todo = data.chats.filter((c) => c.remainingTextMessages > 0);
  const total = todo.reduce((a, c) => a + c.remainingTextMessages, 0);

  async function start() {
    setBusy(true);
    try { await post("/api/organize", { action: "start" }); reload(); }
    catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function show(c: Chat) {
    try {
      const r = await post<{ text: string; changed: boolean }>("/api/organize", { action: "preview", session: c.session });
      setPeek({ name: c.name, ...r });
    } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
  }
  const auto = (patch: { on?: boolean; time?: string }) => post("/api/organize", { action: "auto", ...patch }).then(reload);

  return (
    <Stack gap="sm">
      {!data.ai.ready && <Text size="xs" c="orange">先在上面设置好 AI 服务，才能整理。</Text>}
      {!data.chats.length && <Text size="xs" className="faint">还没有可以整理的私聊。先导入聊天（群聊只导入查看，不整理）。</Text>}
      {data.chats.map((c) => (
        <Group key={c.session} justify="space-between" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" truncate>{c.name}</Text>
            <Text size="xs" className="faint">{c.aiItems} 条记录{c.analysisAt ? ` · 人物分析 ${c.analysisAt.slice(5, 10)}` : ""}</Text>
          </div>
          <Group gap={6} wrap="nowrap" style={{ flex: "none" }}>
            <Badge color={c.remainingTextMessages ? "orange" : "teal"} variant="light">{c.remainingTextMessages ? `${c.remainingTextMessages.toLocaleString()} 条待整理` : "已到最新"}</Badge>
            {c.remainingTextMessages > 0 && <Button size="compact-xs" variant="subtle" leftSection={<IconEye size={13} />} onClick={() => show(c)}>会发什么</Button>}
          </Group>
        </Group>
      ))}
      <Group gap="xs">
        <Button radius="md" leftSection={<IconPlayerPlay size={16} />} loading={busy || running} disabled={!data.ai.ready || !todo.length} onClick={start}>
          {running ? "整理中…" : todo.length ? `开始整理（${total.toLocaleString()} 条）` : "没有需要整理的"}
        </Button>
        {data.run?.finishedAt && !running && (
          <Text size="xs" className={data.run.exitCode ? undefined : "faint"} c={data.run.exitCode ? "red" : undefined}>
            上次 {data.run.finishedAt.slice(5)}{data.run.trigger === "auto" ? "（自动）" : ""}{data.run.exitCode ? " 出错了，看下面的记录" : " 完成"}
          </Text>
        )}
      </Group>
      <Text size="xs" className="faint" lh={1.6}>
        新消息会按每段约 400 条发给 {data.ai.model}，发出前先按「隐私」里的规则脱敏。聊天很长时一次只整理一部分（每人最多 6 段），剩下的下次接着整理，进度不会丢。
      </Text>
      {(running || data.log.length > 0) && (
        <ScrollArea.Autosize mah={180} type="auto" className="hint-box">
          <Code block style={{ background: "transparent", fontSize: 11, whiteSpace: "pre-wrap" }}>{data.log.join("\n") || "启动中…"}</Code>
        </ScrollArea.Autosize>
      )}
      <Group justify="space-between" wrap="nowrap" gap="md">
        <div><Text size="sm">每天自动整理</Text><Text size="xs" className="faint">App 开着时，到点先同步 ChatLab（如果连了），再整理新消息</Text></div>
        <Group gap="xs" wrap="nowrap">
          <TextInput type="time" size="xs" w={96} value={data.auto.time} onChange={(e) => auto({ time: e.currentTarget.value })} />
          <Switch checked={data.auto.on} onChange={(e) => auto({ on: e.currentTarget.checked })} />
        </Group>
      </Group>

      <Modal opened={!!peek} onClose={() => setPeek(null)} size="lg" radius="lg" title={<Text fw={650}>整理「{peek?.name}」时，第一段会发出去的内容（前 60 行）</Text>}>
        <Stack gap="xs">
          <Text size="xs" className="faint">W = 你，T = 对方。数字是消息编号，AI 只能引用这些编号。{peek?.changed ? "已按隐私规则替换了部分内容。" : ""}这是预览，什么都没发。</Text>
          <ScrollArea.Autosize mah={420}><Code block style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{peek?.text}</Code></ScrollArea.Autosize>
        </Stack>
      </Modal>
    </Stack>
  );
}
