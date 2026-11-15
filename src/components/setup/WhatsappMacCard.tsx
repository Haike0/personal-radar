"use client";
import { Alert, Badge, Button, Code, Group, List, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandWhatsapp, IconLock, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { post, useApi } from "@/lib/client";
import { t } from "@/lib/i18n";

type Status = { on: boolean; groups: boolean; last: string | null; result: string | null; installed: boolean; runner: string; platform: string;
  found: { ok: boolean; error?: string; noAccess?: boolean; chats?: number; groups?: number } };

/** WhatsApp Desktop on this Mac, read-only. Marked untested until someone runs it against a real install. */
export function WhatsappMacCard() {
  const { data, reload } = useApi<Status>("/api/whatsapp-mac");
  const [busy, setBusy] = useState(false);
  if (!data || data.platform !== "darwin") return null;
  const call = async (body: object) => {
    setBusy(true);
    try { const r = await post<{ ok?: boolean; error?: string; added?: number }>("/api/whatsapp-mac", body); reload(); return r; }
    catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); return null; }
    finally { setBusy(false); }
  };
  const f = data.found;
  return (
    <Stack gap="sm">
      <Group gap={8} wrap="nowrap"><IconBrandWhatsapp size={20} color="#25D366" /><Text fw={650}>{t("WhatsApp 电脑版：这台 Mac 上自动同步")}</Text><Badge size="xs" variant="light" color="gray">{t("未实测")}</Badge></Group>
      <Text size="sm" className="muted" lh={1.6}>{t("WhatsApp 电脑版把聊天存在这台 Mac 上。ReadMe 只读它，不会发消息。这个功能按公开的数据格式做，还没在真机上测过，遇到问题欢迎反馈。")}</Text>
      {!data.installed ? <Text size="xs" className="faint">{t("没找到 WhatsApp 电脑版的数据：先在这台 Mac 上安装并登录 WhatsApp")}</Text>
      : f.noAccess ? (
        <Alert color="orange" radius="lg" icon={<IconLock size={18} />} title={t("需要你在系统设置里开一个权限")} styles={{ body: { minWidth: 0 }, message: { minWidth: 0, overflowWrap: "anywhere" } }}>
          <List size="sm" spacing={4} type="ordered">
            <List.Item>{t("打开「系统设置 → 隐私与安全性 → 完全磁盘访问」")}</List.Item>
            <List.Item>{t("点 +，加上你用来启动 ReadMe 的程序：在终端里运行的就加「终端」（或 iTerm 等）；也可以直接加 node：")} <Code block mt={4} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{data.runner}</Code></List.Item>
            <List.Item>{t("打开它旁边的开关，然后退出并重新启动 ReadMe")}</List.Item>
          </List>
          <Button size="xs" radius="xl" variant="light" mt="sm" onClick={() => reload()}>{t("开好了，重新检查")}</Button>
        </Alert>
      ) : !f.ok ? <Text size="xs" c="red">{t(f.error ?? "读不了")}</Text> : (
        <>
          <Text size="xs" c="teal">{t("找到 {0} 个私聊、{1} 个群聊", (f.chats ?? 0) - (f.groups ?? 0), f.groups ?? 0)}</Text>
          <Switch checked={data.on} onChange={async (e) => { const on = e.currentTarget.checked; await call({ action: "save", on }); if (on) await call({ action: "sync" }); }} label={t("每 5 分钟自动同步新消息")} />
          <Switch checked={data.groups} onChange={(e) => call({ action: "save", groups: e.currentTarget.checked })} label={t("也同步群聊（只导入查看，不整理）")} />
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
