"use client";
import { t } from "@/lib/i18n";
import { Paper } from "@mantine/core";
import { OrganizeCard } from "@/components/OrganizeCard";
import { SubPage } from "@/components/settings/kit";

export default function OrganizePage() {
  return (
    <SubPage title={t("整理")} intro={t("AI 把新聊天整理成提醒、承诺和画像。可以手动点，也可以每天定时。")}>
      <Paper className="surface" radius="xl" p="lg"><OrganizeCard /></Paper>
    </SubPage>
  );
}
