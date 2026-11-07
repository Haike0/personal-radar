"use client";
import { Stack, Title } from "@mantine/core";
import { Companion } from "@/components/Companion";
import { usePageContext } from "@/components/Shell";

export default function CompanionPage() {
  usePageContext({ page: "companion" });
  return (
    <Stack gap="sm" className="fade-in">
      <Title order={1} fz={26}>AI 助手</Title>
      <Companion mode="page" context={{ page: "companion" }} />
    </Stack>
  );
}
