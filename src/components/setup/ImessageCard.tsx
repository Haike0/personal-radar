"use client";
import { Alert, Button, Code, Group, List, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconLock, IconMessageCircle, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { post, useApi } from "@/lib/client";
import { t } from "@/lib/i18n";

type Status = { on: boolean; groups: boolean; oneWay: boolean; last: string | null; result: string | null; runner: string; platform: string;
  found: { ok: boolean; error?: string; noAccess?: boolean; chats?: number; groups?: number; conversations?: number } };

/** 信息（iMessage / 短信）on this Mac. Without Full Disk Access it shows how to grant it — ReadMe never works around it. */
export function ImessageCard() {
  const { data, reload } = useApi<Status>("/api/imessage");
  const [busy, setBusy] = useState(false);
  if (!data || data.platform !== "darwin") return null;
  const call = async (body: object) => {
    setBusy(true);
    try { const r = await post<{ ok?: boolean; error?: string; added?: number }>("/api/imessage", body); reload(); return r; }
    catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); return null; }
    finally { setBusy(false); }
  };
  const f = data.found;
  return (
    <Stack gap="sm">
      <Group gap={8} wrap="nowrap"><IconMessageCircle size={20} color="#34C759" /><Text fw={650}>{t("信息（iMessage / 短信）：这台 Mac 上自动同步")}</Text></Group>
      <Text size="sm" className="muted" lh={1.6}>{t("直接读这台 Mac「信息」App 里的聊天，只读，不会发消息。默认只同步你回过话的对话，验证码、银行通知这类单向短信不进来。")}</Text>
      {f.noAccess ? (
        <Alert color="orange" radius="lg" icon={<IconLock size={18} />} title={t("需要你在系统设置里开一个权限")} styles={{ body: { minWidth: 0 }, message: { minWidth: 0, overflowWrap: "anywhere" } }}>
          <List size="sm" spacing={4} type="ordered" styles={{ itemWrapper: { display: "inline", whiteSpace: "normal" }, item: { whiteSpace: "normal" } }}>
            <List.Item>{t("打开「系统设置 → 隐私与安全性 → 完全磁盘访问」")}</List.Item>
            <List.Item>{t("点 +，加上你用来启动 ReadMe 的程序：在终端里运行的就加「终端」（或 iTerm 等）；也可以直接加 node：")} <Code block mt={4} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{data.runner}</Code></List.Item>
            <List.Item>{t("打开它旁边的开关，然后退出并重新启动 ReadMe")}</List.Item>
          </List>
          <Text size="xs" mt="xs" className="muted">{t("这个权限只能你自己开，ReadMe 不会也没办法绕过它。")}</Text>
          <Button size="xs" radius="xl" variant="light" mt="sm" onClick={() => reload()}>{t("开好了，重新检查")}</Button>
        </Alert>
      ) : !f.ok ? (
        <Text size="xs" c="red">{t(f.error ?? "读不了")}</Text>
      ) : (
        <>
          <Text size="xs" c="teal">{t("找到 {0} 个对话，其中 {1} 个你回过话", f.chats ?? 0, f.conversations ?? 0)}</Text>
          <Switch checked={data.on} onChange={async (e) => { const on = e.currentTarget.checked; await call({ action: "save", on }); if (on) await call({ action: "sync" }); }} label={t("每 5 分钟自动同步新消息")} />
          <Switch checked={data.groups} onChange={(e) => call({ action: "save", groups: e.currentTarget.checked })} label={t("也同步群聊（只导入查看，不整理）")} />
          <Switch checked={data.oneWay} onChange={(e) => call({ action: "save", oneWay: e.currentTarget.checked })} label={t("也同步没回过的短信（验证码、通知会进来）")} />
          <Group justify="space-between">
            <Text size="xs" className="faint">{data.last ? t("上次同步 {0}：{1}", data.last.slice(5, 16), data.result ?? "") : t("还没同步过")}</Text>
            <Button size="compact-sm" radius="xl" variant="subtle" leftSection={<IconRefresh size={14} />} loading={busy}
              onClick={async () => { const r = await call({ action: "sync" }); if (r?.ok) notifications.show({ radius: "lg", message: r.added ? t("新增 {0} 条消息", r.added) : t("没有新消息") }); }}>{t("现在同步")}</Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
