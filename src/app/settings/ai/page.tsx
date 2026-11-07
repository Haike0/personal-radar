"use client";
import { ActionIcon, Anchor, Autocomplete, Badge, Button, Collapse, Group, Modal, Paper, PasswordInput, SegmentedControl, Select, Skeleton, Stack, TagsInput, Text, TextInput, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconChevronLeft, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useBack } from "@/lib/nav";
import { useState } from "react";
import { usePageContext } from "@/components/Shell";
import { post, refreshAll, useApi } from "@/lib/client";
import { AgentCard } from "@/components/setup/AgentCard";

// AI 设置: a section list on the left (top on phones), one card per section.
type Svc = { id: string; name: string; baseUrl: string; models: string[]; builtin?: boolean; fromEnv?: boolean; keyUrl?: string; hasKey: boolean };
type Preset = { id: string; name: string; baseUrl: string; models: string[]; keyUrl: string };
type Pick = { serviceId: string; model: string };
type Data = { services: Svc[]; presets: Preset[]; chat: Pick; fast: Pick; usage: { calls: number; tokens: number; usd: number } };
type Settings = { settings: Record<string, string> };

const SECTIONS = [
  { id: "services", label: "模型服务" },
  { id: "agent", label: "用 agent" },
  { id: "models", label: "默认模型" },
  { id: "sending", label: "发送内容" },
  { id: "usage", label: "用量" },
];
const isLocal = (u: string) => /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(u);
const oops = (e: unknown) => notifications.show({ color: "red", radius: "lg", message: (e as Error).message });

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Paper className="surface" radius="xl" p="lg" id={id} style={{ scrollMarginTop: 16 }}>
      <Text fw={650}>{title}</Text>
      {hint && <Text size="xs" className="faint" mt={2}>{hint}</Text>}
      <Stack gap="md" mt="md">{children}</Stack>
    </Paper>
  );
}

