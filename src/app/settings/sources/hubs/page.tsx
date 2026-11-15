"use client";
import { t } from "@/lib/i18n";
import { Paper } from "@mantine/core";
import { HubSync } from "@/components/setup/AutoImport";
import { ConnectApps } from "@/components/setup/ConnectApps";
import { SubPage } from "@/components/settings/kit";

export default function HubsPage() {
  return (
    <SubPage title={t("聚合平台")} intro={t("这些软件已经把你的聊天汇总好了。连接一次，Radar 只读地复制你选的聊天，之后自动同步新消息。")} back="/settings/sources" backLabel={t("聊天来源")}>
      <ConnectApps />
      <Paper className="surface" radius="xl" p="lg"><HubSync /></Paper>
    </SubPage>
  );
}
