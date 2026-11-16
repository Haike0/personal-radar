"use client";
import { t } from "@/lib/i18n";
import { Button, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePageContext } from "@/components/Shell";
import { AiService } from "@/components/setup/AiService";
import { OrganizeCard } from "@/components/OrganizeCard";
import { ConnectApps } from "@/components/setup/ConnectApps";
import { WatchFolder } from "@/components/setup/AutoImport";
import { ImportPanel } from "@/components/setup/ImportPanel";
import { PrivacySimple } from "@/components/setup/PrivacySimple";
import { post, refreshAll } from "@/lib/client";

const STEPS = [
  { label: t("导入聊天"), desc: t("拖进导出文件") },
  { label: t("AI 服务"), desc: t("用你自己的密钥") },
  { label: t("隐私"), desc: t("聊天都在本地") },
  { label: t("整理"), desc: t("变成提醒和画像") },
];

/** First run: get from the demo to your own chats in four steps. Import comes first so nothing has to be configured to look around. */
export default function SetupPage() {
  usePageContext({ page: "settings" });
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  async function finish() {
    await post("/api/settings", { mode: "real" }, "PATCH");
    await post("/api/onboarding", { state: "done" });
    refreshAll();
    setDone(true);
  }
  const router = useRouter();
  async function leave() {
    await post("/api/onboarding", { state: "demo" });
    refreshAll();
    router.replace("/");
  }
  const body = [
    <Stack key="import" gap="md">
      <ImportPanel onImported={() => setStep(1)} />
      <ConnectApps />
      <WatchFolder />
    </Stack>,
    <AiService key="ai" onReady={() => setStep(2)} />,
    <PrivacySimple key="privacy" advancedHref="/settings/privacy" />,
    <OrganizeCard key="organize" />,
  ][step];

  return (
    <Stack gap="lg" className="fade-in">
      <div>
        {/* "skip" sits on its own line above the title (like an iOS nav bar), so the title never has to squeeze beside it */}
        <Group justify="flex-end" mb={2} mt={-6}>
          <Button variant="subtle" color="gray" size="compact-sm" radius="xl" onClick={leave} rightSection={<IconArrowRight size={14} />}>{t("先不设置，看演示")}</Button>
        </Group>
        <Title order={1} fz={30} lh={1.15}>{t("用自己的聊天")}</Title>
        <Text size="sm" className="muted" mt={6}>{t("四步，聊天始终存在这台电脑上。")}</Text>
      </div>
      <div className="steps" role="tablist">
        {STEPS.map((s, i) => (
          <button key={s.label} type="button" role="tab" aria-selected={i === step} className="step" data-state={i < step ? "done" : i === step ? "now" : undefined} onClick={() => setStep(i)}>
            <span className="step-bar"><span /></span>
            <span className="step-label">{i < step ? <IconCheck size={13} stroke={2.6} /> : <b>{i + 1}</b>}{s.label}</span>
            <span className="step-desc">{s.desc}</span>
          </button>
        ))}
      </div>
      <Paper className="surface" radius="xl" p="lg"><div key={step} className="fade-in">{body}</div></Paper>
      <Group justify="space-between">
        <Button variant="subtle" color="gray" radius="md" disabled={step === 0} onClick={() => setStep(step - 1)}>{t("上一步")}</Button>
        {step < STEPS.length - 1
          ? <Button radius="md" rightSection={<IconArrowRight size={16} />} onClick={() => setStep(step + 1)}>{step === 1 ? t("下一步（可以以后再设）") : t("下一步")}</Button>
          : done
            ? <Button component={Link} href="/" radius="md" color="teal" leftSection={<IconCheck size={16} />}>{t("去「今天」看看")}</Button>
            : <Button radius="md" onClick={finish}>{t("完成，切换到我的数据")}</Button>}
      </Group>
      <Text size="xs" className="faint">{t("这些设置以后都能在「设置」里改。随时可以在「设置 → 数据」切回演示数据。")}</Text>
    </Stack>
  );
}
