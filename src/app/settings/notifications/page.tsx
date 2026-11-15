"use client";
import { t } from "@/lib/i18n";
import { Group, NumberInput, Paper, Skeleton, Switch, Text, TextInput } from "@mantine/core";
import { PushControl } from "@/components/SettingsExtras";
import { Line, SettingsGroup, SubPage, useSettings } from "@/components/settings/kit";

export default function NotificationsPage() {
  const { s, save } = useSettings();
  if (!s) return <Skeleton h={300} radius="xl" />;
  const toggle = (k: string) => <Switch checked={s[k] === "on"} onChange={(e) => save({ [k]: e.currentTarget.checked ? "on" : "off" })} />;
  return (
    <SubPage title={t("通知")} intro={t("把 ReadMe 加到手机主屏幕后，到日子的事会推送给你。")}>
      <Paper className="surface" radius="xl" p="md"><PushControl /></Paper>
      <SettingsGroup title={t("提醒什么")}>
        <Line label={t("快到日子的事")} hint={t("当天提醒一次")}>{toggle("notify_urgent")}</Line>
        <Line label={t("过了日子还没处理")}>{toggle("notify_overdue")}</Line>
        <Line label={t("延后的事到期")}>{toggle("notify_snooze")}</Line>
        <Line label={t("每日摘要")} hint={t("每天最多一条")}>
          <Group gap="xs" wrap="nowrap">
            <TextInput type="time" size="xs" w={96} value={s.digest_time} onChange={(e) => save({ digest_time: e.currentTarget.value })} />
            {toggle("notify_digest")}
          </Group>
        </Line>
      </SettingsGroup>
      <SettingsGroup title={t("打扰程度")} footer={t("内容端到端加密，苹果和谷歌的推送服务器看不到正文。不想在锁屏上露出内容，可以在手机的通知设置里把 ReadMe 的预览改成「解锁时」。")}>
        <Line label={t("免打扰")}>
          <Group gap={4} wrap="nowrap">
            <TextInput type="time" size="xs" w={92} value={s.quiet_start} onChange={(e) => save({ quiet_start: e.currentTarget.value })} />
            <Text size="xs">{t("至")}</Text>
            <TextInput type="time" size="xs" w={92} value={s.quiet_end} onChange={(e) => save({ quiet_end: e.currentTarget.value })} />
          </Group>
        </Line>
        <Line label={t("每天最多推送")}><NumberInput size="xs" w={80} min={0} max={10} value={Number(s.daily_push_cap)} onChange={(v) => save({ daily_push_cap: String(v || 0) })} suffix={t(" 条")} /></Line>
        <Line label={t("提前几天提醒")}><NumberInput size="xs" w={80} min={0} max={7} value={Number(s.remind_days_before)} onChange={(v) => save({ remind_days_before: String(v || 0) })} suffix={t(" 天")} /></Line>
      </SettingsGroup>
    </SubPage>
  );
}
