"use client";
import { Badge, Button, Divider, Group, NumberInput, Paper, SegmentedControl, Skeleton, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconActivityHeartbeat, IconBell, IconChevronRight, IconInfoCircle, IconDatabase, IconFileImport, IconLock, IconPalette, IconPlayerPlay, IconSparkles, IconWand } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { About, DataControls } from "@/components/DataAbout";
import { OrganizeCard } from "@/components/OrganizeCard";
import { AppearanceControl, DataHealth, PushControl } from "@/components/SettingsExtras";
import { usePageContext } from "@/components/Shell";
import { SyncLine } from "@/components/SyncLine";
import { ConnectApps } from "@/components/setup/ConnectApps";
import { ImportPanel } from "@/components/setup/ImportPanel";
import { PrivacyPanel } from "@/components/setup/PrivacyPanel";
import { post, refreshAll, useApi } from "@/lib/client";
import type { SyncStatus } from "@/lib/sync";

type S = Record<string, string>;
type Data = { settings: S; sync: SyncStatus; deepseekKey: boolean; chatModel: string; aiUsage?: { calls: number; usd: number } };

function Card({ icon: Icon, title, children, id }: { icon: typeof IconBell; title: string; children: React.ReactNode; id?: string }) {
  return (
    <Paper className="surface" radius="xl" p="lg" id={id} style={{ scrollMarginTop: 16 }}>
      <Group gap={8} mb="md"><Icon size={18} /><Text fw={650}>{title}</Text></Group>
      <Stack gap="md">{children}</Stack>
    </Paper>
  );
}
function Line({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <div style={{ minWidth: 0 }}><Text size="sm">{label}</Text>{hint && <Text size="xs" className="faint">{hint}</Text>}</div>
      {children}
    </Group>
  );
}

type CL = { status: { ok: boolean; sessions: number; error?: string }; sessions: { id: string; name: string; messages: number }[] };
function ChatsLine() {
  const { data } = useApi<CL>("/api/chatlab");
  return (
    <>
      <Line label="已导入的聊天" hint="只读访问，原文不会被改动">
        {!data ? <Badge color="gray">检查中</Badge> : data.status.ok
          ? <Badge color="teal">{data.status.sessions} 个会话</Badge>
          : <Badge color="gray">还没有</Badge>}
      </Line>
      {data && !data.status.ok && <Text size="xs" className="faint">{data.status.error}</Text>}
      {data?.status.ok && (
        <Text size="xs" className="faint">{data.sessions.map((x) => `${x.name} ${x.messages.toLocaleString()}`).join(" · ")}</Text>
      )}
    </>
  );
}

