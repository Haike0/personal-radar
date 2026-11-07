"use client";
import { Paper, Stack, Text } from "@mantine/core";
import { DataControls } from "@/components/DataAbout";
import { DataHealth } from "@/components/SettingsExtras";
import { SettingsGroup, SubPage } from "@/components/settings/kit";

export default function DataPage() {
  return (
    <SubPage title="数据管理">
      <SettingsGroup title="数据健康">
        <Stack className="set-pad"><DataHealth /></Stack>
      </SettingsGroup>
      <SettingsGroup title="带走或清空" footer="数据都在这台电脑的数据目录里（默认 ~/.personal-radar）。导出的是 Radar 写下的记录、分析和设置，不含密钥。">
        <Stack className="set-pad"><DataControls /></Stack>
      </SettingsGroup>
    </SubPage>
  );
}
