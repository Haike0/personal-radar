"use client";
import { Alert, Badge, Box, Collapse, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconCloudOff, IconFlask, IconInbox } from "@tabler/icons-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CAT_COLOR, ItemCard, ReviewButtons } from "@/components/ItemCard";
import { UpdateNotice } from "@/components/DataAbout";
import { PersonBar, useCurrentPerson } from "@/components/PersonSwitcher";
import { usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";
import { ORDER, pickFocus } from "@/lib/focus";
import { dayDiff, greeting, relDate, sinceText, WEEKDAYS, weekdayLine } from "@/lib/format";
import type { Health } from "@/lib/health";
import { CATEGORY_LABEL, CERTAINTY_LABEL, isKnowledge, unreviewed, type Item, type Mode } from "@/lib/types";

type Data = { mode: Mode; items: Item[]; counts: { action: number; review: number; watching: number } };

function Stat({ n, label, hint, color, onClick }: { n: number; label: string; hint: string; color?: string; onClick?: () => void }) {
  const lit = color && n;
  return (
    <UnstyledButton onClick={onClick} className="surface pressable" p="md" style={{ borderRadius: "var(--mantine-radius-xl)", ...(lit ? { background: `light-dark(var(--mantine-color-${color}-0), color-mix(in srgb, var(--mantine-color-${color}-9) 22%, var(--mantine-color-dark-6)))` } : {}) }}>
      <Text fz={28} fw={650} lh={1.1} className="tabular" c={lit ? `${color}.6` : undefined}>{n}</Text>
      <Text size="sm" fw={550} mt={4}>{label}</Text>
      <Text size="xs" className="faint" lh={1.4} visibleFrom="xs">{hint}</Text>
    </UnstyledButton>
  );
}

function Card({ title, extra, children, id }: { title: string; extra?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <Stack gap="xs" id={id} style={{ scrollMarginTop: 16 }}>
      <Group justify="space-between" align="baseline"><Text fw={650}>{title}</Text>{extra}</Group>
      {children}
    </Stack>
  );
}
const More = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Text component={Link} href={href} size="xs" c="radar">{children} ›</Text>
);
const line = { borderTop: "1px solid light-dark(rgba(20,24,39,.07), rgba(255,255,255,.06))" };

/** 今天 / 明天 15:00 / 11/9 周一 — fits one line in the week list */
function shortDay(i: Item) {
  const n = dayDiff(i.eventDate!);
  if (n <= 2) return relDate(i.eventDate, i.eventTime);
  const x = new Date(i.eventDate! + "T00:00:00");
  return `${x.getMonth() + 1}/${x.getDate()} ${WEEKDAYS[x.getDay()]}`;
}

/** Next 7 days at a glance: what's coming, and which dates still need checking. */
function Week({ items }: { items: Item[] }) {
  const list = items
    .filter((i) => i.eventDate && !isKnowledge(i) && ["open", "snoozed"].includes(i.status) && dayDiff(i.eventDate) >= 0 && dayDiff(i.eventDate) <= 7)
    .sort((a, b) => (a.eventDate! + (a.eventTime ?? "")).localeCompare(b.eventDate! + (b.eventTime ?? "")));
  const unsure = list.filter((i) => i.certainty !== "confirmed" || unreviewed(i)).length;
  return (
    <Card title="未来 7 天" extra={<More href="/timeline">时间线</More>}>
      <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
        {list.map((i, idx) => (
          <Group key={i.id} renderRoot={(p) => <Link href={`/items/${i.id}`} {...p} />} wrap="nowrap" gap="sm" px="md" py={11} className="pressable" style={idx ? line : undefined}>
            <Text size="xs" fw={600} w={72} className="tabular" c={dayDiff(i.eventDate!) <= 1 ? "red.6" : undefined} style={{ flex: "none", whiteSpace: "nowrap" }}>{shortDay(i)}</Text>
            <Text size="sm" lh={1.45} style={{ flex: 1, minWidth: 0 }}>{i.title}</Text>
            {i.certainty !== "confirmed" && <Badge size="xs" color="yellow" style={{ flex: "none" }}>{CERTAINTY_LABEL[i.certainty]}</Badge>}
            {unreviewed(i) && <Badge size="xs" color="violet" variant="dot" style={{ flex: "none" }}>未核对</Badge>}
          </Group>
        ))}
        {!list.length && <Text size="sm" className="faint" p="md">这 7 天没有已知的安排</Text>}
      </Paper>
      {list.length > 0 && <Text size="xs" className="faint" pl={4}>{list.length - unsure} 项已确认{unsure ? ` · ${unsure} 项日期或内容待核实` : ""}</Text>}
    </Card>
  );
}

