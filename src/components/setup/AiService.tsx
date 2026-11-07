"use client";
import { Anchor, Autocomplete, Badge, Button, Group, PasswordInput, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPlugConnected } from "@tabler/icons-react";
import { useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";

type Preset = { id: string; label: string; baseUrl: string; model: string; keyUrl: string };
type Cfg = { presets: Preset[]; preset: string; baseUrl: string; model: string; hasKey: boolean; keyHint: string; fromEnv: boolean; enabled: boolean };
type Test = { ok: boolean; ms?: number; reply?: string; error?: string };

/** Pick a service, paste a key, test, done. The key stays in the local database and is never shown again. */
export function AiService({ onReady }: { onReady?: () => void }) {
  const { data, reload } = useApi<Cfg>("/api/ai/config");
  if (!data) return <Text size="xs" className="faint">读取中…</Text>;
  return <AiForm data={data} reload={reload} onReady={onReady} />;
}

function AiForm({ data, reload, onReady }: { data: Cfg; reload: () => void; onReady?: () => void }) {
  const [preset, setPreset] = useState<string>(data.preset);
  const [baseUrl, setBaseUrl] = useState(data.baseUrl);
  const [model, setModel] = useState(data.model);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [test, setTest] = useState<Test | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const p = data.presets.find((x) => x.id === preset) ?? data.presets[0];
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl);

  function choose(id: string | null) {
    const np = data.presets.find((x) => x.id === id);
    if (!np) return;
    setPreset(np.id); setTest(null); setModels([]);
    if (np.id !== "custom") { setBaseUrl(np.baseUrl); setModel(np.model); }
  }
  async function loadModels() {
    setBusy("models");
    try {
      const r = await post<{ models: string[]; error?: string }>("/api/ai/models", { baseUrl, key: key || undefined });
      setModels(r.models);
      if (r.error) notifications.show({ color: "orange", radius: "lg", message: r.error });
      else if (!model && r.models[0]) setModel(r.models[0]);
    } finally { setBusy(null); }
  }
  async function runTest() {
    setBusy("test"); setTest(null);
    try {
      const r = await post<Test>("/api/ai/test", { baseUrl, model, key: key || undefined });
      setTest(r);
      if (r.ok) {
        await post("/api/ai/config", { preset, baseUrl, model, key: key || undefined, enabled: true }, "PATCH");
        setKey(""); reload(); refreshAll(); onReady?.();
        notifications.show({ radius: "lg", message: "AI 服务已连通并保存" });
      }
    } catch (e) {
      setTest({ ok: false, error: (e as Error).message });
    } finally { setBusy(null); }
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={600}>当前</Text>
        {data.hasKey && data.enabled
          ? <Badge color="teal" leftSection={<IconCheck size={12} />}>已连通 · {data.model}</Badge>
          : data.hasKey ? <Badge color="gray">已保存，未启用</Badge> : <Badge color="orange">还没设置</Badge>}
      </Group>
      {data.fromEnv && <Text size="xs" className="faint">.env.local 里设置了 RADAR_AI_KEY，它会优先于这里保存的密钥。</Text>}
      <Select label="服务" data={data.presets.map((x) => ({ value: x.id, label: x.label }))} value={preset} onChange={choose} allowDeselect={false} radius="md" />
      {(preset === "custom" || preset === "ollama") && (
        <TextInput label="服务地址" description="兼容 OpenAI 接口的地址，一般以 /v1 结尾" placeholder="https://example.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.currentTarget.value)} radius="md" />
      )}
      {!local && (
        <PasswordInput label="API 密钥" radius="md" value={key} onChange={(e) => setKey(e.currentTarget.value)}
          placeholder={data.hasKey && data.baseUrl === baseUrl ? `已保存（${data.keyHint}），不改就留空` : "粘贴你的密钥"}
          description={p.keyUrl ? <>在 <Anchor href={p.keyUrl} target="_blank" size="xs">{p.label} 的控制台</Anchor> 创建。密钥只存在这台电脑上。</> : "密钥只存在这台电脑上。"} />
      )}
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Autocomplete label="模型" style={{ flex: 1 }} radius="md" value={model} onChange={setModel} data={models} placeholder="点右边读取，或直接输入模型名" />
        <Button variant="light" radius="md" loading={busy === "models"} onClick={loadModels}>读取模型列表</Button>
      </Group>
      <Group gap="xs">
        <Button radius="md" leftSection={<IconPlugConnected size={16} />} loading={busy === "test"} onClick={runTest} disabled={!model || (!local && !key && !(data.hasKey && data.baseUrl === baseUrl))}>测试并保存</Button>
        {data.hasKey && (
          <Button variant="subtle" color="gray" radius="md" onClick={async () => { await fetch("/api/ai/config", { method: "DELETE" }); reload(); refreshAll(); }}>删除密钥</Button>
        )}
      </Group>
      {test && (test.ok
        ? <Text size="xs" c="teal">连通了，用时 {((test.ms ?? 0) / 1000).toFixed(1)} 秒，模型回复「{test.reply}」。</Text>
        : <Text size="xs" c="red">{test.error}</Text>)}
      <Text size="xs" className="faint" lh={1.6}>
        费用按你的服务商计价：用 DeepSeek 整理 400 条聊天，大约几分钱人民币。想完全不联网，可以选 Ollama 用本机模型（效果取决于你装的模型）。
      </Text>
    </Stack>
  );
}
