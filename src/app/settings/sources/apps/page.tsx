"use client";
import { t } from "@/lib/i18n";
import { Paper } from "@mantine/core";
import { WatchFolder } from "@/components/setup/AutoImport";
import { ImportPanel } from "@/components/setup/ImportPanel";
import { SubPage } from "@/components/settings/kit";

export default function AppsPage() {
  return (
    <SubPage title={t("聊天软件")} intro={t("点你的聊天软件看怎么接入：标着「自动」的可以在这台电脑上自动同步，其他的导出文件拖进来。")} back="/settings/sources" backLabel={t("聊天来源")}>
      <Paper className="surface" radius="xl" p="lg"><ImportPanel /></Paper>
      <Paper className="surface" radius="xl" p="lg"><WatchFolder /></Paper>
    </SubPage>
  );
}
