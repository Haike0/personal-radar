"use client";
import { Badge, Button, Group, Paper, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBell, IconBrain, IconBriefcase, IconDatabase, IconGlassFull, IconHeart, IconInfoCircle, IconLock, IconMessages, IconPalette, IconPlayerPlay, IconPlugConnected, IconSparkles, IconWand,
} from "@tabler/icons-react";
import Link from "next/link";
import { Row, SettingsGroup, useSettings } from "@/components/settings/kit";
import { usePageContext } from "@/components/Shell";
import { post, refreshAll, useApi } from "@/lib/client";
import type { OrganizeStatus } from "@/lib/organizer";
import type { SyncStatus } from "@/lib/sync";

type Data = { settings: Record<string, string>; sync: SyncStatus; deepseekKey: boolean; chatModel: string; aiUsage?: { calls: number; usd: number } };
type Chats = { status: { ok: boolean; sessions: number } };
type Push = { devices: number };
const SCENES = [
  { id: "love", label: "生活", icon: IconHeart, color: "pink" },
  { id: "work", label: "职场", icon: IconBriefcase, color: "cyan" },
  { id: "night", label: "夜场", icon: IconGlassFull, color: "violet" },
];

/** One glanceable number that opens its page. */
function Stat({ href, label, value, sub, warn }: { href: string; label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <Paper component={Link} href={href} className="surface stat-tile pressable" radius="xl">
      <Text size="xs" className="muted">{label}</Text>
      <Text fz={19} fw={650} mt={4} truncate c={warn ? "orange" : undefined}>{value}</Text>
      {sub && <Text size="xs" className="faint" truncate>{sub}</Text>}
    </Paper>
  );
}

/** 设置 home: what matters at a glance on top, everything else one tap deeper. */
export default function SettingsPage() {
  usePageContext({ page: "settings" });
  const { s, data, save } = useSettings<Data>();
  const { data: chats } = useApi<Chats>("/api/chatlab");
  const { data: org, reload: reloadOrg } = useApi<OrganizeStatus>("/api/organize");
  const { data: push } = useApi<Push>("/api/push");
  if (!s || !data) return <Stack><Skeleton h={40} w={120} /><Skeleton h={160} radius="xl" /><Skeleton h={220} radius="xl" /></Stack>;

  const n = chats?.status.sessions ?? 0;
  const pending = org?.chats?.filter((c) => c.remainingTextMessages > 0).length ?? 0;
  async function organizeNow() {
    try {
      const r = await post<{ started: boolean; reason?: string }>("/api/organize", { action: "start" });
      notifications.show({ radius: "lg", color: r.started ? undefined : "orange", message: r.started ? "开始整理了，在「整理」里能看进度" : r.reason ?? "没能开始" });
      reloadOrg(); refreshAll();
    } catch (e) { notifications.show({ color: "orange", radius: "lg", message: (e as Error).message }); }
  }
  const lastRun = org?.last ? `上次 ${org.last.startedAt.slice(5, 16)} ${org.last.ok === false ? "失败" : "完成"}` : "还没整理过";

  return (
    <Stack gap="lg" className="fade-in">
      <Group justify="space-between" align="center">
        <Title order={1} fz={28}>设置</Title>
        <Button component={Link} href="/setup" variant="light" radius="xl" size="xs" leftSection={<IconWand size={14} />}>设置向导</Button>
      </Group>

      <SimpleGrid cols={2} spacing="sm">
        <Stat href="/settings/sources" label="聊天来源" value={n ? `${n} 个聊天` : "还没有"} sub={data.sync.at ? `上次导入 ${data.sync.at.slice(5, 16)}` : "点这里导入或连接"} warn={!n} />
        <Stat href="/settings/ai" label="AI 服务" value={data.deepseekKey ? data.chatModel : "还没设置"} sub={data.aiUsage ? `本月 ${data.aiUsage.calls} 次` : "用你自己的密钥"} warn={!data.deepseekKey} />
        <Stat href="/settings/organize" label="自动整理" value={org?.auto ? `每天 ${org.times?.join("、") ?? ""}` : "已关闭"} sub={lastRun} />
        <Stat href="/settings/notifications" label="通知" value={push?.devices ? `${push.devices} 台设备` : "未开启"} sub={s.quiet_start ? `免打扰 ${s.quiet_start}–${s.quiet_end}` : undefined} />
      </SimpleGrid>

      <Paper className="surface" radius="xl" p="md">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600}>{org?.running ? "正在整理…" : "立即整理"}</Text>
            <Text size="xs" className="faint" truncate>{pending ? `${pending} 个聊天有新消息` : "没有新消息要整理"}</Text>
          </div>
          <Button radius="xl" size="sm" leftSection={<IconPlayerPlay size={15} />} loading={!!org?.running} onClick={organizeNow}>整理</Button>
        </Group>
      </Paper>

      <SettingsGroup title="显示哪套数据">
        <Row icon={IconSparkles} color="yellow" label={s.mode === "demo" ? "演示数据" : "我的数据"} value={s.mode === "demo" ? "人和聊天全是编的" : n ? `${n} 个聊天` : "还没有导入"} right={
          <SegmentedControl size="xs" radius="xl" value={s.mode} onChange={(v) => save({ mode: v }, v === "real" ? "已切换到真实数据" : "已切换到演示数据")}
            data={[{ value: "demo", label: "演示" }, { value: "real", label: "真实" }]} />} />
        {s.mode === "demo" && (
          <SimpleGrid cols={3} spacing={8} className="set-pad">
            {SCENES.map((x) => (
              <UnstyledButton key={x.id} onClick={() => save({ demo_set: x.id }, `已换成「${x.label}」`)} className={`assistant-card${(s.demo_set || "love") === x.id ? " is-active" : ""}`}>
                <x.icon size={18} color={`var(--mantine-color-${x.color}-6)`} />
                <Text size="sm" fw={600} mt={4}>{x.label}</Text>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        )}
      </SettingsGroup>

      <SettingsGroup title="数据">
        <Row icon={IconMessages} label="聊天来源" value="聊天软件 · 聚合平台 · 自动导入" href="/settings/sources" />
        <Row icon={IconDatabase} color="gray" label="数据管理" value="数据健康 · 导出 · 删除" href="/settings/data" />
      </SettingsGroup>

      <SettingsGroup title="AI">
        <Row icon={IconPlugConnected} color="violet" label="AI 服务" value={data.deepseekKey ? `问答用 ${data.chatModel}` : "填上你自己的密钥"} badge={data.deepseekKey ? undefined : { text: "缺密钥", color: "orange" }} href="/settings/ai" />
        <Row icon={IconBrain} color="violet" label="整理" value={org?.auto ? `自动 · 下次 ${org.next ?? "—"}` : "手动"} href="/settings/organize" />
        <Row icon={IconLock} color="teal" label="隐私" value="发出去之前隐藏什么、哪些人不发" href="/settings/privacy" />
      </SettingsGroup>

      <SettingsGroup title="通用">
        <Row icon={IconPalette} color="pink" label="外观" value="深浅色 · 底部菜单栏透明度" href="/settings/general" />
        <Row icon={IconBell} color="orange" label="通知" value="手机推送 · 免打扰 · 每日摘要" href="/settings/notifications" />
        <Row icon={IconInfoCircle} color="gray" label="关于" value="版本 · 检查更新 · 反馈" href="/settings/about" />
      </SettingsGroup>
      {s.mode === "demo" && <Badge variant="light" color="yellow" w="fit-content" mx="auto">现在显示的是演示数据</Badge>}
    </Stack>
  );
}
