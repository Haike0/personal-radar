"use client";
import { Badge, Button, Checkbox, Collapse, Group, Paper, PasswordInput, ScrollArea, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";

type S = { id: string; name: string; platform: string; type: string; messages: number | null };
type Data = { url: string; hasToken: boolean; connected: boolean; selected: string[]; sessions?: S[]; error?: string };
type App = { id: string; name: string; color: string; endpoint: string; tagline: string; steps: string[]; href: string; tokenOptional?: boolean; urlHint?: string };

// Apps that already hold your chats and expose a local, read-only API. No export files: connect once, then sync.
export const APPS: App[] = [
  {
    id: "beeper", name: "Beeper", color: "#5E5CE6", endpoint: "/api/beeper-api", href: "https://www.beeper.com",
    tagline: "一个 App 连 WhatsApp、Telegram、Signal、Instagram、iMessage 等",
    steps: ["装好 Beeper Desktop 并登录你的聊天账号", "设置 → Developers → 打开 Desktop API", "设置 → Integrations →「Approved connections」点 +，复制令牌"],
  },
  {
    id: "chatlab", name: "ChatLab", color: "#7C5CFF", endpoint: "/api/chatlab-api", href: "https://chatlab.fun",
    tagline: "读取 ChatLab 里已经导入的聊天（含 QQ、微信导出等）",
    steps: ["打开 ChatLab", "设置 →「ChatLab API」→ 启用服务", "复制令牌"],
  },
  {
    id: "pull", name: "其他导出工具", color: "#0EA5E9", endpoint: "/api/pull-api", href: "https://docs.chatlab.fun/cn/standard/chatlab-pull", tokenOptional: true, urlHint: "http://127.0.0.1:端口",
    tagline: "支持「ChatLab 远程数据源」的工具，比如抖音聊天导出工具 douyin-chat-export",
    steps: ["打开那个工具并启动它的服务", "在它的说明里找到「ChatLab 远程数据源 / Pull」地址", "把地址填在下面（有令牌就一起填）"],
  },
];

/** "One-tap" sources: pick an app, follow three steps, paste a token, choose chats. */
export function ConnectApps() {
  return (
    <Stack gap="xs">
      <Group gap={6}><Text size="sm" fw={600}>聚合平台</Text><Badge size="xs" variant="light" color="gray">未实测</Badge></Group>
      {APPS.map((a) => <ConnectCard key={a.id} app={a} />)}
    </Stack>
  );
}

function ConnectCard({ app }: { app: App }) {
  const { data, reload } = useApi<Data>(app.endpoint);
  const [open, setOpen] = useState(false);
  const [urlEdit, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [pick, setPick] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const sel = pick ?? data?.selected ?? [];
  const url = urlEdit ?? data?.url ?? "";

  async function connect() {
    setBusy("connect");
    try {
      const r = await fetch(app.endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, token: token || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToken(""); reload();
      notifications.show({ radius: "lg", message: `已连上 ${app.name}，找到 ${j.sessions.length} 个聊天` });
    } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
    finally { setBusy(null); }
  }
  async function sync() {
    setBusy("sync");
    try {
      const r = await post<{ results: { added: number; error?: string }[] }>(app.endpoint, { ids: sel });
      const bad = r.results.filter((x) => x.error);
      refreshAll(); reload(); setPick(null);
      notifications.show({ radius: "lg", color: bad.length ? "orange" : undefined,
        message: `同步了 ${r.results.length - bad.length} 个聊天，新增 ${r.results.reduce((s, x) => s + x.added, 0)} 条${bad.length ? `；失败：${bad[0].error}` : ""}` });
    } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
    finally { setBusy(null); }
  }

  const state = !data ? null : data.connected ? <Badge color="teal" variant="light">已连接</Badge> : data.hasToken ? <Badge color="red" variant="light">连不上</Badge> : null;
  return (
    <Paper className="surface" radius="lg" p={0} style={{ overflow: "hidden" }}>
      <UnstyledButton onClick={() => setOpen((o) => !o)} p="sm" w="100%">
        <Group gap="sm" wrap="nowrap">
          <span className="source-dot" style={{ background: app.color }}>{app.name[0]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={600}>{app.name}</Text>
            <Text size="xs" className="faint" truncate>{app.tagline}</Text>
          </div>
          {state}
          <IconChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform .2s", flex: "none" }} />
        </Group>
      </UnstyledButton>
      <Collapse expanded={open}>
        <Stack gap="sm" px="sm" pb="sm">
          {!data?.connected && (
            <Stack gap={8}>
              {app.steps.map((t, i) => (
                <Group key={i} gap="sm" wrap="nowrap"><span className="step-num">{i + 1}</span><Text size="sm">{t}</Text></Group>
              ))}
            </Stack>
          )}
          {data?.error && <Text size="xs" c="red">{data.error}</Text>}
          <Group gap="xs" align="flex-end">
            <PasswordInput size="xs" radius="md" label="令牌" style={{ flex: "1 1 180px" }} value={token} onChange={(e) => setToken(e.currentTarget.value)} placeholder={app.tokenOptional ? "没有就留空" : data?.hasToken ? "已保存，不改就留空" : "粘贴令牌"} />
            <TextInput size="xs" radius="md" label="地址" style={{ flex: "0 1 190px" }} value={url} placeholder={app.urlHint} onChange={(e) => setUrl(e.currentTarget.value)} />
            <Button size="xs" radius="md" variant="light" loading={busy === "connect"} disabled={app.tokenOptional ? !url : !token && !data?.hasToken} onClick={connect}>{data?.connected ? "重新连接" : "连接"}</Button>
          </Group>
          {data?.connected && data.sessions && (
            <>
              <Text size="xs" className="faint">选要导入的聊天（{data.sessions.length} 个）。只读，不会改 {app.name} 里的任何东西。</Text>
              <ScrollArea.Autosize mah={220} type="auto">
                <Stack gap={4}>
                  {data.sessions.map((x) => (
                    <Checkbox key={x.id} checked={sel.includes(x.id)} onChange={(e) => setPick(e.currentTarget.checked ? [...sel, x.id] : sel.filter((i) => i !== x.id))}
                      label={<Text size="sm">{x.name} <Text span size="xs" className="faint">{x.platform}{x.type === "group" ? " · 群聊" : ""}</Text></Text>} />
                  ))}
                </Stack>
              </ScrollArea.Autosize>
              <Button size="xs" radius="md" w="fit-content" leftSection={<IconRefresh size={14} />} loading={busy === "sync"} disabled={!sel.length} onClick={sync}>导入选中的 {sel.length} 个</Button>
            </>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
