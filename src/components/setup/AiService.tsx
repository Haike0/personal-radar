"use client";
import { t } from "@/lib/i18n";
import { Anchor, Autocomplete, Badge, Button, Collapse, Group, Paper, PasswordInput, Select, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconChevronDown, IconPlugConnected } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";
import { AgentCard } from "@/components/setup/AgentCard";

type Svc = { id: string; name: string; baseUrl: string; models: string[]; builtin?: boolean; fromEnv?: boolean; hasKey: boolean };
type Preset = { id: string; name: string; baseUrl: string; models: string[]; keyUrl: string };
type Data = { services: Svc[]; presets: Preset[]; chat: { serviceId: string; model: string }; fast: { serviceId: string; model: string } };
type Test = { ok: boolean; ms?: number; reply?: string; error?: string };
const CUSTOM = "custom";
const trim = (u: string) => u.trim().replace(/\/+$/, "");
const isLocal = (u: string) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(u);

/**
 * Quick setup (first-run wizard): pick a service, paste a key, test — it becomes the model for both Q&A and organizing.
 * More services, or different models for the two jobs, are in 设置 → AI 设置.
 */
export function AiService({ onReady }: { onReady?: () => void }) {
  const { data, reload } = useApi<Data>("/api/ai/services");
  if (!data) return <Text size="xs" className="faint">{t("读取中…")}</Text>;
  return <AiForm data={data} reload={reload} onReady={onReady} />;
}

function AiForm({ data, reload, onReady }: { data: Data; reload: () => void; onReady?: () => void }) {
  const current = data.services.find((s) => s.id === data.fast.serviceId);
  const start = data.presets.find((p) => p.baseUrl === current?.baseUrl)?.id ?? (current && !current.builtin ? CUSTOM : "deepseek");
  const [preset, setPreset] = useState<string>(start);
  const [agentOpen, setAgentOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? data.presets[0].baseUrl);
  const [model, setModel] = useState(data.fast.model);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [test, setTest] = useState<Test | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const p = data.presets.find((x) => x.id === preset);
  const local = isLocal(baseUrl);
  // the saved service this form edits: the built-in DeepSeek, or one added before with the same address
  const match = preset === "deepseek" ? data.services.find((s) => s.id === "deepseek") : data.services.find((s) => !s.builtin && s.baseUrl === trim(baseUrl));
  const ready = !!current?.hasKey && data.chat.serviceId === data.fast.serviceId;

  function choose(id: string | null) {
    if (!id) return;
    setPreset(id); setTest(null); setModels([]);
    const np = data.presets.find((x) => x.id === id);
    if (np) { setBaseUrl(np.baseUrl); setModel(np.models[0] ?? ""); } else { setBaseUrl(""); setModel(""); }
  }
  async function loadModels() {
    setBusy("models");
    try {
      const r = await post<{ models: string[]; error?: string }>("/api/ai/models", { id: match?.id, baseUrl, key: key || undefined });
      setModels(r.models);
      if (r.error) notifications.show({ color: "orange", radius: "lg", message: r.error });
      else if (!model && r.models[0]) setModel(r.models[0]);
    } finally { setBusy(null); }
  }
  async function runTest() {
    setBusy("test"); setTest(null);
    try {
      const r = await post<Test>("/api/ai/services/test", { id: match?.id, baseUrl, model, key: key || undefined });
      setTest(r);
      if (r.ok) {
        const name = match?.name ?? p?.name ?? (() => { try { return new URL(baseUrl).host; } catch { return t("我的服务"); } })();
        await post("/api/ai/services", { id: match?.id, name, baseUrl, models: [model, ...(match?.models ?? p?.models ?? [])], key: key || undefined, use: ["chat", "fast"] });
        setKey(""); reload(); refreshAll(); onReady?.();
        notifications.show({ radius: "lg", message: t("AI 服务已连通并保存") });
      }
    } catch (e) {
      setTest({ ok: false, error: (e as Error).message });
    } finally { setBusy(null); }
  }

  const options = [...data.presets.map((x) => ({ value: x.id, label: x.name })), { value: CUSTOM, label: t("其他兼容 OpenAI 接口的服务") }];
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={600}>{t("当前")}</Text>
        {current?.hasKey
          ? <Badge color="teal" leftSection={<IconCheck size={12} />}>{ready ? t("已连通 · {0} · {1}", current.name, data.fast.model) : t("整理用 {0}", current.name)}</Badge>
          : <Badge color="orange">{t("还没设置")}</Badge>}
      </Group>
      {data.services.some((s) => s.fromEnv) && <Text size="xs" className="faint">{t(".env.local 里设置了 RADAR_AI_*，它在 AI 设置里显示为「环境变量」服务，没另选时默认用它。")}</Text>}
      <Select label={t("服务")} data={options} value={preset} onChange={choose} allowDeselect={false} radius="md" />
      {(preset === CUSTOM || preset === "ollama") && (
        <TextInput label={t("服务地址")} description={t("兼容 OpenAI 接口的地址，一般以 /v1 结尾")} placeholder="https://example.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.currentTarget.value)} radius="md" />
      )}
      {!local && (
        <PasswordInput label={t("API 密钥")} radius="md" autoComplete="off" value={key} onChange={(e) => setKey(e.currentTarget.value)}
          placeholder={match?.hasKey ? t("已保存，不改就留空") : t("粘贴你的密钥")}
          description={p?.keyUrl ? <>{t("在")}{" "} <Anchor href={p.keyUrl} target="_blank" size="xs">{t("{0} 的控制台", p.name)}</Anchor> {" "}{t("创建。密钥只存在这台电脑上。")}</> : t("密钥只存在这台电脑上。")} />
      )}
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Autocomplete label={t("模型")} style={{ flex: 1 }} radius="md" value={model} onChange={setModel} data={[...new Set([...(p?.models ?? []), ...models])]} placeholder={t("点右边读取，或直接输入模型名")} />
        <Button variant="light" radius="md" loading={busy === "models"} onClick={loadModels} disabled={!baseUrl}>{t("读取模型列表")}</Button>
      </Group>
      <Group gap="xs">
        <Button radius="md" leftSection={<IconPlugConnected size={16} />} loading={busy === "test"} onClick={runTest}
          disabled={!model || !baseUrl || (!local && !key && !match?.hasKey)}>{t("测试并保存")}</Button>
        <Anchor component={Link} href="/settings/ai" size="xs">{t("更多设置：多个服务、问答和整理分开选模型")}</Anchor>
      </Group>
      {test && (test.ok
        ? <Text size="xs" c="teal">{t("连通了，用时 {0} 秒，模型回复「{1}」。", ((test.ms ?? 0) / 1000).toFixed(1), test.reply)}</Text>
        : <Text size="xs" c="red">{test.error}</Text>)}
      <Text size="xs" className="faint" lh={1.6}>
        {" "}{t("费用按你的服务商计价：用 DeepSeek 整理 400 条聊天，大约几分钱人民币。想完全不联网，可以选 Ollama 用本机模型（效果取决于你装的模型）。")}{" "}
      </Text>
      <UnstyledButton onClick={() => setAgentOpen((x) => !x)} mt={4}>
        <Group gap={6}><Text size="sm" fw={600} c="violet">{t("没有 API 密钥？用你自己的 agent")}</Text><IconChevronDown size={14} style={{ transform: agentOpen ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} /></Group>
      </UnstyledButton>
      <Collapse expanded={agentOpen}><Paper className="hint-box" radius="lg" p="md"><AgentCard /></Paper></Collapse>
    </Stack>
  );
}
