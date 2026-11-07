"use client";
import { SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { AppearanceControl, GlassControl } from "@/components/SettingsExtras";
import { Line, SettingsGroup, SubPage, useSettings } from "@/components/settings/kit";

export default function GeneralPage() {
  const { s, save } = useSettings();
  if (!s) return <Skeleton h={300} radius="xl" />;
  return (
    <SubPage title="外观">
      <SettingsGroup title="深浅色" footer="只影响这台设备。">
        <Stack className="set-pad"><AppearanceControl /></Stack>
      </SettingsGroup>
      <SettingsGroup title="底部菜单栏" footer="觉得太透、看不清时选「不透明」。只影响这台设备。">
        <Stack className="set-pad"><GlassControl /></Stack>
      </SettingsGroup>
      <SettingsGroup title="演示数据">
        <Line label="演示场景" hint="演示数据全是编的">
          <SegmentedControl size="xs" radius="xl" value={s.demo_set || "life"} onChange={(v) => save({ demo_set: v })}
            data={[{ value: "love", label: "恋人与朋友" }, { value: "night", label: "夜场" }, { value: "life", label: "简单" }]} />
        </Line>
      </SettingsGroup>
      <Text size="xs" className="faint" ta="center">界面语言目前只有中文</Text>
    </SubPage>
  );
}
