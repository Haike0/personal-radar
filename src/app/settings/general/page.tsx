"use client";
import { Skeleton, Stack, Text } from "@mantine/core";
import { AppearanceControl, GlassControl } from "@/components/SettingsExtras";
import { SettingsGroup, SubPage, useSettings } from "@/components/settings/kit";

export default function GeneralPage() {
  const { s } = useSettings();
  if (!s) return <Skeleton h={300} radius="xl" />;
  return (
    <SubPage title="外观">
      <SettingsGroup title="深浅色" footer="只影响这台设备。">
        <Stack className="set-pad"><AppearanceControl /></Stack>
      </SettingsGroup>
      <SettingsGroup title="底部菜单栏" footer="觉得太透、看不清时选「不透明」。只影响这台设备。">
        <Stack className="set-pad"><GlassControl /></Stack>
      </SettingsGroup>
      <Text size="xs" className="faint" ta="center">界面语言目前只有中文</Text>
    </SubPage>
  );
}
