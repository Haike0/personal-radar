"use client";
import { Stack, Text, Title } from "@mantine/core";
import { Companion } from "@/components/Companion";
import { usePageContext } from "@/components/Shell";

export default function CompanionPage() {
  usePageContext({ page: "companion" });
  return (
    <Stack gap="sm" className="fade-in">
      <div>
        <Title order={1} fz={26}>AI 助手</Title>
        <Text size="sm" className="muted" mt={2}>根据你的聊天记录回答，每个结论都能点开看原话。对话会保存在你的 Mac 上。</Text>
      </div>
      <Companion mode="page" context={{ page: "companion" }} />
    </Stack>
  );
}
