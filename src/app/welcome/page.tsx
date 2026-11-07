"use client";
import { Button, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconBell, IconLock, IconMessageCircle, IconRadar2, IconUserHeart } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post, refreshAll } from "@/lib/client";

const POINTS = [
  { icon: IconMessageCircle, title: "从聊天里找出要记住的事", text: "约了几点、答应过什么、安排改了没有，都按日期整理好，每条能点回原话。" },
  { icon: IconUserHeart, title: "每个人一份画像", text: "喜好、忌讳、近况、对你提过的要求，越聊越完整。" },
  { icon: IconBell, title: "快到日子时提醒你", text: "手机加到主屏幕后能收推送；不想被打扰的时段可以关掉。" },
  { icon: IconLock, title: "数据只在你的电脑上", text: "AI 用你自己的密钥；发出去之前会先隐藏电话、邮箱、卡号这些信息。" },
];

/** First screen of a fresh install: what this is, then either look at the demo or start with your own chats. */
export default function Welcome() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function go(state: "demo" | "setup") {
    setBusy(state);
    if (state === "demo") { await post("/api/onboarding", { state: "demo" }); refreshAll(); router.replace("/"); }
    else router.push("/setup");
  }
  return (
    <Stack gap={36} maw={520} mx="auto" pt={{ base: 24, sm: 56 }} className="fade-in">
      <Stack gap="md" align="flex-start">
        <ThemeIcon size={56} radius="lg" variant="gradient" gradient={{ from: "radar.5", to: "violet.6", deg: 135 }}>
          <IconRadar2 size={32} />
        </ThemeIcon>
        <div>
          <Title order={1} fz={32} lh={1.2}>Personal Radar</Title>
          <Text size="lg" className="muted" mt={8} lh={1.6}>把聊天记录变成你对身边人的记忆。</Text>
        </div>
      </Stack>
      <Stack gap="lg">
        {POINTS.map((p) => (
          <Group key={p.title} gap="md" wrap="nowrap" align="flex-start">
            <ThemeIcon size={36} radius="md" variant="light" style={{ flex: "none" }}><p.icon size={20} /></ThemeIcon>
            <div>
              <Text fw={600}>{p.title}</Text>
              <Text size="sm" className="muted" lh={1.6}>{p.text}</Text>
            </div>
          </Group>
        ))}
      </Stack>
      <Stack gap="sm">
        <Button size="md" radius="xl" loading={busy === "setup"} onClick={() => go("setup")}>用我自己的聊天</Button>
        <Button size="md" radius="xl" variant="light" loading={busy === "demo"} onClick={() => go("demo")}>先看演示（全是编的）</Button>
        <Text size="xs" className="faint" ta="center">支持 LINE、WhatsApp、Telegram、Discord、Instagram 和 ChatLab 的导出。</Text>
      </Stack>
    </Stack>
  );
}