/** A few AI-organized action items to check with one tap; the full queue is on /review. */
function ReviewBox({ items, personKey }: { items: Item[]; personKey: string }) {
  const list = items.filter((i) => !isKnowledge(i) && i.status === "open" && unreviewed(i))
    .sort((a, b) => (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"));
  if (!list.length) return null;
  return (
    <Card id="sec-review" title={`待你核对 · ${list.length}`} extra={<More href={`/review?person=${encodeURIComponent(personKey)}`}>逐条核对</More>}>
      <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
        {list.slice(0, 3).map((i, idx) => (
          <Box key={i.id} px="md" py={12} style={idx ? line : undefined}>
            <Text component={Link} href={`/items/${i.id}`} size="sm" lh={1.45} display="block">{i.title}</Text>
            <Group justify="space-between" mt={6} wrap="nowrap">
              <Text size="xs" className="faint">{i.eventDate ? relDate(i.eventDate, i.eventTime) : i.observedAt ? `${relDate(i.observedAt.slice(0, 10))}提到` : ""}</Text>
              <ReviewButtons item={i} size="compact-xs" />
            </Group>
          </Box>
        ))}
      </Paper>
      <Text size="xs" className="faint" pl={4}>AI 从聊天里整理出来、你还没确认的事。没核对的只在 App 里显示，除非是有明确日期和原话的安排，否则不会推送通知。</Text>
    </Card>
  );
}

/** Three different kinds of progress, kept apart: 聊天已导入 → AI 已整理 → 你已核对. */
function DataState({ h }: { h: Health | null }) {
  if (!h) return null;
  const p = h.people[0];
  const rows: [string, string, boolean | null][] = [
    ["聊天", h.sync.at ? `${sinceText(h.sync.at.replace("T", " "))} 导入${h.sync.ok ? "" : `失败：${h.sync.error ?? "未知"}`}` : "还没有导入记录", h.sync.ok],
  ];
  if (p) {
    rows.push(["AI 整理", p.remaining == null ? "还没开始整理" : p.remaining ? `还有 ${p.remaining} 条新消息没整理（已读到 ${p.organizedUntil?.slice(5)}）` : `已整理到最新（${p.organizedUntil?.slice(5)}）`, p.remaining == null ? null : p.remaining === 0]);
    if (p.voice.total) rows.push(["语音", `${p.voice.transcribed}/${p.voice.total} 条已转文字${p.voice.doubtful ? `，${p.voice.doubtful} 条识别存疑` : ""}`, p.voice.transcribed >= p.voice.total]);
  }
  const r = h.review;
  rows.push(["你核对", `行动类还有 ${r.actionPending} 条没核对 · 已核对 ${r.accepted + r.rejected} 条${r.accepted + r.rejected ? `（${r.rejected} 条识别错）` : ""}`, r.actionPending === 0]);
  return (
    <Card title="数据状态" extra={<More href="/settings#health">详情</More>}>
      <Paper className="surface" radius="xl" px="md" py={6}>
        {rows.map(([k, v, ok], idx) => (
          <Group key={k} wrap="nowrap" gap="sm" py={8} align="flex-start" style={idx ? line : undefined}>
            <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 7, flex: "none", background: ok ? "var(--mantine-color-radar-filled)" : ok === false ? "var(--mantine-color-orange-5)" : "var(--mantine-color-gray-5)" }} />
            <Text size="xs" fw={600} w={48} style={{ flex: "none" }}>{k}</Text>
            <Text size="xs" className="muted" lh={1.5}>{v}</Text>
          </Group>
        ))}
      </Paper>
    </Card>
  );
}

