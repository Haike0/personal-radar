"use client";
import { t } from "@/lib/i18n";
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
  { id: "love", label: t("生活"), icon: IconHeart, color: "pink" },
  { id: "work", label: t("职场"), icon: IconBriefcase, color: "cyan" },
  { id: "night", label: t("夜场"), icon: IconGlassFull, color: "violet" },
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
      notifications.show({ radius: "lg", color: r.started ? undefined : "orange", message: r.started ? t("开始整理了，在「整理」里能看进度") : r.reason ?? t("没能开始") });
      reloadOrg(); refreshAll();
    } catch (e) { notifications.show({ color: "orange", radius: "lg", message: (e as Error).message }); }
  }
  const lastRun = org?.last ? t("上次 {0} {1}", org.last.startedAt.slice(5, 16), org.last.ok === false ? t("失败") : t("完成")) : t("还没整理过");

  return (
    <Stack gap="lg" className="fade-in">
      <Group justify="space-between" align="center">
        <Title order={1} fz={28}>{t("设置")}</Title>
        <Button component={Link} href="/setup" variant="light" radius="xl" size="xs" leftSection={<IconWand size={14} />}>{t("设置向导")}</Button>
      </Group>

      <SimpleGrid cols={2} spacing="sm">
        <Stat href="/settings/sources" label={t("聊天来源")} value={n ? t("{0} 个聊天", n) : t("还没有")} sub={data.sync.at ? t("上次导入 {0}", data.sync.at.slice(5, 16)) : t("点这里导入或连接")} warn={!n} />
        <Stat href="/settings/ai" label={t("AI 服务")} value={data.deepseekKey ? data.chatModel : t("还没设置")} sub={data.aiUsage ? t("本月 {0} 次", data.aiUsage.calls) : t("用你自己的密钥")} warn={!data.deepseekKey} />
        <Stat href="/settings/organize" label={t("自动整理")} value={org?.auto ? t("每天 {0}", org.times?.join("、") ?? "") : t("已关闭")} sub={lastRun} />
        <Stat href="/settings/notifications" label={t("通知")} value={push?.devices ? t("{0} 台设备", push.devices) : t("未开启")} sub={s.quiet_start ? t("免打扰 {0}–{1}", s.quiet_start, s.quiet_end) : undefined} />
      </SimpleGrid>

      <Paper className="surface" radius="xl" p="md">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600}>{org?.running ? t("正在整理…") : t("立即整理")}</Text>
            <Text size="xs" className="faint" truncate>{pending ? t("{0} 个聊天有新消息", pending) : t("没有新消息要整理")}</Text>
          </div>
          <Button radius="xl" size="sm" leftSection={<IconPlayerPlay size={15} />} loading={!!org?.running} onClick={organizeNow}>{t("整理")}</Button>
        </Group>
      </Paper>

      <SettingsGroup title={t("显示哪套数据")}>
        <Row icon={IconSparkles} color="yellow" label={s.mode === "demo" ? t("演示数据") : t("我的数据")} value={s.mode === "demo" ? t("人和聊天全是编的") : n ? t("{0} 个聊天", n) : t("还没有导入")} right={
          <SegmentedControl size="xs" radius="xl" value={s.mode} onChange={(v) => save({ mode: v }, v === "real" ? t("已切换到真实数据") : t("已切换到演示数据"))}
            data={[{ value: "demo", label: t("演示") }, { value: "real", label: t("真实") }]} />} />
        {s.mode === "demo" && (
          <SimpleGrid cols={3} spacing={8} className="set-pad">
            {SCENES.map((x) => (
              <UnstyledButton key={x.id} onClick={() => save({ demo_set: x.id }, t("已换成「{0}」", x.label))} className={`assistant-card${(s.demo_set || "love") === x.id ? " is-active" : ""}`}>
                <x.icon size={18} color={`var(--mantine-color-${x.color}-6)`} />
                <Text size="sm" fw={600} mt={4}>{x.label}</Text>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("数据")}>
        <Row icon={IconMessages} label={t("聊天来源")} value={t("聊天软件 · 聚合平台 · 自动导入")} href="/settings/sources" />
        <Row icon={IconDatabase} color="gray" label={t("数据管理")} value={t("数据健康 · 导出 · 删除")} href="/settings/data" />
      </SettingsGroup>

      <SettingsGroup title="AI">
        <Row icon={IconPlugConnected} color="violet" label={t("AI 服务")} value={data.deepseekKey ? t("问答用 {0}", data.chatModel) : t("填上你自己的密钥")} badge={data.deepseekKey ? undefined : { text: t("缺密钥"), color: "orange" }} href="/settings/ai" />
        <Row icon={IconBrain} color="violet" label={t("整理")} value={org?.auto ? t("自动 · 下次 {0}", org.next ?? "—") : t("手动")} href="/settings/organize" />
        <Row icon={IconLock} color="teal" label={t("隐私")} value={t("发出去之前隐藏什么、哪些人不发")} href="/settings/privacy" />
      </SettingsGroup>

      <SettingsGroup title={t("通用")}>
        <Row icon={IconPalette} color="pink" label={t("外观与语言")} value={t("语言 · 深浅色 · 底部菜单栏透明度")} href="/settings/general" />
        <Row icon={IconBell} color="orange" label={t("通知")} value={t("手机推送 · 免打扰 · 每日摘要")} href="/settings/notifications" />
        <Row icon={IconInfoCircle} color="gray" label={t("关于")} value={t("版本 · 检查更新 · 反馈")} href="/settings/about" />
      </SettingsGroup>
      {s.mode === "demo" && <Badge variant="light" color="yellow" w="fit-content" mx="auto">{t("现在显示的是演示数据")}</Badge>}
    </Stack>
  );
}
