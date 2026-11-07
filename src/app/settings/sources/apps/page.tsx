"use client";
import { Paper } from "@mantine/core";
import { WatchFolder } from "@/components/setup/AutoImport";
import { ImportPanel } from "@/components/setup/ImportPanel";
import { SubPage } from "@/components/settings/kit";

export default function AppsPage() {
  return (
    <SubPage title="聊天软件" intro="选你的聊天软件看怎么导出，把文件拖进来；或者设一个文件夹，以后自动导入。" back="/settings/sources" backLabel="聊天来源">
      <Paper className="surface" radius="xl" p="lg"><ImportPanel /></Paper>
      <Paper className="surface" radius="xl" p="lg"><WatchFolder /></Paper>
    </SubPage>
  );
}
