"use client";
import { Box, Drawer, Group, Text } from "@mantine/core";
import { BottomSheet } from "./BottomSheet";
import { IconSparkles } from "@tabler/icons-react";
import type { CompanionContext } from "@/lib/ai/types";
import { AiChat } from "./AiChat";

/** Floating AI drawer (opened from any page) and the page variant. The chat itself lives in AiChat. */
export function Companion({ opened, onClose, context, seedPrompt, mode, desktop }: {
  opened?: boolean; onClose?: () => void; context: CompanionContext; seedPrompt?: string; mode: "drawer" | "page"; desktop?: boolean;
}) {
  if (mode === "page") return <AiChat layout="page" context={context} picker />;
  // phone: a sheet from the bottom that stays above the keyboard; desktop: a side panel
  if (!desktop) return (
    <BottomSheet opened={!!opened} onClose={onClose!} label="AI 助手" fill>
      <Box style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <AiChat layout="drawer" context={context} seedPrompt={seedPrompt} onNavigate={onClose} />
      </Box>
    </BottomSheet>
  );
  return (
    <Drawer opened={!!opened} onClose={onClose!} position="right" size={480}
      title={<Group gap={8}><IconSparkles size={18} color="var(--mantine-color-violet-5)" /><Text fw={650}>AI 助手</Text></Group>}
      styles={{ content: { display: "flex", flexDirection: "column" }, body: { flex: 1, padding: 0, display: "flex", flexDirection: "column", minHeight: 0 } }}>
      <AiChat layout="drawer" context={context} seedPrompt={seedPrompt} onNavigate={onClose} />
    </Drawer>
  );
}
