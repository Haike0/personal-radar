"use client";
import { Paper } from "@mantine/core";
import { PrivacyPanel } from "@/components/setup/PrivacyPanel";
import { SubPage } from "@/components/settings/kit";

export default function PrivacyPage() {
  return (
    <SubPage title="隐私" intro="聊天和记录都在你自己的电脑上。只有整理和提问时，处理过的内容才会发给你选的模型服务。">
      <Paper className="surface" radius="xl" p="lg"><PrivacyPanel /></Paper>
    </SubPage>
  );
}