export default function SettingsPage() {
  usePageContext({ page: "settings" });
  const { data } = useApi<Data>("/api/settings");
  const [local, setLocal] = useState<S>({});
  const s: S | null = data ? { ...data.settings, ...local } : null;

  async function save(patch: S, msg = "已保存") {
    setLocal((x) => ({ ...x, ...patch }));
    try {
      await post("/api/settings", patch, "PATCH");
      if ("mode" in patch || "demo_set" in patch) refreshAll();
      notifications.show({ message: msg, radius: "lg", autoClose: 1500 });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  }
  if (!s || !data) return <Stack><Skeleton h={40} w={120} /><Skeleton h={160} radius="xl" /><Skeleton h={220} radius="xl" /></Stack>;
  const toggle = (k: string) => <Switch checked={s[k] === "on"} onChange={(e) => save({ [k]: e.currentTarget.checked ? "on" : "off" })} />;

  return (
    <Stack gap="lg" className="fade-in">
      <Group justify="space-between" align="center">
        <Title order={1} fz={28}>设置</Title>
        <Button component={Link} href="/setup" variant="light" radius="xl" size="xs" leftSection={<IconWand size={14} />}>设置向导</Button>
      </Group>

      <Card icon={IconActivityHeartbeat} title="数据健康" id="health">
        <DataHealth />
      </Card>

      <Card icon={IconDatabase} title="数据">
        <Line label="显示哪套数据" hint="演示数据是编的，用来体验和测试">
          <SegmentedControl size="xs" radius="xl" value={s.mode} onChange={(v) => save({ mode: v }, v === "real" ? "已切换到真实数据" : "已切换到演示数据")}
            data={[{ value: "demo", label: "演示" }, { value: "real", label: "真实" }]} />
        </Line>
        {s.mode === "demo" && (
          <Line label="演示内容" hint="夜间接客：陪酒女和她的常客（全部是编的）">
            <SegmentedControl size="xs" radius="xl" value={s.demo_set || "life"} onChange={(v) => save({ demo_set: v }, v === "night" ? "已换成夜间接客演示" : "已换成生活演示")}
              data={[{ value: "life", label: "生活" }, { value: "night", label: "夜场" }]} />
          </Line>
        )}
        <ChatsLine />
        <SyncLine sync={data.sync} />
        <DataControls />
      </Card>

      <Card icon={IconFileImport} title="导入聊天" id="import">
        <ImportPanel />
        <Divider />
        <ConnectApps />
      </Card>

      <Card icon={IconPlayerPlay} title="整理" id="organize">
        <OrganizeCard />
      </Card>

      <Card icon={IconPalette} title="外观">
        <AppearanceControl />
        <Text size="xs" className="faint">只影响这台设备。选「跟随系统」时，iPhone 切换深浅色会自动跟着变。</Text>
      </Card>

      <Card icon={IconBell} title="通知">
        <PushControl />
        <Line label="快到日子的事" hint="当天提醒一次；还可以提前几天先提醒一次">{toggle("notify_urgent")}</Line>
        <Line label="过了日子还没处理">{toggle("notify_overdue")}</Line>
        <Line label="延后的事到期">{toggle("notify_snooze")}</Line>
        <Line label="每日摘要" hint="每天最多一条，汇总值得留意的事">
          <Group gap="xs" wrap="nowrap">
            <TextInput type="time" size="xs" w={96} value={s.digest_time} onChange={(e) => save({ digest_time: e.currentTarget.value })} />
            {toggle("notify_digest")}
          </Group>
        </Line>
        <Line label="免打扰">
          <Group gap={4} wrap="nowrap">
            <TextInput type="time" size="xs" w={96} value={s.quiet_start} onChange={(e) => save({ quiet_start: e.currentTarget.value })} />
            <Text size="xs">至</Text>
            <TextInput type="time" size="xs" w={96} value={s.quiet_end} onChange={(e) => save({ quiet_end: e.currentTarget.value })} />
          </Group>
        </Line>
        <Line label="每天最多推送"><NumberInput size="xs" w={80} min={0} max={10} value={Number(s.daily_push_cap)} onChange={(v) => save({ daily_push_cap: String(v || 0) })} suffix=" 条" /></Line>
        <Line label="提前几天提醒"><NumberInput size="xs" w={80} min={0} max={7} value={Number(s.remind_days_before)} onChange={(v) => save({ remind_days_before: String(v || 0) })} suffix=" 天" /></Line>
        <Text size="xs" className="faint">通知由运行服务的电脑直接发给你的手机，内容端到端加密，苹果的推送服务器看不到正文。不想在锁屏上被别人看到，可以在 iPhone「设置 → 通知 → Radar → 显示预览」改成「解锁时」。</Text>
      </Card>

      <Card icon={IconSparkles} title="AI" id="ai">
        <Line label="问答用哪个" hint="「演示」用写好的示例回答，不联网">
          <SegmentedControl size="xs" radius="xl" value={s.ai_provider === "deepseek" ? "deepseek" : "mock"} onChange={(v) => save({ ai_provider: v })}
            data={[{ value: "mock", label: "演示" }, { value: "deepseek", label: "真实模型" }]} />
        </Line>
        <Link href="/settings/ai" className="set-link">
          <div style={{ minWidth: 0 }}>
            <Text size="sm">AI 设置</Text>
            <Text size="xs" className="faint" truncate>模型服务、问答和整理用的模型、发送内容、用量 · 现在问答用 {data.chatModel}{data.aiUsage ? ` · 本月 ${data.aiUsage.calls} 次` : ""}</Text>
          </div>
          <Group gap={6} wrap="nowrap" style={{ flex: "none" }}>
            {!data.deepseekKey && <Badge color="orange" variant="light">缺密钥</Badge>}
            <IconChevronRight size={18} className="faint" />
          </Group>
        </Link>
      </Card>

      <Card icon={IconLock} title="隐私" id="privacy">
        <PrivacyPanel />
        <Divider />
        <Text size="xs" className="faint" lh={1.7}>聊天和记录都在你自己的电脑上（默认 ~/.personal-radar），只有整理和提问时，脱敏后的内容会发给你选的模型服务。AI 不会替你发消息。</Text>
      </Card>

      <Card icon={IconInfoCircle} title="关于" id="about">
        <About />
      </Card>
    </Stack>
  );
}
