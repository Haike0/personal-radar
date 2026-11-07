"use client";
import { Collapse, Group, Stack, Switch, Text, UnstyledButton } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowRight, IconChevronDown, IconCircleCheckFilled, IconDeviceLaptop, IconShieldLock, IconSparkles } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { post, useApi } from "@/lib/client";
import { outbound, privacyConfig, RULE_GROUPS } from "../../../scripts/lib/redact.mjs";

type Settings = { settings: Record<string, string> };
type Chats = { sessions: { id: string; name: string; isGroup: boolean }[] };
const parse = <T,>(s: string | undefined, fb: T): T => { try { const v = JSON.parse(s ?? ""); return Array.isArray(v) ? (v as T) : fb; } catch { return fb; } };

const SAMPLE = "明天下午3点见，到了打我电话 138 1234 5678";
const PROMISES = [
  "聊天记录只存在这台电脑上。Radar 没有服务器，也没有账号。",
  "不收集你的任何数据。",
  "只有整理聊天和你提问的时候，才把要用的那几段发给你自己选的 AI。",
  "想一条都不发出去：换成本机模型（Ollama），完全不联网。",
];

/** The privacy step, for everyone: what stays here, what leaves and how it's cleaned, and whose chats never leave. */
export function PrivacySimple({ advancedHref }: { advancedHref?: string }) {
  const { data, reload } = useApi<Settings>("/api/settings");
  const { data: chats } = useApi<Chats>("/api/chatlab");
  const [showPeople, setShowPeople] = useState(false);
  const s = data?.settings;
  const cfg = useMemo(() => privacyConfig((k: string) => s?.[k]), [s]);
  if (!s) return <Text size="xs" className="faint">读取中…</Text>;
  const rules = parse<string[]>(s.privacy_rules, RULE_GROUPS.filter((g) => g.on).map((g) => g.id));
  const excluded = parse<string[]>(s.ai_excluded, []);
  const people = (chats?.sessions ?? []).filter((c) => !c.isGroup);
  const after = outbound(SAMPLE, cfg).text;
  async function save(patch: Record<string, string>) {
    try { await post("/api/settings", patch, "PATCH"); reload(); }
    catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); }
  }

  return (
    <Stack gap="lg">
      {/* where your chats are, at a glance */}
      <div className="privacy-flow">
        <div className="privacy-node is-home">
          <IconDeviceLaptop size={22} />
          <Text size="sm" fw={650} mt={6}>你的电脑</Text>
          <Text size="xs" className="muted" lh={1.5}>聊天、整理结果、密钥，全在这里</Text>
        </div>
        <div className="privacy-arrow">
          <IconShieldLock size={18} />
          <Text size="xs" className="muted" ta="center" lh={1.4}>先隐藏<br />敏感信息</Text>
          <IconArrowRight size={16} className="faint" />
        </div>
        <div className="privacy-node">
          <IconSparkles size={22} />
          <Text size="sm" fw={650} mt={6}>你选的 AI</Text>
          <Text size="xs" className="muted" lh={1.5}>只收到要整理的那几段</Text>
        </div>
      </div>

      <Stack gap={8}>
        {PROMISES.map((p) => (
          <Group key={p} gap={8} wrap="nowrap" align="flex-start">
            <IconCircleCheckFilled size={18} color="var(--mantine-color-radar-6)" style={{ flex: "none", marginTop: 1 }} />
            <Text size="sm" lh={1.55}>{p}</Text>
          </Group>
        ))}
      </Stack>

      {/* what the AI actually receives */}
      <Stack gap={8}>
        <Text size="sm" fw={600}>发给 AI 之前，会自动隐藏这些</Text>
        <Group gap={6}>
          {RULE_GROUPS.map((g) => (
            <UnstyledButton key={g.id} className={`privacy-chip${rules.includes(g.id) ? " is-on" : ""}`} aria-pressed={rules.includes(g.id)}
              onClick={() => save({ privacy_rules: JSON.stringify(rules.includes(g.id) ? rules.filter((x) => x !== g.id) : [...rules, g.id]) })}>
              {rules.includes(g.id) && <IconCircleCheckFilled size={13} />}{g.label}
            </UnstyledButton>
          ))}
        </Group>
        <div className="privacy-sample">
          <Text size="xs" className="faint">聊天原话</Text>
          <Text size="sm">{SAMPLE}</Text>
          <Text size="xs" className="faint" mt={8}>AI 收到的</Text>
          <Text size="sm" fw={550}>{after}</Text>
        </div>
      </Stack>

      {/* the one real choice: people who never go to the AI */}
      <Stack gap={6}>
        <UnstyledButton onClick={() => setShowPeople((x) => !x)}>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="sm" fw={600}>有些人的聊天，不想给 AI 看？</Text>
              <Text size="xs" className="faint">{excluded.length ? `已设置 ${excluded.length} 个人，TA 们的聊天一句都不发出去` : "打开后，这个人的聊天只在本机查看，不整理也不出现在问答里"}</Text>
            </div>
            <IconChevronDown size={16} className="faint" style={{ flex: "none", transform: showPeople ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
          </Group>
        </UnstyledButton>
        <Collapse expanded={showPeople}>
          <Stack gap={8} pt={4}>
            {people.map((c) => (
              <Group key={c.id} justify="space-between" wrap="nowrap">
                <Text size="sm" truncate>{c.name}</Text>
                <Switch checked={excluded.includes(c.id)} label={excluded.includes(c.id) ? "不发给 AI" : undefined} labelPosition="left"
                  onChange={(e) => save({ ai_excluded: JSON.stringify(e.currentTarget.checked ? [...excluded, c.id] : excluded.filter((x) => x !== c.id)) })} />
              </Group>
            ))}
            {!people.length && <Text size="xs" className="faint">导入聊天后，这里会列出每个人。</Text>}
          </Stack>
        </Collapse>
      </Stack>

      {advancedHref && <Text component={Link} href={advancedHref} size="xs" c="dimmed">屏蔽词、自定义规则这些更细的设置，在「设置 → 隐私」里 ›</Text>}
    </Stack>
  );
}
