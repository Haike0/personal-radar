"use client";
import { Button, Group, Paper, Stack, Stepper, Text, Title } from "@mantine/core";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { usePageContext } from "@/components/Shell";
import { AiService } from "@/components/setup/AiService";
import { ChatLabConnect } from "@/components/setup/ChatLabConnect";
import { ImportPanel } from "@/components/setup/ImportPanel";
import { OrganizePanel } from "@/components/setup/OrganizePanel";
import { PrivacyPanel } from "@/components/setup/PrivacyPanel";
import { post, refreshAll } from "@/lib/client";

const STEPS = [
  { label: "导入聊天", desc: "拖进导出文件" },
  { label: "AI 服务", desc: "用你自己的密钥" },
  { label: "隐私", desc: "什么不发出去" },
  { label: "整理", desc: "变成提醒和画像" },
];

/** First run: get from the demo to your own chats in four steps. Import comes first so nothing has to be configured to look around. */
export default function SetupPage() {
  usePageContext({ page: "settings" });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  async function finish() {
    await post("/api/settings", { mode: "real" }, "PATCH");
    refreshAll();
    setDone(true);
  }
  const body = [
    <Stack key="import" gap="md"><ImportPanel onImported={() => setStep(1)} /><Paper className="surface" radius="lg" p="md"><ChatLabConnect /></Paper></Stack>,
    <AiService key="ai" onReady={() => setStep(2)} />,
    <PrivacyPanel key="privacy" />,
    <OrganizePanel key="organize" />,
  ][step];

  return (
    <Stack gap="lg" className="fade-in">
      <div>
        <Title order={1} fz={28}>用自己的聊天</Title>
        <Text size="sm" className="muted" mt={4}>四步。聊天只在这台电脑上读取；只有整理和提问时，过滤、脱敏后的内容才会发给你选的 AI 服务。</Text>
      </div>
      <Stepper active={step} onStepClick={setStep} size="sm" allowNextStepsSelect>
        {STEPS.map((s) => <Stepper.Step key={s.label} label={s.label} description={s.desc} />)}
      </Stepper>
      <Paper className="surface" radius="xl" p="lg">{body}</Paper>
      <Group justify="space-between">
        <Button variant="subtle" color="gray" radius="md" disabled={step === 0} onClick={() => setStep(step - 1)}>上一步</Button>
        {step < STEPS.length - 1
          ? <Button radius="md" rightSection={<IconArrowRight size={16} />} onClick={() => setStep(step + 1)}>{step === 1 ? "下一步（可以以后再设）" : "下一步"}</Button>
          : done
            ? <Button component={Link} href="/" radius="md" color="teal" leftSection={<IconCheck size={16} />}>去「今天」看看</Button>
            : <Button radius="md" onClick={finish}>完成，切换到我的数据</Button>}
      </Group>
      <Text size="xs" className="faint">这些设置以后都能在「设置」里改。随时可以在「设置 → 数据」切回演示数据。</Text>
    </Stack>
  );
}
