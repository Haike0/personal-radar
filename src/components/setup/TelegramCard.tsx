"use client";
import { Anchor, Badge, Button, Checkbox, Group, List, PasswordInput, ScrollArea, Stack, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBrandTelegram, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { post, useApi } from "@/lib/client";
import { t } from "@/lib/i18n";

type TgChat = { id: string; name: string; group: boolean; unread: number };
type Status = { hasKeys: boolean; loggedIn: boolean; live?: boolean; on: boolean; selected: string[]; last: string | null; result: string | null; chats?: TgChat[]; error?: string };
type R = { ok?: boolean; error?: string; needPassword?: boolean; added?: number };

/** Telegram via its official API: your own api_id/api_hash, the login code typed here, new messages arrive live. */
export function TelegramCard() {
  const { data, reload } = useApi<Status>("/api/telegram");
  const [f, setF] = useState({ apiId: "", apiHash: "", phone: "", code: "", password: "" });
  const [stage, setStage] = useState<"phone" | "code" | "password">("phone");
  const [pick, setPick] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const call = async (body: object) => {
    setBusy(true);
    try { return await post<R>("/api/telegram", body); }
    catch (e) { return { ok: false, error: (e as Error).message } as R; }
    finally { setBusy(false); }
  };
  const fail = (r: R) => r.error && notifications.show({ color: "red", radius: "lg", message: t(r.error) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });
  if (!data) return null;
  const chosen = pick ?? data.selected;
  return (
    <Stack gap="sm">
      <Group gap={8} wrap="nowrap"><IconBrandTelegram size={20} color="#229ED9" /><Text fw={650}>{t("Telegram：用官方接口自动同步")}</Text>{data.live && <Badge size="xs" color="teal" variant="light">{t("实时")}</Badge>}</Group>
      <Text size="sm" className="muted" lh={1.6}>{t("用 Telegram 官方提供的接口登录你自己的账号，新消息一来就同步。ReadMe 只读，不发消息，也不会把消息标成已读。登录凭据只存在这台电脑上。")}</Text>

      {!data.hasKeys && (
        <Stack gap="xs">
          <List size="sm" type="ordered" spacing={2}>
            <List.Item>{t("打开")} <Anchor href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org</Anchor>{t("，用你的手机号登录")}</List.Item>
            <List.Item>{t("点「API development tools」，应用名随便填，平台选 Desktop")}</List.Item>
            <List.Item>{t("把页面上的 api_id 和 api_hash 复制到下面")}</List.Item>
          </List>
          <Group grow gap="xs"><TextInput size="sm" radius="md" label="api_id" value={f.apiId} onChange={set("apiId")} /><TextInput size="sm" radius="md" label="api_hash" value={f.apiHash} onChange={set("apiHash")} /></Group>
          <Button radius="md" size="sm" loading={busy} onClick={async () => { const r = await call({ action: "keys", apiId: f.apiId.trim(), apiHash: f.apiHash.trim() }); fail(r); if (r.ok) reload(); }}>{t("保存")}</Button>
        </Stack>
      )}

      {data.hasKeys && !data.loggedIn && (
        <Stack gap="xs">
          {stage === "phone" && <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput style={{ flex: 1 }} size="sm" radius="md" label={t("手机号（带国家区号）")} placeholder="+81 90 0000 0000" value={f.phone} onChange={set("phone")} />
            <Button radius="md" size="sm" loading={busy} onClick={async () => { const r = await call({ action: "code", phone: f.phone }); fail(r); if (r.ok) setStage("code"); }}>{t("发验证码")}</Button>
          </Group>}
          {stage === "code" && <Group gap="xs" align="flex-end" wrap="nowrap">
            <TextInput style={{ flex: 1 }} size="sm" radius="md" label={t("Telegram 发来的验证码")} value={f.code} onChange={set("code")} autoComplete="one-time-code" />
            <Button radius="md" size="sm" loading={busy} onClick={async () => { const r = await call({ action: "signin", code: f.code }); if (r.needPassword) setStage("password"); else { fail(r); if (r.ok) reload(); } }}>{t("登录")}</Button>
          </Group>}
          {stage === "password" && <Group gap="xs" align="flex-end" wrap="nowrap">
            <PasswordInput style={{ flex: 1 }} size="sm" radius="md" label={t("两步验证密码")} value={f.password} onChange={set("password")} />
            <Button radius="md" size="sm" loading={busy} onClick={async () => { const r = await call({ action: "password", password: f.password }); setF({ ...f, password: "" }); fail(r); if (r.ok) reload(); }}>{t("登录")}</Button>
          </Group>}
          {data.error && <Text size="xs" c="red">{t(data.error)}</Text>}
        </Stack>
      )}

      {data.loggedIn && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>{t("选要同步的聊天")}</Text>
          <ScrollArea.Autosize mah={220} type="auto">
            <Stack gap={6}>
              {(data.chats ?? []).map((c) => (
                <Checkbox key={c.id} size="sm" checked={chosen.includes(c.id)} label={<Group gap={6}>{c.name}{c.group && <Badge size="xs" variant="light" color="gray">{t("群聊")}</Badge>}</Group>}
                  onChange={(e) => setPick(e.currentTarget.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))} />
              ))}
            </Stack>
          </ScrollArea.Autosize>
          {pick && <Button size="xs" radius="xl" variant="light" w="fit-content" loading={busy} onClick={async () => { await call({ action: "chats", ids: pick }); setPick(null); reload(); }}>{t("保存选择（{0} 个）", pick.length)}</Button>}
          <Switch checked={data.on} disabled={!data.selected.length} onChange={async (e) => { const r = await call({ action: "on", on: e.currentTarget.checked }); fail(r); reload(); }} label={t("自动同步（ReadMe 开着时新消息实时进来）")} />
          <Group justify="space-between">
            <Text size="xs" className="faint">{data.last ? t("上次同步 {0}：{1}", data.last.slice(5, 16), data.result ?? "") : t("还没同步过")}</Text>
            <Group gap={4}>
              <Button size="compact-sm" radius="xl" variant="subtle" leftSection={<IconRefresh size={14} />} loading={busy} disabled={!data.selected.length}
                onClick={async () => { const r = await call({ action: "sync" }); fail(r); if (r.ok) notifications.show({ radius: "lg", message: r.added ? t("新增 {0} 条消息", r.added) : t("没有新消息") }); reload(); }}>{t("现在同步")}</Button>
              <Button size="compact-sm" radius="xl" variant="subtle" color="gray" onClick={async () => { await call({ action: "logout" }); setStage("phone"); reload(); }}>{t("退出登录")}</Button>
            </Group>
          </Group>
          <Text size="xs" className="faint">{t("群聊只导入查看，不整理。")}</Text>
        </Stack>
      )}
    </Stack>
  );
}
