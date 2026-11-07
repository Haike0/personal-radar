"use client";
import { Badge, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconApps, IconChevronRight, IconPlugConnected } from "@tabler/icons-react";
import Link from "next/link";
import { SettingsGroup, SubPage } from "@/components/settings/kit";
import { SyncLine } from "@/components/SyncLine";
import { useApi } from "@/lib/client";
import type { SyncStatus } from "@/lib/sync";

type Chats = { status: { ok: boolean; sessions: number }; sessions: { id: string; name: string; platform: string; isGroup: boolean; messages: number }[] };
type Auto = { watch: { on: boolean; dir: string }; hubs: { every: number; last: string | null } };

function Entry({ href, icon: Icon, color, title, text }: { href: string; icon: typeof IconApps; color: string; title: string; text: string }) {
  return (
    <Paper component={Link} href={href} className="surface stat-tile pressable" radius="xl">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <ThemeIcon size={36} radius="md" variant="light" color={color}><Icon size={20} /></ThemeIcon>
        <IconChevronRight size={17} className="faint" />
      </Group>
      <Text fw={650} mt="sm">{title}</Text>
      <Text size="xs" className="faint" mt={2} lh={1.5}>{text}</Text>
    </Paper>
  );
}

export default function SourcesPage() {
  const { data } = useApi<Chats>("/api/chatlab");
  const { data: auto } = useApi<Auto>("/api/auto-import");
  const { data: st } = useApi<{ sync: SyncStatus }>("/api/settings");
  return (
    <SubPage title="聊天来源" intro="从聊天软件的导出文件导入，或连接已经汇总了你聊天的平台。两种都能设成自动。">
      <SimpleGrid cols={2} spacing="sm">
        <Entry href="/settings/sources/apps" icon={IconApps} color="radar" title="聊天软件" text="微信、LINE、QQ、WhatsApp、Telegram 等，导出文件导入" />
        <Entry href="/settings/sources/hubs" icon={IconPlugConnected} color="violet" title="聚合平台" text="Beeper、ChatLab 等，连接一次之后自动同步" />
      </SimpleGrid>
      <SettingsGroup title="自动导入">
        <Group justify="space-between" className="set-row" wrap="nowrap">
          <Text size="sm">自动导入文件夹</Text>
          <Badge variant="light" color={auto?.watch.on ? "teal" : "gray"}>{auto?.watch.on ? "开着" : "关着"}</Badge>
        </Group>
        <Group justify="space-between" className="set-row" wrap="nowrap">
          <Text size="sm">平台自动同步</Text>
          <Badge variant="light" color={auto?.hubs.every ? "teal" : "gray"}>{auto?.hubs.every ? `每 ${auto.hubs.every} 小时` : "关着"}</Badge>
        </Group>
      </SettingsGroup>
      <SettingsGroup title={`已导入的聊天${data?.sessions.length ? ` · ${data.sessions.length}` : ""}`}>
        {data?.sessions.map((c) => (
          <Group key={c.id} justify="space-between" className="set-row" wrap="nowrap">
            <div style={{ minWidth: 0 }}><Text size="sm" truncate>{c.name}</Text><Text size="xs" className="faint">{c.platform}{c.isGroup ? " · 群聊" : ""}</Text></div>
            <Text size="xs" className="faint tabular" style={{ flex: "none" }}>{c.messages.toLocaleString()} 条</Text>
          </Group>
        ))}
        {!data?.sessions.length && <Stack className="set-pad"><Text size="sm" className="faint">还没有。选上面任意一种方式开始。</Text></Stack>}
      </SettingsGroup>
      {st && <SyncLine sync={st.sync} />}
    </SubPage>
  );
}
