"use client";
import { t } from "@/lib/i18n";
import { useBack } from "@/lib/nav";
import {
  Alert, Badge, Box, Button, Divider, Group, Menu, Modal, Paper, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, Textarea, Timeline, Title, UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp, IconArrowLeft, IconBan, IconCheck, IconChevronDown, IconChevronRight, IconCircleCheck, IconClockPause, IconDots, IconEdit, IconEyeOff,
  IconHistory, IconMessage2, IconQuote, IconRefresh, IconSparkles,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { act, CAT_COLOR } from "@/components/ItemCard";
import { ITEM_QUICK } from "@/lib/ai/assistants";
import { useCompanion, usePageContext } from "@/components/Shell";
import { post, refreshAll, useApi } from "@/lib/client";
import { relDate } from "@/lib/format";
import { CATEGORY_LABEL, CERTAINTY_LABEL, KIND_LABEL, STATUS_LABEL, type ItemDetail } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = { accept: t("确认识别无误"), reject: t("标记为识别错误"), followed: t("标记为已关心"), snooze: t("延后"), ignore: t("忽略"), done: t("已完成"), cancel: t("标记为取消"), reopen: t("重新打开"), edit: t("纠正") };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text size="xs" className="faint" mb={4}>{label}</Text>
      <Text size="sm" lh={1.6}>{children}</Text>
    </Box>
  );
}

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const back = useBack("/");
  const { data: it, error, loading } = useApi<ItemDetail>(`/api/items/${id}`);
  const { openCompanion } = useCompanion();
  const [ctxOpen, setCtxOpen] = useState(false);
  const [editOpen, edit] = useDisclosure(false);
  usePageContext({ page: "item", itemId: Number(id), title: it?.title, personName: it?.personName, personKey: it?.personKey }); // scope set from the URL immediately

  if (loading && !it) return <Stack><Skeleton h={30} w={80} /><Skeleton h={80} /><Skeleton h={200} /></Stack>;
  if (error || !it) return <Alert color="red" title={t("找不到这件事")}>{error}</Alert>;

  const key = it.evidence.filter((e) => e.isKey);
  const shown = ctxOpen ? it.evidence : key;
  const hasContext = it.evidence.length > key.length;
  const open = it.status === "open";
  const latest = it.history.find((h) => !h.undone);

  return (
    <Stack gap="lg" className="fade-in">
      <Group justify="space-between">
        <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} px={6} onClick={back}>{t("返回")}</Button>
        <Menu position="bottom-end" radius="lg" shadow="md" width={200}>
          <Menu.Target><Button variant="subtle" color="gray" px={8}><IconDots size={20} /></Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconEdit size={16} />} onClick={edit.open}>{t("纠正识别结果")}</Menu.Item>
            {open && <Menu.Item leftSection={<IconBan size={16} />} onClick={() => act(it.id, "cancel", {}, t("已标记为取消"))}>{t("这件事取消了")}</Menu.Item>}
            {!open && <Menu.Item leftSection={<IconRefresh size={16} />} onClick={() => act(it.id, "reopen", {}, t("已重新打开"))}>{t("重新打开")}</Menu.Item>}
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Stack gap={10}>
        <Group gap={6}>
          <Badge color={CAT_COLOR[it.category]}>{CATEGORY_LABEL[it.category]}</Badge>
          <Badge color="gray">{KIND_LABEL[it.kind]}</Badge>
          <Badge color={it.certainty === "confirmed" ? "teal" : it.certainty === "uncertain" ? "violet" : "yellow"}>{CERTAINTY_LABEL[it.certainty]}</Badge>
          {!open && <Badge color="gray" variant="outline">{STATUS_LABEL[it.status]}</Badge>}
        </Group>
        <Title order={2} fz={24} lh={1.35}>{it.title}</Title>
        <Text component={Link} href={`/people/${encodeURIComponent(it.personKey)}`} size="sm" c="radar">{it.personName} ›</Text>
      </Stack>

      {it.origin === "ai" && it.review === "pending" && (
        <Alert variant="light" color="violet" radius="lg" icon={<IconSparkles size={18} />} title={t("AI 从聊天里整理的，还没经过你确认")}>
          <Text size="sm" mb="sm">{t("对照下面的原话看看对不对，不对的话可以直接改，或者标成识别错误。")}</Text>
          <Group gap="xs">
            <Button size="xs" color="violet" onClick={() => act(it.id, "accept", {}, t("已确认"))}>{t("确认无误")}</Button>
            <Button size="xs" variant="default" onClick={edit.open}>{t("修改")}</Button>
            <Button size="xs" variant="subtle" color="gray" onClick={() => act(it.id, "reject", {}, t("已标记为识别错误，不再显示"))}>{t("识别错了")}</Button>
          </Group>
        </Alert>
      )}
      {it.supersedes && (
        <Alert variant="light" color="orange" radius="lg" icon={<IconRefresh size={18} />}>
          <Text size="sm">{t("这条取代了之前的「")}<Link href={`/items/${it.supersedes.id}`} style={{ textDecoration: "underline" }}>{it.supersedes.title}</Link>{t("」，旧提醒不会再出现。")}</Text>
        </Alert>
      )}
      {it.supersededBy && (
        <Alert variant="light" color="gray" radius="lg" icon={<IconRefresh size={18} />}>
          <Text size="sm">{t("已被新的安排「")}<Link href={`/items/${it.supersededBy.id}`} style={{ textDecoration: "underline" }}>{it.supersededBy.title}</Link>{t("」取代。")}</Text>
        </Alert>
      )}

      <Paper className="surface" p="lg" radius="xl">
        <Stack gap="md">
          {it.eventDate && <Row label={t("时间")}>{relDate(it.eventDate, it.eventTime)}<Text span className="faint" size="xs"> · {it.eventDate}</Text></Row>}
          {it.summary && <Row label={t("具体是什么")}>{it.summary}</Row>}
          {it.why && <Row label={t("为什么提醒你")}>{it.why}</Row>}
          {it.nextStep && (
            <Box p="sm" style={{ borderRadius: 12, background: "light-dark(var(--mantine-color-radar-0), color-mix(in srgb, var(--mantine-color-radar-9) 25%, transparent))" }}>
              <Text size="xs" c="radar" fw={600} mb={2}>{t("建议下一步")}</Text>
              <Text size="sm">{it.nextStep}</Text>
            </Box>
          )}
        </Stack>
      </Paper>

      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap={6}><IconQuote size={16} /><Text fw={600} size="sm">{t("聊天原话")}</Text><Text size="xs" className="faint">{t("{0} 条", key.length)}</Text></Group>
          {hasContext && (
            <UnstyledButton onClick={() => setCtxOpen((o) => !o)}>
              <Group gap={4}><Text size="xs" c="radar">{ctxOpen ? t("只看关键原话") : t("显示前后文")}</Text>
                <IconChevronDown size={14} color="var(--mantine-color-radar-filled)" style={{ transform: ctxOpen ? "rotate(180deg)" : undefined }} /></Group>
            </UnstyledButton>
          )}
        </Group>
        <Paper className="surface" p="md" radius="xl">
          <Stack gap={10}>
            {shown.map((e) => {
              // tap a quote → that person's 聊天记忆, opened on that day and scrolled to that message
              const href = e.messageId && e.ts ? `/people/${encodeURIComponent(it.personKey)}?tab=chat&date=${e.ts.slice(0, 10)}&mid=${encodeURIComponent(e.messageId)}` : null;
              const body = (
                <>
                  <Group gap={6}><Text size="xs" fw={600}>{e.sender}</Text><Text size="xs" className="faint tabular">{e.ts.slice(5)}</Text>{href && <IconChevronRight size={13} className="faint" />}</Group>
                  <Text size="sm" lh={1.6} style={{ whiteSpace: "pre-wrap" }}>{e.text}</Text>
                </>
              );
              return href
                ? <Link key={e.id} href={href} className="quote pressable" data-key={e.isKey || undefined} style={{ opacity: e.isKey ? 1 : 0.6, display: "block", color: "inherit", textDecoration: "none" }}>{body}</Link>
                : <div key={e.id} className="quote" data-key={e.isKey || undefined} style={{ opacity: e.isKey ? 1 : 0.6 }}>{body}</div>;
            })}
            {!shown.length && <Text size="sm" className="faint">{t("没有保存原话。没有证据的事项不应该出现，可以忽略它。")}</Text>}
          </Stack>
          {shown.some((e) => e.messageId) && <Text size="xs" className="faint" mt="sm">{t("点一条原话，看当时前后聊了什么")}</Text>}
        </Paper>
      </Stack>

      <Paper p="md" radius="xl" style={{ border: "1px solid light-dark(var(--mantine-color-violet-1), rgba(124,108,240,.25))", background: "light-dark(rgba(124,108,240,.04), rgba(124,108,240,.07))" }}>
        <Group gap={6} mb="xs"><IconSparkles size={16} color="var(--mantine-color-violet-5)" /><Text size="sm" fw={600}>{t("问 AI")}</Text><Text size="xs" className="faint">{t("会带上这件事的原话和之后相关的聊天")}</Text></Group>
        <Group gap={8}>
          {ITEM_QUICK.map((src) => t(src)).map((q) => (
            <Button key={q} size="xs" variant="light" color="violet" radius="xl" onClick={() => openCompanion(q)}>{q.split(/[：:]/)[0].replace(/[？?]$/, "")}</Button>
          ))}
        </Group>
      </Paper>

      {it.history.length > 0 && (
        <Stack gap="xs">
          <Group gap={6}><IconHistory size={16} /><Text fw={600} size="sm">{t("处理记录")}</Text></Group>
          <Timeline active={-1} bulletSize={18} lineWidth={1.5} pl={4}>
            {it.history.map((h) => (
              <Timeline.Item key={h.id} bullet={h.actor === "ai" ? <IconSparkles size={10} /> : <IconCheck size={10} />}>
                <Group gap={8} justify="space-between">
                  <Text size="sm" td={h.undone ? "line-through" : undefined} className={h.undone ? "faint" : undefined}>
                    {h.actor === "ai" ? t("AI 建议、你确认：") : ""}{ACTION_LABEL[h.action] ?? h.action}{h.note ? ` · ${h.note}` : ""}
                  </Text>
                  {latest?.id === h.id && (
                    <Button size="compact-xs" variant="subtle" leftSection={<IconArrowBackUp size={12} />}
                      onClick={async () => { await post(`/api/history/${h.id}/undo`, {}); refreshAll(); notifications.show({ message: t("已撤销"), radius: "lg" }); }}>{t("撤销")}</Button>
                  )}
                </Group>
                <Text size="xs" className="faint">{h.at.slice(5, 16)}{h.undone ? t(" · 已撤销") : ""}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Stack>
      )}

      {it.related.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm">{t("和 {0} 相关的其他事", it.personName)}</Text>
          {it.related.map((r) => (
            <Paper key={r.id} component={Link} href={`/items/${r.id}`} className="surface pressable" p="sm" radius="lg">
              <Group justify="space-between" wrap="nowrap"><Text size="sm">{r.title}</Text><Text size="xs" className="faint">{relDate(r.eventDate) || STATUS_LABEL[r.status]}</Text></Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Divider opacity={0} />
      {open ? (
        <Stack gap="xs" className="action-dock" style={{ position: "sticky", bottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 8px)", zIndex: 5 }}>
          <Button size="lg" radius="xl" leftSection={<IconCircleCheck size={20} />} onClick={() => act(it.id, "followed", {}, t("已标记为已关心，不再提醒"))}>{t("标记为已关心")}</Button>
          <SimpleGrid cols={3} spacing="xs">
            <Menu position="top" radius="lg" shadow="md">
              <Menu.Target><Button variant="default" radius="xl" leftSection={<IconClockPause size={16} />}>{t("延后")}</Button></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => act(it.id, "snooze", { days: 1 }, t("明天再提醒"))}>{t("明天")}</Menu.Item>
                <Menu.Item onClick={() => act(it.id, "snooze", { days: 3 }, t("3 天后再提醒"))}>{t("3 天后")}</Menu.Item>
                <Menu.Item onClick={() => act(it.id, "snooze", { days: 7 }, t("一周后再提醒"))}>{t("一周后")}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button variant="default" radius="xl" leftSection={<IconCheck size={16} />} onClick={() => act(it.id, "done", {}, t("已完成"))}>{t("完成")}</Button>
            <Button variant="default" radius="xl" leftSection={<IconEyeOff size={16} />} onClick={() => act(it.id, "ignore", {}, t("已忽略"))}>{t("忽略")}</Button>
          </SimpleGrid>
        </Stack>
      ) : (
        <Button variant="default" radius="xl" leftSection={<IconRefresh size={16} />} onClick={() => act(it.id, "reopen", {}, t("已重新打开"))}>{t("重新打开")}</Button>
      )}
      <EditModal key={it.updatedAt} opened={editOpen} onClose={edit.close} item={it} />
      <Group justify="center"><IconMessage2 size={12} className="faint" /><Text size="xs" className="faint">{t("AI 提取的内容可能有错，随时可以纠正")}</Text></Group>
    </Stack>
  );
}

function EditModal({ opened, onClose, item }: { opened: boolean; onClose: () => void; item: ItemDetail }) {
  const [f, setF] = useState({ title: item.title, event_date: item.eventDate ?? "", event_time: item.eventTime ?? "", category: item.category, certainty: item.certainty, next_step: item.nextStep ?? "" });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (v: string | null) => setF((s) => ({ ...s, [k]: v ?? "" }));
  async function save() {
    if (!f.title.trim()) return notifications.show({ color: "red", message: t("标题不能为空") });
    setSaving(true);
    try {
      const r = await post<{ historyId: number | null }>(`/api/items/${item.id}`, { ...f, event_date: f.event_date || null, event_time: f.event_time || null }, "PATCH");
      refreshAll();
      onClose();
      notifications.show({ message: r.historyId ? t("已保存修改，可在处理记录里撤销") : t("没有改动"), radius: "lg" });
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    } finally { setSaving(false); }
  }
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={650}>{t("纠正识别结果")}</Text>}>
      <Stack>
        <TextInput label={t("这件事是")} value={f.title} onChange={(e) => set("title")(e.currentTarget.value)} />
        <Group grow>
          <TextInput type="date" label={t("日期")} value={f.event_date} onChange={(e) => set("event_date")(e.currentTarget.value)} />
          <TextInput type="time" label={t("时间")} value={f.event_time} onChange={(e) => set("event_time")(e.currentTarget.value)} />
        </Group>
        <Group grow>
          <Select label={t("分类")} value={f.category} onChange={set("category")} allowDeselect={false}
            data={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
          <Select label={t("确定程度")} value={f.certainty} onChange={set("certainty")} allowDeselect={false}
            data={Object.entries(CERTAINTY_LABEL).map(([value, label]) => ({ value, label }))} />
        </Group>
        <Textarea label={t("建议下一步")} autosize minRows={2} value={f.next_step} onChange={(e) => set("next_step")(e.currentTarget.value)} />
        <Group justify="flex-end"><Button variant="default" onClick={onClose}>{t("取消")}</Button><Button loading={saving} onClick={save}>{t("保存")}</Button></Group>
      </Stack>
    </Modal>
  );
}
