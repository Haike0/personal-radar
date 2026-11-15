"use client";
import { t } from "@/lib/i18n";
import { Badge, Button, Group, Paper, SegmentedControl, Skeleton, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconChevronLeft, IconShare2 } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { LedgerShare } from "@/components/LedgerShare";
import { usePageContext } from "@/components/Shell";
import { post, useApi } from "@/lib/client";
import { daysAgo, punchline, STATE_LABEL, stateOf, tally, type LedgerData, type LedgerRowView, type LedgerState, type LedgerWho } from "@/lib/ledger-view";
import { useBack } from "@/lib/nav";

const COLOR: Record<LedgerState, string> = { done: "teal", not: "orange", silent: "pink", waiting: "gray", skip: "gray" };
const chatLink = (key: string, m: { mid: string | null; ts: string }) =>
  `/people/${encodeURIComponent(key)}?tab=chat&date=${m.ts.slice(0, 10)}${m.mid ? `&mid=${encodeURIComponent(m.mid)}` : ""}`;

function Row({ r, personKey, name, onChange }: { r: LedgerRowView; personKey: string; name: string; onChange: () => void }) {
  const s = stateOf(r);
  const set = async (patch: { verdict?: string | null; who?: LedgerWho }) => { await post(`/api/people/${encodeURIComponent(personKey)}/ledger`, { id: r.id, ...patch }, "PATCH"); onChange(); };
  return (
    <Stack gap={6} px="md" py={12} className="ledger-row">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Text size="sm" fw={550} lh={1.45} style={{ minWidth: 0 }}>{r.title}</Text>
        <Badge color={COLOR[s]} variant="light" style={{ flex: "none" }}>{STATE_LABEL[s]}</Badge>
      </Group>
      {r.quote && (
        <Text component={Link} href={chatLink(personKey, r.quote)} size="xs" className="muted" lh={1.5} lineClamp={2}>
          「{r.quote.text}」 · {daysAgo(r.saidAt)}
        </Text>
      )}
      {r.ai?.reason && (
        <Text size="xs" lh={1.5} c="dimmed">
          AI：{r.ai.reason}
          {r.ai.proof && <Text component={Link} href={chatLink(personKey, r.ai.proof)} span size="xs" c="radar"> {" "}{t("看那条消息 ›")}</Text>}
        </Text>
      )}
      <Group gap={6} mt={2}>
        <SegmentedControl size="xs" radius="xl" value={r.verdict ?? ""} onChange={(v) => set({ verdict: v || null })}
          data={[{ value: "", label: t("按 AI") }, { value: "done", label: t("做到了") }, { value: "not", label: t("没做") }, { value: "skip", label: t("不算") }]} />
        <UnstyledButton onClick={() => set({ who: r.who === "me" ? "them" : "me" })}>
          <Text size="xs" className="faint">{t("改成{0}", r.who === "me" ? t("{0}答应的", name) : t("我答应的"))}</Text>
        </UnstyledButton>
      </Group>
    </Stack>
  );
}

/** Every promise between you two, the AI's call on each, and a one-tap card to post. */
export default function LedgerPage() {
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const { data: prof } = useApi<{ name: string }>(`/api/people/${encodeURIComponent(key)}`);
  const { data, reload } = useApi<LedgerData>(`/api/people/${encodeURIComponent(key)}/ledger`);
  const [open, setOpen] = useState(false);
  const name = (prof?.name ?? "").replace(/^演示·/, "") || "TA";
  const back = useBack(`/people/${encodeURIComponent(key)}`);
  usePageContext({ page: "person", personKey: key, personName: name });
  const tl = data ? tally(data.rows) : null;

  const side = (title: string, list: LedgerRowView[]) => (
    <Stack gap="xs">
      <Text fw={650}>{title} · {list.length}</Text>
      <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
        {list.map((r) => <Row key={r.id} r={r} personKey={key} name={name} onChange={reload} />)}
        {!list.length && <Text size="sm" className="faint" p="md">{t("一件都没有")}</Text>}
      </Paper>
    </Stack>
  );

  return (
    <Stack gap="lg" className="fade-in">
      <div>
        <UnstyledButton onClick={back} className="back-link"><IconChevronLeft size={18} />{name}</UnstyledButton>
        <Title order={1} fz={26} mt={6}>{t("说话算数账本")}</Title>
        <Text size="sm" className="muted" mt={4}>{t("你和{0}互相答应过的事，AI 翻了后面的聊天，看谁做到了、谁没做。判错的可以直接改。", name)}</Text>
      </div>
      {!data || !tl ? <Skeleton h={300} radius="xl" /> : (
        <>
          <Paper className="ledger-entry" radius="xl" p="md">
            <Group justify="space-between" wrap="nowrap" align="flex-end">
              <div>
                <Text size="xs" className="muted">{t("我欠{0} {1} 件 · {2}欠我 {3} 件", name, tl.me.owed, name, tl.them.owed)}</Text>
                <Text fw={700} mt={4}>{punchline(tl.me.owed, tl.them.owed, name, tl.me.proven, tl.them.proven)}</Text>
              </div>
              <Button radius="xl" color="orange" leftSection={<IconShare2 size={16} />} onClick={() => setOpen(true)} style={{ flex: "none" }}>{t("晒图")}</Button>
            </Group>
            {data.unchecked > 0 && <Text size="xs" className="faint" mt={6}>{t("还有 {0} 件 AI 没看过，点「晒图」会先让 AI 看完。", data.unchecked)}</Text>}
          </Paper>
          {side(t("{0}答应我的", name), data.rows.filter((r) => r.who === "them"))}
          {side(t("我答应{0}的", name), data.rows.filter((r) => r.who === "me"))}
          {tl.both.list.length > 0 && side(t("一起说好的（不算谁欠谁）"), data.rows.filter((r) => r.who === "both"))}
        </>
      )}
      <LedgerShare personKey={key} personName={name} opened={open} onClose={() => { setOpen(false); reload(); }} />
    </Stack>
  );
}
