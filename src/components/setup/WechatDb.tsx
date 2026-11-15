"use client";
import { Badge, Button, Group, Stack, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandWechat, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { post, useApi } from "@/lib/client";
import { t } from "@/lib/i18n";

type Found = { ok: boolean; error?: string; encrypted?: boolean; files: { contact: boolean; messages: number }; private?: { id: string; name: string; messages: number }[]; groups?: unknown[] };
type Status = { dir: string; on: boolean; groups: boolean; last: string | null; result: string | null; found: Found | null };

/** 微信（已解密的数据库）: read-only, kept in sync automatically. Names no tool, by design. */
export function WechatDb() {
  const { data, reload } = useApi<Status>("/api/wechat-db");
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = dir ?? data?.dir ?? "";
  const call = async (body: object) => {
    setBusy(true);
    try { const r = await post<{ ok?: boolean; error?: string; added?: number }>("/api/wechat-db", body); reload(); return r; }
    catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); return null; }
    finally { setBusy(false); }
  };
  const f = data?.found;
  return (
    <Stack gap="sm">
      <Group gap={8} wrap="nowrap">
        <IconBrandWechat size={20} color="#07C160" />
        <Text fw={650}>{t("微信：自动同步已解密的数据库")}</Text>
      </Group>
      <Text size="sm" className="muted" lh={1.6}>
        {t("如果你已经用其他开源工具把微信数据库解密到本机，选那个文件夹，Radar 会自动持续同步。Radar 只读这些文件，不解密、不改动任何东西，也不碰微信本身。")}
      </Text>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TextInput style={{ flex: 1 }} radius="md" size="sm" label={t("文件夹路径")} placeholder="~/…/db_storage" value={value} onChange={(e) => setDir(e.currentTarget.value)} />
        <Button radius="md" size="sm" variant="light" loading={busy} onClick={async () => { await call({ action: "save", dir: value }); setDir(null); }}>{t("检查并保存")}</Button>
      </Group>
      {f && (f.ok
        ? <Text size="xs" c="teal">{t("找到 {0} 个私聊、{1} 个群聊", f.private?.length ?? 0, f.groups?.length ?? 0)}{f.files.contact ? "" : t("（没找到 contact.db，名字会显示成「微信好友」）")}</Text>
        : <Text size="xs" c="red">{f.encrypted ? t("这个文件夹里的库还是加密的，Radar 不处理解密") : f.files.messages ? t(f.error ?? "读不了这个文件夹") : t("这个文件夹里没找到 message_0.db 这类消息库")}</Text>)}
      {f?.ok && (
        <>
          <Switch checked={data!.on} onChange={(e) => call({ action: "save", on: e.currentTarget.checked })} label={t("每 5 分钟自动同步新消息")} />
          <Switch checked={data!.groups} onChange={(e) => call({ action: "save", groups: e.currentTarget.checked })} label={t("也同步群聊（只导入查看，不整理）")} />
          <Group justify="space-between">
            <Text size="xs" className="faint">{data?.last ? t("上次同步 {0}：{1}", data.last.slice(5, 16), data.result ?? "") : t("还没同步过")}</Text>
            <Button size="compact-sm" radius="xl" variant="subtle" leftSection={<IconRefresh size={14} />} loading={busy}
              onClick={async () => { const r = await call({ action: "sync" }); if (r?.ok) notifications.show({ radius: "lg", message: r.added ? t("新增 {0} 条消息", r.added) : t("没有新消息") }); else if (r?.error) notifications.show({ color: "red", radius: "lg", message: r.error }); }}>
              {t("现在同步")}
            </Button>
          </Group>
          {data!.on && <Badge variant="light" color="teal" w="fit-content">{t("自动同步开着")}</Badge>}
        </>
      )}
    </Stack>
  );
}
