"use client";
import { ActionIcon, Button, Checkbox, Group, Stack, Switch, TagsInput, Text, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { post, useApi } from "@/lib/client";
import { outbound, privacyConfig, RULE_GROUPS } from "../../../scripts/lib/redact.mjs";

type Settings = { settings: Record<string, string> };
type Chats = { sessions: { id: string; name: string; isGroup: boolean }[] };
type Rule = { name?: string; pattern: string; replace?: string };
const parse = <T,>(s: string | undefined, fb: T): T => { try { const v = JSON.parse(s ?? ""); return Array.isArray(v) ? (v as T) : fb; } catch { return fb; } };

/** What is hidden before anything is sent to the AI service, and which people are never sent at all. */
export function PrivacyPanel() {
  const { data, reload } = useApi<Settings>("/api/settings");
  const { data: chats } = useApi<Chats>("/api/chatlab");
  const [sample, setSample] = useState("周五 3 点在 https://tabelog.com/tokyo/123?ref=x 见，有事打 090-1234-5678 或发邮件 sato@example.com");
  const [draft, setDraft] = useState<Rule>({ name: "", pattern: "", replace: "" });
  const s = data?.settings;
  const cfg = useMemo(() => privacyConfig((k: string) => s?.[k]), [s]);
  if (!s) return <Text size="xs" className="faint">读取中…</Text>;
  const rules = parse<string[]>(s.privacy_rules, []);
  const custom = parse<Rule[]>(s.privacy_custom, []);
  const excluded = parse<string[]>(s.ai_excluded, []);

  async function save(patch: Record<string, string>) {
    try { await post("/api/settings", patch, "PATCH"); reload(); }
    catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
  }
  function addRule() {
    try { new RegExp(draft.pattern); } catch { notifications.show({ color: "red", radius: "lg", message: "正则表达式写得不对" }); return; }
    save({ privacy_custom: JSON.stringify([...custom, { ...draft, replace: draft.replace || "[已隐藏]" }]) });
    setDraft({ name: "", pattern: "", replace: "" });
  }
  const result = outbound(sample, cfg);

  return (
    <Stack gap="md">
      <Stack gap={6}>
        <Text size="sm" fw={600}>发出去之前自动替换</Text>
        {RULE_GROUPS.map((g) => (
          <Checkbox key={g.id} label={<Text size="sm">{g.label}</Text>} description={g.hint} checked={rules.includes(g.id)}
            onChange={(e) => save({ privacy_rules: JSON.stringify(e.currentTarget.checked ? [...rules, g.id] : rules.filter((x) => x !== g.id)) })} />
        ))}
      </Stack>

      <TagsInput label="关键词黑名单" description="消息里出现任一关键词，这条消息整条不发（输入后按回车）" radius="md"
        value={parse<string[]>(s.privacy_keywords, [])} onChange={(v) => save({ privacy_keywords: JSON.stringify(v) })} placeholder="例如：病院、住址、工资" />

      <Stack gap={6}>
        <Text size="sm" fw={600}>自定义规则</Text>
        {custom.map((r, i) => (
          <Group key={i} gap="xs" wrap="nowrap">
            <Text size="xs" className="muted" style={{ flex: 1, minWidth: 0 }} truncate>{r.name || "规则"}：<code>{r.pattern}</code> → {r.replace}</Text>
            <ActionIcon variant="subtle" color="gray" onClick={() => save({ privacy_custom: JSON.stringify(custom.filter((_, j) => j !== i)) })}><IconTrash size={15} /></ActionIcon>
          </Group>
        ))}
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput size="xs" radius="md" label="名称" placeholder="员工号" w={90} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
          <TextInput size="xs" radius="md" label="正则表达式" placeholder="EMP-\d+" style={{ flex: 1 }} value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.currentTarget.value })} />
          <TextInput size="xs" radius="md" label="替换成" placeholder="[员工号]" w={100} value={draft.replace} onChange={(e) => setDraft({ ...draft, replace: e.currentTarget.value })} />
          <ActionIcon size="lg" variant="light" disabled={!draft.pattern} onClick={addRule}><IconPlus size={16} /></ActionIcon>
        </Group>
      </Stack>

      <Stack gap={6}>
        <Text size="sm" fw={600}>试一试</Text>
        <Textarea radius="md" autosize minRows={2} value={sample} onChange={(e) => setSample(e.currentTarget.value)} />
        <Text size="xs" className="hint-box" style={{ whiteSpace: "pre-wrap" }}>{result.text || "（整条不发）"}{result.dropped ? `\n（${result.dropped} 行因黑名单不发）` : ""}</Text>
      </Stack>

      <Stack gap={6}>
        <Text size="sm" fw={600}>这些人的聊天完全不发给 AI</Text>
        <Text size="xs" className="faint">打开后：不整理、不写人物分析、问答和每日摘要也不会带上 TA 的任何内容。聊天照样能在 App 里看。</Text>
        {(chats?.sessions ?? []).filter((c) => !c.isGroup).map((c) => (
          <Group key={c.id} justify="space-between" wrap="nowrap">
            <Text size="sm" truncate>{c.name}</Text>
            <Switch checked={excluded.includes(c.id)} onChange={(e) => save({ ai_excluded: JSON.stringify(e.currentTarget.checked ? [...excluded, c.id] : excluded.filter((x) => x !== c.id)) })} />
          </Group>
        ))}
        {!chats?.sessions.length && <Text size="xs" className="faint">导入聊天后，这里会列出每个人。</Text>}
      </Stack>
      <Button variant="subtle" color="gray" size="xs" radius="md" w="fit-content" onClick={() => save({ privacy_rules: JSON.stringify(RULE_GROUPS.filter((g) => g.on).map((g) => g.id)) })}>替换规则恢复默认</Button>
    </Stack>
  );
}
