"use client";
import { Paper, Text } from "@mantine/core";
import { PrivacyPanel } from "@/components/setup/PrivacyPanel";
import { PrivacySimple } from "@/components/setup/PrivacySimple";
import { SubPage } from "@/components/settings/kit";

export default function PrivacyPage() {
  return (
    <SubPage title="隐私" intro="聊天和记录都在你自己的电脑上。">
      <Paper className="surface" radius="xl" p="lg"><PrivacySimple /></Paper>
      <Text size="sm" fw={600} mt="lg" mb="xs" px={4}>更细的设置</Text>
      <Paper className="surface" radius="xl" p="lg"><PrivacyPanel /></Paper>
    </SubPage>
  );
}
