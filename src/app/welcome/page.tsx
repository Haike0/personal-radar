"use client";
import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { IconBell, IconBriefcase, IconGlassFull, IconHeart, IconLock, IconMessageCircle, IconRadar2, IconSchool } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post, refreshAll } from "@/lib/client";

const POINTS = [
  { icon: IconMessageCircle, text: "从聊天里找出约好的事、答应过的事、改了的安排" },
  { icon: IconBell, text: "快到日子时提醒你，手机上也能收到" },
  { icon: IconLock, text: "聊天只在你自己的电脑上，AI 用你自己的密钥" },
];

// Demo scenarios. Each one is a fictional circle of people, so you can see what Radar does in that part of life.
const SCENES = [
  { id: "love", icon: IconHeart, color: "pink", title: "恋人与朋友", text: "女朋友、朋友、家人、上司：约会、她的喜好、答应过的事、生日", ready: true },
  { id: "night", icon: IconGlassFull, color: "violet", title: "夜场接客", text: "常客的喜好、来店和同伴、生日、上次聊到哪", ready: true },
  { id: "student", icon: IconSchool, color: "blue", title: "学生", text: "老师、学生会、研讨课、社团：截止日期和分工", ready: false },
  { id: "work", icon: IconBriefcase, color: "cyan", title: "职场", text: "同事、上司、客户：会议、交付、谁答应了什么", ready: false },
];

/** First screen: what this is, pick a scenario to look around, or start with your own chats. */
export default function Welcome() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function demo(set: string) {
    setBusy(set);
    try { await post("/api/onboarding", { state: "demo", demo_set: set }); refreshAll(); router.replace("/"); }
    finally { setBusy(null); }
  }
  return (
    <Stack gap={28} maw={560} mx="auto" pt={{ base: 20, sm: 48 }} className="fade-in">
      <Stack gap="sm" align="flex-start">
        <ThemeIcon size={52} radius="lg" variant="gradient" gradient={{ from: "radar.5", to: "violet.6", deg: 135 }}><IconRadar2 size={30} /></ThemeIcon>
        <Title order={1} fz={30} lh={1.2}>Personal Radar</Title>
        <Text size="lg" className="muted" lh={1.5}>把聊天记录变成你对身边人的记忆。</Text>
        <Stack gap={6} mt={4}>
          {POINTS.map((p) => (
            <Group key={p.text} gap={8} wrap="nowrap"><p.icon size={16} color="var(--mantine-color-radar-6)" style={{ flex: "none" }} /><Text size="sm" className="muted">{p.text}</Text></Group>
          ))}
        </Stack>
      </Stack>

      <Stack gap="sm">
        <Text fw={650}>先看看它怎么用：选一个场景</Text>
        <SimpleGrid cols={2} spacing="sm">
          {SCENES.map((s) => (
            <UnstyledButton key={s.id} disabled={!s.ready || !!busy} onClick={() => demo(s.id)} style={{ opacity: s.ready ? 1 : 0.55 }}>
              <Paper className={`surface scene-card${s.ready ? " pressable" : ""}`} radius="xl" p="md" h="100%">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <ThemeIcon size={34} radius="md" variant="light" color={s.color}><s.icon size={19} /></ThemeIcon>
                  {!s.ready && <Badge size="xs" variant="light" color="gray">制作中</Badge>}
                  {busy === s.id && <Badge size="xs" variant="light">加载中</Badge>}
                </Group>
                <Text fw={650} mt="sm">{s.title}</Text>
                <Text size="xs" className="faint" mt={2} lh={1.5}>{s.text}</Text>
              </Paper>
            </UnstyledButton>
          ))}
        </SimpleGrid>
        <Text size="xs" className="faint">演示里的人和聊天全是编的。</Text>
      </Stack>

      <Stack gap={6}>
        <Button size="md" radius="xl" onClick={() => router.push("/setup")}>用我自己的聊天</Button>
        <Text size="xs" className="faint" ta="center">支持微信、LINE、QQ、WhatsApp、Telegram 等，也能连接 Beeper、ChatLab 自动同步。</Text>
      </Stack>
    </Stack>
  );
}
