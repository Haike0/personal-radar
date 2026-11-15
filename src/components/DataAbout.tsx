"use client";
import { t } from "@/lib/i18n";
import { Anchor, Badge, Button, Group, Modal, Paper, Stack, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";

type Upd = { current: string; latest: string | null; url: string | null; available: boolean; off: boolean };

/** Take everything with you, or wipe it. */
export function DataControls() {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  async function wipe() {
    setBusy(true);
    try {
      await post("/api/data/delete", { confirm: word });
      notifications.show({ radius: "lg", message: t("已删除全部数据") });
      setOpen(false); refreshAll(); window.location.href = "/welcome";
    } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Group gap="xs">
        <Button component="a" href="/api/data/export" variant="light" radius="md" size="xs" leftSection={<IconDownload size={14} />}>{t("导出全部记录")}</Button>
        <Button variant="subtle" color="red" radius="md" size="xs" leftSection={<IconTrash size={14} />} onClick={() => setOpen(true)}>{t("删除全部数据")}</Button>
      </Group>
      <Modal opened={open} onClose={() => setOpen(false)} radius="lg" title={<Text fw={650}>{t("删除全部数据")}</Text>}>
        <Stack gap="sm">
          <Text size="sm" lh={1.7}>{t("会删掉导入的聊天、整理出的记录、分析、设置和密钥，回到第一次打开的样子。")}<b>{t("不能恢复。")}</b>{t("建议先「导出全部记录」。")}</Text>
          <Text size="xs" className="faint">{t("不会动你原来的导出文件，也不会动你连接的其他软件里的东西。")}</Text>
          <TextInput radius="md" label={t("输入「{0}」确认", t("删除"))} value={word} onChange={(e) => setWord(e.currentTarget.value)} />
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" radius="md" onClick={() => setOpen(false)}>{t("取消")}</Button>
            <Button color="red" radius="md" disabled={word.trim() !== t("删除")} loading={busy} onClick={wipe}>{t("永久删除")}</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** Version, update check, links. */
export function About() {
  const { data, reload } = useApi<Upd>("/api/updates");
  const toggle = async (on: boolean) => { await post("/api/settings", { update_check: on ? "on" : "off" }, "PATCH"); reload(); };
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm">ReadMe {data ? `v${data.current}` : ""}</Text>
        {data?.available ? <Badge color="orange" variant="light">{t("有新版本 {0}", data.latest)}</Badge> : data && !data.off ? <Badge color="gray" variant="light">{t("已是最新")}</Badge> : null}
      </Group>
      {data?.available && data.url && (
        <Paper className="hint-box" radius="md" p="sm">
          <Text size="sm">{t("新版本 {0} 已发布。", data.latest)}<Anchor href={data.url} target="_blank" size="sm">{t("看看改了什么")}</Anchor>{t("，更新方法见 README。")}</Text>
        </Paper>
      )}
      <Group justify="space-between" wrap="nowrap">
        <div><Text size="sm">{t("自动检查更新")}</Text><Text size="xs" className="faint">{t("每天问一次 GitHub 有没有新版本，不发送你的任何信息")}</Text></div>
        <Switch checked={data ? !data.off : true} onChange={(e) => toggle(e.currentTarget.checked)} />
      </Group>
      <Group gap="md">
        <Anchor href="https://github.com/Haike0/personal-radar" target="_blank" size="xs">GitHub</Anchor>
        <Anchor href="https://github.com/Haike0/personal-radar/issues" target="_blank" size="xs">{t("反馈问题")}</Anchor>
        <Text size="xs" className="faint">{t("AGPL-3.0 开源")}</Text>
      </Group>
    </Stack>
  );
}

/** A one-line notice on the home page when a newer release exists. */
export function UpdateNotice() {
  const { data } = useApi<Upd>("/api/updates");
  if (!data?.available || !data.url) return null;
  return (
    <Paper className="hint-box" radius="xl" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{t("ReadMe 有新版本 {0}", data.latest)}</Text>
        <Anchor href={data.url} target="_blank" size="sm" style={{ flex: "none" }}>{t("看看")}</Anchor>
      </Group>
    </Paper>
  );
}
