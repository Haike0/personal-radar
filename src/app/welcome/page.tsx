"use client";
import { t } from "@/lib/i18n";
import { LangPicker } from "@/components/LangPicker";
import { Badge, Button, Group, Paper, Stack, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { IconBell, IconBriefcase, IconGlassFull, IconHeart, IconLock, IconMessageCircle, IconRadar2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post, refreshAll } from "@/lib/client";

const POINTS = [
  { icon: IconMessageCircle, text: t("从聊天里找出约好的事、答应过的事、改了的安排") },
  { icon: IconBell, text: t("快到日子时提醒你，手机上也能收到") },
  { icon: IconLock, text: t("聊天只在你自己的电脑上，AI 用你自己的密钥") },
];

// Demo scenarios. Each one is a fictional circle of people, so you can see what Radar does in that part of life.
const SCENES = [
  { id: "love", icon: IconHeart, color: "pink", title: t("生活"), text: t("恋人、朋友、家人：约会和见家长、TA 们的喜好、你答应过的事、生日") },
  { id: "work", icon: IconBriefcase, color: "cyan", title: t("职场"), text: t("上司、同事、客户：截止日期、改了的会、谁答应了什么、尾款") },
  { id: "night", icon: IconGlassFull, color: "violet", title: t("夜场接客"), text: t("常客的喜好、来店和同伴、生日、上次聊到哪") },
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
        <Group justify="space-between" w="100%" align="flex-start">
          <ThemeIcon size={52} radius="lg" variant="gradient" gradient={{ from: "radar.5", to: "violet.6", deg: 135 }}><IconRadar2 size={30} /></ThemeIcon>
          <LangPicker compact />
        </Group>
        <Title order={1} fz={30} lh={1.2}>Personal Radar</Title>
        <Text size="lg" className="muted" lh={1.5}>{t("把聊天记录变成你对身边人的记忆。")}</Text>
        <Stack gap={6} mt={4}>
          {POINTS.map((p) => (
            <Group key={p.text} gap={8} wrap="nowrap"><p.icon size={16} color="var(--mantine-color-radar-6)" style={{ flex: "none" }} /><Text size="sm" className="muted">{p.text}</Text></Group>
          ))}
        </Stack>
      </Stack>

      <Stack gap="sm">
        <Text fw={650}>{t("先看看它怎么用：选一个场景")}</Text>
        <Stack gap="sm">
          {SCENES.map((s) => (
            <UnstyledButton key={s.id} disabled={!!busy} onClick={() => demo(s.id)}>
              <Paper className="surface scene-card pressable" radius="xl" p="md">
                <Group gap="md" wrap="nowrap" align="flex-start">
                  <ThemeIcon size={40} radius="md" variant="light" color={s.color} style={{ flex: "none" }}><s.icon size={22} /></ThemeIcon>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6}><Text fw={650}>{s.title}</Text>{busy === s.id && <Badge size="xs" variant="light">{t("加载中")}</Badge>}</Group>
                    <Text size="xs" className="faint" mt={2} lh={1.5}>{s.text}</Text>
                  </div>
                </Group>
              </Paper>
            </UnstyledButton>
          ))}
        </Stack>
        <Text size="xs" className="faint">{t("演示里的人和聊天全是编的。")}</Text>
      </Stack>

      <Stack gap={6}>
        <Button size="md" radius="xl" onClick={() => router.push("/setup")}>{t("用我自己的聊天")}</Button>
        <Text size="xs" className="faint" ta="center">{t("支持微信、LINE、QQ、WhatsApp、Telegram 等聊天记录，也能连接汇总聊天的软件自动同步。")}</Text>
      </Stack>
    </Stack>
  );
}