export default function Home() {
  const router = useRouter();
  // always ask fresh (a cached "not set up yet" would bounce you back to the welcome page right after choosing)
  const [ready, setReady] = useState(false);
  const [demoOnly, setDemoOnly] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/onboarding", { cache: "no-store" }).then((r) => r.json())
      .then((j: { onboarded: boolean; demoOnly?: boolean }) => { if (!alive) return; setDemoOnly(Boolean(j.demoOnly)); if (j.onboarded) setReady(true); else router.replace("/welcome"); })
      .catch(() => alive && setReady(true));
    return () => { alive = false; };
  }, [router]);
  const who = useCurrentPerson();
  const person = who.person;
  // the AI button on this page answers about the person being shown
  usePageContext(person ? { page: "person", personKey: person.key, personName: person.name } : { page: "home" });
  const q = person ? `?person=${encodeURIComponent(person.key)}` : null;
  const { data, error, loading } = useApi<Data>(q && `/api/items${q}`);
  const { data: health } = useApi<Health>(q && `/api/health${q}`);
  const [showRest, setShowRest] = useState(true); // open by default (user preference)
  const [showDone, setShowDone] = useState(false);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (!ready) return <Stack><Skeleton h={60} radius="lg" /><Skeleton h={120} radius="lg" /></Stack>;
  if (!who.loading && !person) return <Text className="faint" ta="center" py="xl">还没有联系人</Text>;
  if ((loading || who.loading) && !data) return <Stack><Skeleton h={60} radius="lg" /><Skeleton h={90} radius="lg" /><Skeleton h={120} radius="lg" /><Skeleton h={120} radius="lg" /></Stack>;
  if (error && !data) return <Alert color="red" icon={<IconCloudOff />} title="连不上">{error}</Alert>;
  const d = data!;
  const actionable = d.items.filter((i) => !isKnowledge(i));
  const open = actionable.filter((i) => i.status === "open");
  const focus = pickFocus(d.items);
  const focusIds = new Set(focus.map((i) => i.id));
  const rest = open.filter((i) => !focusIds.has(i.id));
  const handled = actionable.filter((i) => i.status !== "open" && i.status !== "superseded");
  const knowledge = d.items.filter(isKnowledge);
  const learned = knowledge.filter((i) => i.observedAt && -dayDiff(i.observedAt.slice(0, 10)) <= 7).length;
  const pk = person!.key;

  return (
    <Stack gap="xl" className="fade-in">
      <div>
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" className="faint">{weekdayLine()}</Text>
            <Title order={1} fz={30} mt={2}>{greeting()}</Title>
          </div>
          {d.mode === "demo" ? <Badge color="yellow" variant="light" leftSection={<IconFlask size={12} />} mt={6}>演示数据</Badge>
            : <Badge color="radar" variant="light" mt={6}>真实数据</Badge>}
        </Group>
        <Box mt="md">
          <PersonBar {...who} subtitle={focus.length ? `今天有 ${focus.length} 件值得你关注的事` : "今天没有需要你操心的事"} />
        </Box>
      </div>

      <UpdateNotice />
      {d.mode === "demo" && (
        <Paper component={Link} href={demoOnly ? "https://github.com/Ikarishinji00/personal-radar" : "/setup"} className="surface setup-banner" radius="xl" p="md">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={650}>{demoOnly ? "这是在线演示，数据全是编的" : "现在看的是编出来的演示数据"}</Text>
              <Text size="xs" className="muted">{demoOnly ? "装到自己电脑上，就能导入你的 LINE / WhatsApp / Telegram 聊天" : "导入你自己的 LINE / WhatsApp / Telegram 聊天，四步就能用"}</Text>
            </div>
            <Group gap={4} wrap="nowrap" style={{ flex: "none" }}><Text size="sm" fw={600} c="radar">{demoOnly ? "去下载" : "开始设置"}</Text><IconChevronRight size={16} /></Group>
          </Group>
        </Paper>
      )}

      <SimpleGrid cols={3} spacing="sm">
        <Stat n={d.counts.action} label="需要行动" hint="近期有截止，或答应了还没做" color="red" onClick={() => scrollTo("sec-focus")} />
        <Stat n={d.counts.review} label="待你核对" hint="AI 整理的，你还没确认" color="violet" onClick={() => scrollTo("sec-review")} />
        <Stat n={d.counts.watching} label="持续观察" hint="还开着，暂时不用动" onClick={() => { setShowRest(true); setTimeout(() => scrollTo("sec-rest"), 50); }} />
      </SimpleGrid>

      {/* reading order: what to do today → what else matters → (for the curious) checks, the week, data status */}
            <Card id="sec-focus" title="今天可以做什么">
              {focus.length ? focus.map((i) => <ItemCard key={i.id} item={i} focus actions />) : (
                <Paper className="surface" p="xl" radius="xl" ta="center"><IconInbox size={28} className="faint" /><Text className="muted" mt="xs">没有需要马上处理的事</Text></Paper>
              )}
            </Card>
            <Stack gap="md">
              <UnstyledButton id="sec-rest" onClick={() => setShowRest((s) => !s)} style={{ scrollMarginTop: 16 }}>
                <Group justify="space-between">
                  <Text fw={650}>其他在关注的 · {rest.length}</Text>
                  <IconChevronDown size={16} className="faint" style={{ transform: showRest ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} />
                </Group>
                <Text size="xs" className="faint" mt={2}>{ORDER.map((c) => [c, rest.filter((i) => i.category === c).length] as const).filter(([, n]) => n).map(([c, n]) => `${CATEGORY_LABEL[c]} ${n}`).join(" · ") || "没有了"}</Text>
              </UnstyledButton>
              <Collapse expanded={showRest}>
                <Stack gap="lg">
                  {ORDER.map((c) => {
                    const list = rest.filter((i) => i.category === c);
                    return list.length ? (
                      <Stack key={c} gap="xs">
                        <Group gap={8} align="baseline">
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: `var(--mantine-color-${CAT_COLOR[c]}-5)`, display: "inline-block" }} />
                          <Text fw={600} size="sm">{CATEGORY_LABEL[c]}</Text>
                        </Group>
                        {list.map((i) => <ItemCard key={i.id} item={i} />)}
                      </Stack>
                    ) : null;
                  })}
                </Stack>
              </Collapse>
              {learned > 0 && (
                <Paper component={Link} href={`/people/${encodeURIComponent(pk)}?tab=memory`} className="surface pressable" radius="xl" px="md" py={12}>
                  <Group justify="space-between" wrap="nowrap">
                    <div><Text size="sm" fw={550}>值得知道</Text><Text size="xs" className="muted">最近 7 天新了解到 {learned} 条关于{person!.name}的近况和偏好，暂时不用你做什么</Text></div>
                    <IconChevronRight size={16} className="faint" style={{ flex: "none" }} />
                  </Group>
                </Paper>
              )}
              {handled.length > 0 && (
                <Stack gap="xs">
                  <UnstyledButton onClick={() => setShowDone((s) => !s)}>
                    <Group gap={6}><Text size="sm" className="muted">已处理 · {handled.length}</Text>
                      <IconChevronDown size={14} style={{ transform: showDone ? "rotate(180deg)" : undefined, transition: "transform 150ms" }} /></Group>
                  </UnstyledButton>
                  <Collapse expanded={showDone}><Stack gap="xs">{handled.map((i) => <ItemCard key={i.id} item={i} />)}</Stack></Collapse>
                </Stack>
              )}
            </Stack>

      <Stack gap="xl" mt="md">
        <ReviewBox items={d.items} personKey={pk} />
        <Week items={d.items} />
        <DataState h={health} />
      </Stack>
      {knowledge.length > 0 && (
        <Text component={Link} href={`/people/${encodeURIComponent(pk)}`} size="sm" className="muted" ta="center">另有 {knowledge.length} 条关于{person!.name}的信息和偏好，在TA的画像里 ›</Text>
      )}
    </Stack>
  );
}
