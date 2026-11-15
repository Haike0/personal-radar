"use client";
import { t } from "@/lib/i18n";
import { Button, CopyButton, Group, Paper, Stack, Text } from "@mantine/core";
import { IconCheck, IconCopy, IconRobot } from "@tabler/icons-react";
import { useApi } from "@/lib/client";

type Agent = { run: string; dataDir: string | null; prompt: string };
/** The sentence to paste, in the interface language. */
const sentence = (a: Agent) =>
  t("运行 {0} guide agent，按它说的帮我维护 ReadMe{1}：每天 21:30 导入新聊天、整理还没整理的消息，做完用一两句话告诉我新增了哪些要处理的事。", a.run, a.dataDir ? t("（我的数据目录是 {0}）", a.dataDir) : "");
const AGENTS = ["Claude Code", "Codex", "WorkBuddy", "Hermes"];

/** Hand ReadMe to the agent you already use: one sentence to paste, and it imports, organizes and schedules itself. */
export function AgentCard() {
  const { data } = useApi<Agent>("/api/agent");
  return (
    <Stack gap="sm">
      <Group gap={8} wrap="nowrap" align="flex-start">
        <IconRobot size={20} color="var(--mantine-color-violet-6)" style={{ flex: "none", marginTop: 2 }} />
        <Text size="sm" lh={1.6}>
          {" "}{t("已经在用 {0} 这类 agent？把下面这句话发给它，它会替你导入新聊天、整理成提醒，还会每天定时做。 整理用的是你已有的订阅，", AGENTS.join("、"))}<b>{t("不用另填密钥")}</b>。
        </Text>
      </Group>
      <Paper className="agent-prompt" radius="md" p="sm">
        <Text size="sm" lh={1.6} style={{ wordBreak: "break-all" }}>{data ? sentence(data) : t("读取中…")}</Text>
      </Paper>
      <Group gap="xs">
        <CopyButton value={data ? sentence(data) : ""}>
          {({ copied, copy }) => (
            <Button radius="md" size="sm" disabled={!data} onClick={copy} color={copied ? "teal" : "violet"} leftSection={copied ? <IconCheck size={15} /> : <IconCopy size={15} />}>
              {copied ? t("已复制，去发给你的 agent") : t("复制这句话")}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Text size="xs" className="faint" lh={1.6}>
        {" "}{t("时间可以在这句话里改。agent 拿到的聊天同样按「设置 → 隐私」隐藏了手机号、卡号这些；它只用聊天软件官方的导出功能，不会碰任何解密工具。 定时任务要在这台电脑上运行，电脑睡眠时不会执行。")}{" "}
      </Text>
    </Stack>
  );
}