function ServiceModal({ open, onClose, edit, presets }: { open: boolean; onClose: () => void; edit: Svc | null; presets: Preset[] }) {
  const [f, setF] = useState({ name: "", baseUrl: "", models: [] as string[], key: "", keyUrl: "" });
  const [found, setFound] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const tag = `${open}:${edit?.id ?? "new"}`;
  if (open && seen !== tag) {
    setSeen(tag); setFound([]);
    setF({ name: edit?.name ?? "", baseUrl: edit?.baseUrl ?? "", models: edit?.models ?? [], key: "", keyUrl: edit?.keyUrl ?? presets.find((p) => p.baseUrl === edit?.baseUrl)?.keyUrl ?? "" });
  }
  if (!open && seen) setSeen(null);
  const builtin = !!edit?.builtin;
  const local = isLocal(f.baseUrl);

  async function save() {
    setBusy("save");
    try {
      await post("/api/ai/services", { id: edit?.id, name: f.name, baseUrl: f.baseUrl, models: f.models, key: f.key });
      notifications.show({ radius: "lg", message: "已保存" });
      refreshAll(); onClose();
    } catch (e) { oops(e); }
    finally { setBusy(null); }
  }
  async function readModels() {
    setBusy("models");
    try {
      const r = await post<{ models: string[]; error?: string }>("/api/ai/models", { id: edit?.id, baseUrl: f.baseUrl, key: f.key || undefined });
      setFound(r.models);
      notifications.show({ radius: "lg", color: r.error ? "orange" : undefined, message: r.error ?? `读到 ${r.models.length} 个模型，在「模型名」里选` });
    } catch (e) { oops(e); }
    finally { setBusy(null); }
  }
  async function dropKey() {
    if (!edit || !window.confirm(`删除「${edit.name}」保存的密钥？`)) return;
    await post(`/api/ai/services?id=${encodeURIComponent(edit.id)}`, {}, "DELETE");
    refreshAll(); onClose();
  }

  return (
    <Modal opened={open} onClose={onClose} title={edit ? `编辑 ${edit.name}` : "添加模型服务"} radius="lg" centered>
      <Stack gap="sm">
        {!edit && (
          <Select label="从常用服务里选" placeholder="或者下面手动填" data={presets.filter((p) => p.id !== "deepseek").map((p) => ({ value: p.id, label: p.name }))} clearable
            onChange={(v) => { const p = presets.find((x) => x.id === v); if (p) { setF((x) => ({ ...x, name: p.name, baseUrl: p.baseUrl, models: p.models, keyUrl: p.keyUrl })); setFound([]); } }} />
        )}
        <TextInput label="名称" value={f.name} disabled={builtin} onChange={(e) => setF({ ...f, name: e.currentTarget.value })} />
        <TextInput label="接口地址" description="OpenAI 兼容格式，一般填到 /v1 这一级" placeholder="https://…" value={f.baseUrl} disabled={builtin} onChange={(e) => setF({ ...f, baseUrl: e.currentTarget.value })} />
        {!local && (
          <PasswordInput label="API 密钥" autoComplete="off" value={f.key} onChange={(e) => setF({ ...f, key: e.currentTarget.value })}
            placeholder={edit?.hasKey ? "已保存过；留空就不改" : "粘贴你的密钥"}
            description={<>只存在这台电脑的数据目录里（keys.json，只有你的账户能读），不会发给浏览器。{f.keyUrl && <> <Anchor href={f.keyUrl} target="_blank" size="xs">去控制台创建</Anchor></>}</>} />
        )}
        {!builtin && (
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <TagsInput label="模型名" description="可填多个，回车确认；名字以服务商文档为准" placeholder="例如 gpt-5-mini" style={{ flex: 1, minWidth: 0 }}
              value={f.models} data={found} onChange={(v) => setF({ ...f, models: v })} maxTags={12} clearable />
            <Button variant="light" loading={busy === "models"} disabled={!f.baseUrl} onClick={readModels}>读取列表</Button>
          </Group>
        )}
        <Group justify="space-between" mt="xs">
          {builtin && edit?.hasKey ? <Button variant="subtle" color="red" onClick={dropKey}>删除密钥</Button> : <span />}
          <Group gap="xs">
            <Button variant="subtle" color="gray" onClick={onClose}>取消</Button>
            <Button loading={busy === "save"} onClick={save} disabled={!f.name || !f.baseUrl}>保存</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModelPick({ label, hint, role, data }: { label: string; hint: string; role: "chat" | "fast"; data: Data }) {
  const cur = data[role];
  const [svc, setSvc] = useState(cur.serviceId);
  const [model, setModel] = useState(cur.model);
  const [testing, setTesting] = useState(false);
  const service = data.services.find((s) => s.id === svc);
  async function save(serviceId: string, m: string) {
    if (!m) return;
    await post("/api/settings", { [role === "chat" ? "ai_chat" : "ai_fast"]: `${serviceId}|${m}` }, "PATCH");
    refreshAll();
  }
  async function test() {
    setTesting(true);
    try {
      const r = await post<{ ok: boolean; ms?: number; error?: string }>("/api/ai/services/test", { id: svc, model });
      notifications.show({ radius: "lg", color: r.ok ? "teal" : "red", message: r.ok ? `连通了，${((r.ms ?? 0) / 1000).toFixed(1)} 秒响应` : `没连上：${r.error}` });
    } catch (e) { oops(e); }
    finally { setTesting(false); }
  }
  return (
    <Stack gap={6}>
      <div><Text size="sm">{label}</Text><Text size="xs" className="faint">{hint}</Text></div>
      <div className="model-pick">
        <Select size="sm" aria-label={`${label}的服务`} allowDeselect={false} value={svc}
          data={data.services.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => { if (!v) return; const s = data.services.find((x) => x.id === v); const m = s?.models[0] ?? ""; setSvc(v); setModel(m); if (m) save(v, m); }} />
        <Autocomplete size="sm" aria-label={`${label}的模型`} placeholder="模型名" value={model} data={service?.models ?? []}
          onChange={setModel} onBlur={() => model !== cur.model && save(svc, model)} onOptionSubmit={(v) => save(svc, v)} />
        <Button size="sm" variant="light" loading={testing} disabled={!model} onClick={test}>测试</Button>
      </div>
      {service && !service.hasKey && <Text size="xs" c="orange">{service.name} 还没填密钥</Text>}
    </Stack>
  );
}

export default function AiSettingsPage() {
  const goBack = useBack("/settings");
  usePageContext({ page: "settings" });
  const { data } = useApi<Data>("/api/ai/services");
  const { data: st } = useApi<Settings>("/api/settings");
  const [modal, setModal] = useState<{ open: boolean; edit: Svc | null }>({ open: false, edit: null });
  const [rules, setRules] = useState(false);
  const [share, setShare] = useState<string | null>(null);
  const shareVal = share ?? st?.settings.ai_share_evidence ?? "minimal";

  async function remove(s: Svc) {
    if (!window.confirm(`删除「${s.name}」和它的密钥？`)) return;
    await post(`/api/ai/services?id=${encodeURIComponent(s.id)}`, {}, "DELETE");
    refreshAll();
  }
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fade-in">
      <button type="button" onClick={goBack} className="back-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}><IconChevronLeft size={16} />返回</button>
      <h1 className="page-title">AI 设置</h1>
      <div className="ai-set">
        <nav className="ai-set-nav" aria-label="AI 设置分区">
          {SECTIONS.map((s) => <UnstyledButton key={s.id} className="ai-set-link" onClick={() => jump(s.id)}>{s.label}</UnstyledButton>)}
        </nav>
        {!data ? <Stack style={{ flex: 1 }}><Skeleton h={160} radius="xl" /><Skeleton h={200} radius="xl" /></Stack> : (
          <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
            <Section id="services" title="模型服务" hint="任何兼容 OpenAI 接口的服务都能用：DeepSeek、OpenAI、Gemini、通义千问、Kimi、智谱、OpenRouter、本机 Ollama 等">
              {data.services.map((s) => (
                <Group key={s.id} justify="space-between" wrap="nowrap" gap="sm" className="svc-row">
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" fw={600} truncate>{s.name}</Text>
                      {s.builtin && <Badge size="xs" variant="light" color="gray" style={{ flex: "none" }}>{s.fromEnv ? "来自 .env.local" : "内置"}</Badge>}
                    </Group>
                    <Text size="xs" className="faint" truncate>{s.models.length ? s.models.join(" · ") : "未填模型名"}</Text>
                  </div>
                  <Group gap={4} wrap="nowrap" style={{ flex: "none" }}>
                    <Badge size="sm" variant="light" color={s.hasKey ? "teal" : "gray"}>{s.hasKey ? (isLocal(s.baseUrl) ? "本机" : "已配置") : "缺密钥"}</Badge>
                    {!s.fromEnv && <ActionIcon variant="subtle" color="gray" aria-label={`编辑 ${s.name}`} onClick={() => setModal({ open: true, edit: s })}><IconPencil size={16} /></ActionIcon>}
                    {!s.builtin && <ActionIcon variant="subtle" color="gray" aria-label={`删除 ${s.name}`} onClick={() => remove(s)}><IconTrash size={16} /></ActionIcon>}
                  </Group>
                </Group>
              ))}
              <Button variant="light" radius="md" leftSection={<IconPlus size={16} />} onClick={() => setModal({ open: true, edit: null })}>添加新服务</Button>
            </Section>

            <Section id="agent" title="用你自己的 agent" hint="不填密钥也能整理：交给你已经在用的 AI 助手">
              <AgentCard />
            </Section>

            <Section id="models" title="默认模型">
              <ModelPick key={`c${data.chat.serviceId}${data.chat.model}`} role="chat" label="对话模型" hint="AI 问答、建议修改记录" data={data} />
              <ModelPick key={`f${data.fast.serviceId}${data.fast.model}`} role="fast" label="整理模型" hint="把聊天整理成记录、生成每日摘要；用得最多，选便宜快的" data={data} />
            </Section>

            <Section id="sending" title="发送内容" hint="每次只发和问题相关的一小部分，发出前按「设置 → 隐私」的规则脱敏">
              <Group justify="space-between" wrap="nowrap" gap="md">
                <div style={{ minWidth: 0 }}><Text size="sm">记录的原话</Text><Text size="xs" className="faint">引用记录时带几句原话</Text></div>
                <SegmentedControl size="xs" radius="xl" value={shareVal} style={{ flex: "none" }}
                  onChange={async (v) => { setShare(v); await post("/api/settings", { ai_share_evidence: v }, "PATCH"); }}
                  data={[{ value: "minimal", label: "只带关键句" }, { value: "context", label: "含前后文" }]} />
              </Group>
              <UnstyledButton onClick={() => setRules((x) => !x)} className="rules-toggle">
                <Text size="xs" className="muted">提问时具体发哪些</Text><IconChevronDown size={14} style={{ transform: rules ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
              </UnstyledButton>
              <Collapse expanded={rules}>
                <Text size="xs" className="muted" lh={1.8}>
                  · 相关的整理记录（标题和说明），一个人最多 60 条，加分析摘要<br />
                  · 最相关的 10 条记录的原话<br />
                  · 用问题里的词在聊天里搜到的原话，最多 14 条<br />
                  · 问「最近」时，加最近 50 条聊天<br />
                  · 从某件事打开时，加这件事和之后提到它的话<br />
                  · 这次对话最近 8 条问答
                </Text>
              </Collapse>
              <Text size="xs" className="faint">想看某个问题实际发出什么：在 AI 对话框点「发送内容预览」，只看不发。整理时每段发什么，在「设置 → 整理」里点「会发什么」。</Text>
            </Section>

            <Section id="usage" title="用量" hint="本月，含问答、整理和摘要">
              <Group gap="xl">
                <div><Text fz={22} fw={650} className="tabular">{data.usage.calls}</Text><Text size="xs" className="faint">次调用</Text></div>
                <div><Text fz={22} fw={650} className="tabular">{(data.usage.tokens / 1000).toFixed(0)}k</Text><Text size="xs" className="faint">tokens</Text></div>
                <div><Text fz={22} fw={650} className="tabular">${data.usage.usd.toFixed(2)}</Text><Text size="xs" className="faint">约（按 DeepSeek 价）</Text></div>
              </Group>
            </Section>
          </Stack>
        )}
      </div>
      {data && <ServiceModal open={modal.open} edit={modal.edit} presets={data.presets} onClose={() => setModal({ open: false, edit: null })} />}
    </div>
  );
}
