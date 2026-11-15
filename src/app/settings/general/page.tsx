"use client";
import { t } from "@/lib/i18n";
import { Skeleton, Stack } from "@mantine/core";
import { LangPicker } from "@/components/LangPicker";
import { AppearanceControl, GlassControl } from "@/components/SettingsExtras";
import { SettingsGroup, SubPage, useSettings } from "@/components/settings/kit";

export default function GeneralPage() {
  const { s } = useSettings();
  if (!s) return <Skeleton h={300} radius="xl" />;
  return (
    <SubPage title={t("外观与语言")}>
      <SettingsGroup title={t("界面语言")} footer={t("AI 整理出的内容和演示数据仍是中文。只影响这台设备。")}>
        <Stack className="set-pad"><LangPicker /></Stack>
      </SettingsGroup>
      <SettingsGroup title={t("深浅色")} footer={t("只影响这台设备。")}>
        <Stack className="set-pad"><AppearanceControl /></Stack>
      </SettingsGroup>
      <SettingsGroup title={t("底部菜单栏")} footer={t("觉得太透、看不清时选「不透明」。只影响这台设备。")}>
        <Stack className="set-pad"><GlassControl /></Stack>
      </SettingsGroup>
    </SubPage>
  );
}
