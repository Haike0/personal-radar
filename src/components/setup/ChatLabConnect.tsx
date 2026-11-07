"use client";
import { Anchor, Badge, Button, Checkbox, Group, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";

type S = { id: string; name: string; platform: string; type: string; messages: number | null };
type Data = { url: string; hasToken: boolean; connected: boolean; selected: string[]; sessions?: S[]; version?: string | null; error?: string };

/** Optional: copy conversations you already have in ChatLab (WeChat, QQ, iMessage… via its importers) through ChatLab's local API. */
export function ChatLabConnect() {
  const { data, reload } = useApi<Data>("/api/chatlab-api");
  const [urlEdit, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [pick, setPick] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!data) return <Text size="xs" className="faint">读取中…</Text>;
  const url = urlEdit ?? data.url;
  const sel = pick ?? data.selected;

  async function connect() {
    setBusy("connect");
    try {
      const r = await fetch("/api/chatlab-api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, token: token || undefined }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setToken(""); reload();
      notifications.show({ radius: "lg", message: `已连上 ChatLab，找到 ${j.sessions.length} 个会话` });
    } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
    finally { setBusy(null); }
  }
  async function sync() {
    setBusy("sync");
    try {
      const r = await post<{ results: { name: string; added: number; error?: string }[] }>("/api/chatlab-api", { ids: sel });
      const bad = r.results.filter((x) => x.error);
      refreshAll(); reload(); setPick(null);
      notifications.show({ radius: "lg", color: bad.length ? "orange" : undefined,
        message: `同步了 ${r.results.length - bad.length} 个会话，新增 ${r.results.reduce((a, x) => a + x.added, 0)} 条${bad.length ? `；失败：${bad[0].error}` : ""}` });
    } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
    finally { setBusy(null); }
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={6} wrap="nowrap"><Text size="sm" fw={600}>从 ChatLab 读取</Text><Badge size="xs" variant="light" color="gray">未实测</Badge></Group>
        {data.connected ? <Badge color="teal">已连接{data.version ? ` · ${data.version}` : ""}</Badge> : data.hasToken ? <Badge color="red">连不上</Badge> : <Badge color="gray">未连接</Badge>}
      </Group>
      <Text size="xs" className="faint" lh={1.6}>
        如果你在用 <Anchor href="https://chatlab.fun" target="_blank" size="xs">ChatLab</Anchor>，可以直接复制它里面的聊天。在 ChatLab「设置 → ChatLab API」启用服务并复制令牌。只读，不会改 ChatLab 里的任何东西。
      </Text>
      {data.error && <Text size="xs" c="red">{data.error}</Text>}
      <Group gap="xs" align="flex-end">
        <TextInput size="xs" radius="md" label="地址" style={{ flex: "1 1 160px" }} value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
        <PasswordInput size="xs" radius="md" label="令牌" style={{ flex: "1 1 160px" }} value={token} onChange={(e) => setToken(e.currentTarget.value)} placeholder={data.hasToken ? "已保存，不改就留空" : "粘贴令牌"} />
        <Button size="xs" radius="md" variant="light" loading={busy === "connect"} disabled={!token && !data.hasToken} onClick={connect}>连接</Button>
      </Group>
      {data.connected && data.sessions && (
        <Stack gap={4}>
          {data.sessions.map((x) => (
            <Checkbox key={x.id} checked={sel.includes(x.id)} onChange={(e) => setPick(e.currentTarget.checked ? [...sel, x.id] : sel.filter((i) => i !== x.id))}
              label={<Text size="sm">{x.name} <Text span size="xs" className="faint">{x.platform}{x.type === "group" ? " · 群聊" : ""}{x.messages != null ? ` · ${x.messages.toLocaleString()} 条` : ""}</Text></Text>} />
          ))}
          <Button size="xs" radius="md" mt={4} w="fit-content" leftSection={<IconRefresh size={14} />} loading={busy === "sync"} disabled={!sel.length} onClick={sync}>同步选中的 {sel.length} 个</Button>
          <Text size="xs" className="faint">之后每次「每天自动整理」前，会先同步这些会话的新消息。</Text>
        </Stack>
      )}
    </Stack>
  );
}
