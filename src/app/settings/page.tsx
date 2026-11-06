"use client";
import { Badge, Group, NumberInput, Paper, SegmentedControl, Skeleton, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconActivityHeartbeat, IconBell, IconDatabase, IconLock, IconPalette, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { AppearanceControl, DataHealth, PushControl } from "@/components/SettingsExtras";
import { usePageContext } from "@/components/Shell";
import { SyncLine } from "@/components/SyncLine";
import { post, refreshAll, useApi } from "@/lib/client";
import type { SyncStatus } from "@/lib/sync";

type S = Record<string, string>;
type Data = { settings: S; sync: SyncStatus; deepseekKey: boolean; aiUsage?: { calls: number; usd: number } };

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
      <Title order={1} fz={28}>设置</Title>

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
              data={[{ value: "life", label: "生活" }, { value: "night", label: "夜间接客" }]} />
          </Line>
        )}
        <ChatsLine />
        <SyncLine sync={data.sync} />
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

      <Card icon={IconSparkles} title="AI">
        <Line label="AI 来源">
          <SegmentedControl size="xs" radius="xl" value={s.ai_provider === "deepseek" ? "deepseek" : "mock"} onChange={(v) => save({ ai_provider: v })}
            data={[{ value: "mock", label: "演示" }, { value: "deepseek", label: "真实 AI" }]} />
        </Line>
        <Line label="API 密钥" hint="写在项目根目录的 .env.local（RADAR_AI_KEY），只留在运行服务的电脑上">
          <Badge color={data.deepseekKey ? "teal" : "gray"}>{data.deepseekKey ? "已配置" : "未配置"}</Badge>
        </Line>
        {s.ai_provider === "deepseek" && !data.deepseekKey && <Text size="xs" c="orange">.env.local 里还没有 RADAR_AI_KEY，问答暂时用不了。填好后重启服务。</Text>}
        {data.aiUsage && <Line label="本月用量" hint="按 DeepSeek 高峰价估算，换了服务就只看次数"><Text size="sm">{data.aiUsage.calls} 次 · 约 ${data.aiUsage.usd.toFixed(3)}</Text></Line>}
        <Line label="记录的原话" hint="引用整理过的记录时，只带关键那句，还是连前后几句一起">
          <SegmentedControl size="xs" radius="xl" value={s.ai_share_evidence} onChange={(v) => save({ ai_share_evidence: v })}
            data={[{ value: "minimal", label: "只带关键句" }, { value: "context", label: "含前后文" }]} />
        </Line>
        <Stack gap={4} className="hint-box">
          <Text size="sm" fw={600}>每次提问，AI 服务会收到什么</Text>
          <Text size="xs" className="muted" lh={1.75}>
            ① 和问题最相关的整理记录：只发标题和说明，一个人最多 60 条（不限定人时每人 25 条），以及这个人分析报告的摘要<br />
            ② 其中最相关的最多 10 条记录的原话（按上面的设置，每条 1 句或连前后文 3 句）<br />
            ③ 用问题里的词直接在聊天里搜到的原话，最多 14 条<br />
            ④ 问题里有「最近、这几天、现在」之类的词时，再加最近 50 条聊天<br />
            ⑤ 从某件事打开 AI 时，加上这件事的全部字段、原话，以及之后聊天里提到它的话（最多 8 条）<br />
            ⑥ 这次对话里最近 8 条问答
          </Text>
          <Text size="xs" className="faint" lh={1.6}>上面的设置只管第 ② 和第 ⑤ 项，③ 和 ④ 不受它限制。默认用 DeepSeek（服务器在中国），可以在 .env.local 换成任何兼容 OpenAI 接口的服务。想确认某个问题具体会发出哪些内容，在 AI 对话框里点「发送内容预览」，看到的就是实际要发出的内容，不会发送。</Text>
        </Stack>
      </Card>

      <Card icon={IconLock} title="隐私">
        <Text size="sm" className="muted" lh={1.7}>
          聊天原文只在你自己电脑上的数据库里（默认 ~/.personal-radar），这个 App 只读取、不修改。它另外保存事项、状态、原话引用和你的修改，也都在本机。服务默认只在本机监听。AI 提出的修改都要你点确认才生效，也不会替你给任何人发消息。只有两种时候会把内容发给你配置的 AI 服务：运行 npm run organize 整理聊天时（一段段过滤过的聊天），和你在 App 里提问时（上面「AI」里列出的内容）。
        </Text>
      </Card>
    </Stack>
  );
}
