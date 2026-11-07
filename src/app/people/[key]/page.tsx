"use client";
import { Alert, Avatar, Badge, Box, Button, Collapse, Group, Paper, SimpleGrid, Skeleton, Stack, Tabs, Text, ThemeIcon, Timeline, Title, UnstyledButton } from "@mantine/core";
import {
  IconArrowLeft, IconBriefcase, IconBulb, IconCalendarEvent, IconChartBar, IconChevronDown, IconChevronRight, IconClock, IconFlag, IconHeart,
  IconHeartHandshake, IconMessageHeart, IconSparkles, IconUser, IconUsersGroup,
} from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCurrentPerson } from "@/components/PersonSwitcher";
import { ChatMemory } from "@/components/ChatMemory";
import { TagEditor } from "@/components/TagEditor";
import { useCompanion, usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";
import { useBack } from "@/lib/nav";
import { dayDiff, initial, relDate, sinceText } from "@/lib/format";
import { isKnowledge, STATUS_LABEL, type Item, type PersonProfile } from "@/lib/types";

const FACETS: { key: string; icon: typeof IconHeart; color: string }[] = [
  { key: "作息与工作", icon: IconClock, color: "blue" },
  { key: "情况", icon: IconUser, color: "radar" },
  { key: "近况", icon: IconBriefcase, color: "radar" },
  { key: "喜好", icon: IconHeart, color: "pink" },
  { key: "明确需求", icon: IconMessageHeart, color: "orange" },
  { key: "相处约定", icon: IconHeartHandshake, color: "violet" },
  { key: "观点与判断", icon: IconBulb, color: "yellow" },
  { key: "其他", icon: IconFlag, color: "gray" },
];
const facetOf = (i: Item) => i.facet ?? "其他";

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="baseline"><Text fw={650}>{title}</Text>{extra}</Group>
      {children}
    </Stack>
  );
}

function Row({ item, right, flash }: { item: Item; right?: React.ReactNode; flash?: boolean }) {
  return (
    <Group renderRoot={(props) => <Link href={`/items/${item.id}`} {...props} />} id={`mem-item-${item.id}`} data-flash={flash || undefined} className="pressable mem-row" wrap="nowrap" gap="sm" px="md" py={12}
      style={{ borderTop: "1px solid light-dark(rgba(20,24,39,.06), rgba(255,255,255,.05))" }}>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" lh={1.45} c={item.status === "open" ? undefined : "dimmed"}>{item.title}</Text>
        <Text size="xs" className="faint" mt={2}>{item.eventDate ? relDate(item.eventDate, item.eventTime) : item.observedAt ? `${relDate(item.observedAt.slice(0, 10))}提到` : ""}</Text>
      </Box>
      {right}
      <IconChevronRight size={16} className="faint" style={{ flex: "none" }} />
    </Group>
  );
}

export default function PersonPage() {
  const { key: raw } = useParams<{ key: string }>();
  const key = decodeURIComponent(raw);
  const router = useRouter();
  const back = useBack("/people");
  const { openCompanion } = useCompanion();
  const { pick } = useCurrentPerson(); // "在今天里处理" switches Today to this person
  const { data: p, loading, error } = useApi<PersonProfile>(`/api/people/${encodeURIComponent(key)}`);
  const [tab, setTab] = useState<string | null>("overview");
  const [showSelf, setShowSelf] = useState(false);
  const { contacts } = useCurrentPerson();
  // set the AI's scope from the URL right away — before, it kept the previous page's person until this page's data arrived
  usePageContext({ page: "person", personKey: key, personName: p?.name ?? contacts.find((c) => c.key === key)?.name });
  const [memDate, setMemDate] = useState<string | null>(null);
  // tapping a line of the portrait opens 记忆 at that exact line (or at its group), and lights it up for a moment
  const [focus, setFocus] = useState<{ facet: string; item?: number; at: number } | null>(null);
  const [flash, setFlash] = useState<number | string | null>(null);
  const jump = (facet: string, item?: number) => { setTab("memory"); setFocus((f) => ({ facet, item, at: (f?.at ?? 0) + 1 })); };
  useEffect(() => {
    if (!focus || tab !== "memory") return;
    const t = setTimeout(() => {
      document.getElementById(focus.item ? `mem-item-${focus.item}` : `mem-facet-${focus.facet}`)?.scrollIntoView({ behavior: "smooth", block: focus.item ? "center" : "start" });
      setFlash(focus.item ?? focus.facet);
    }, 80);
    const u = setTimeout(() => setFlash(null), 3000);
    return () => { clearTimeout(t); clearTimeout(u); };
  }, [focus, tab]);
  const { data: mem } = useApi<{ days: { date: string; messages: number; items: number; summary: string | null }[] }>(`/api/people/${encodeURIComponent(key)}/memory`);

  if (loading && !p) return <Stack><Skeleton h={220} radius="xl" /><Skeleton h={40} radius="md" /><Skeleton h={200} radius="xl" /></Stack>;
  if (error || !p) return <Alert color="red" title="找不到这个人">{error}</Alert>;

  const short = p.name.replace(/^演示·/, "");
  // newest first: what you learned most recently is what you want to see first
  const when = (i: Item) => i.observedAt ?? i.eventDate ?? i.createdAt;
  // an older version of something (已有新版本) is reachable from the newer item; listing both reads like a repeat
  const aboutThem = p.items.filter((i) => isKnowledge(i) && i.subject !== "self" && i.status !== "superseded").sort((a, b) => when(b).localeCompare(when(a)));
  const aboutMe = p.items.filter((i) => isKnowledge(i) && i.subject === "self");
  const actions = p.items.filter((i) => !isKnowledge(i));
  const openActions = actions.filter((i) => i.status === "open");
  const milestones = actions.filter((i) => i.eventDate && i.status !== "cancelled" && i.certainty !== "cancelled")
    .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? "")).slice(0, 6);
  const facets = FACETS.map((f) => ({ ...f, list: aboutThem.filter((i) => facetOf(i) === f.key) })).filter((f) => f.list.length);

  return (
    <Stack gap="lg" className="fade-in">
      <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} px={6} w="fit-content" onClick={back}>返回</Button>

      {/* hero */}
      <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
        <Box h={88} style={{ background: "light-dark(linear-gradient(120deg, #dff6f2 0%, #ece9ff 100%), radial-gradient(120% 140% at 10% 0%, rgba(52,204,182,.28), transparent 55%), radial-gradient(120% 140% at 100% 0%, rgba(124,108,240,.32), transparent 55%), #171b2b)" }} />
        <Stack align="center" gap={6} mt={-44} px="lg" pb="lg">
          <Avatar src={p.isGroup ? undefined : `/api/avatar/${encodeURIComponent(p.key)}`} size={88} radius={44} variant="gradient" gradient={{ from: "radar.5", to: "violet.5", deg: 135 }}
            style={{ border: "4px solid light-dark(#fff, var(--mantine-color-dark-6))", fontSize: 32 }}>
            {p.isGroup ? <IconUsersGroup size={36} /> : initial(p.name)}
          </Avatar>
          <Title order={2} fz={24}>{p.name}</Title>
          {!p.isGroup && <TagEditor personKey={p.key} tags={p.tags ?? []} />}
          <Text size="sm" className="muted" ta="center">
            {p.isGroup ? "群聊" : "联系人"}
            {p.chat?.firstAt ? ` · ${p.chat.firstAt.slice(0, 4)}年${Number(p.chat.firstAt.slice(5, 7))}月开始聊天` : ""}
            {p.chat?.lastAt ? ` · 最近联系 ${sinceText(p.chat.lastAt)}` : ""}
          </Text>
          {p.chat && (
            <SimpleGrid cols={3} spacing="xs" w="100%" mt="sm">
              {[[p.chat.last30.toLocaleString(), "近 30 天消息"], [p.chat.messages.toLocaleString(), "全部消息"], [p.chat.mineShare == null ? "—" : `${Math.round(p.chat.mineShare * 100)}%`, "你发的占比"]].map(([n, l]) => (
                <Box key={l} ta="center" py={6}><Text fw={650} className="tabular">{n}</Text><Text size="xs" className="faint">{l}</Text></Box>
              ))}
            </SimpleGrid>
          )}
          <Text size="10px" className="faint">只统计事实，不打亲密度之类的分数</Text>
        </Stack>
      </Paper>

      <Tabs value={tab} onChange={setTab} variant="pills" radius="xl" keepMounted={false}>
        <Tabs.List grow mb="lg" p={4} className="surface" style={{ borderRadius: 999 }}>
          <Tabs.Tab value="overview">概览</Tabs.Tab>
          <Tabs.Tab value="analysis">分析</Tabs.Tab>
          <Tabs.Tab value="chat">聊天记忆</Tabs.Tab>
          <Tabs.Tab value="memory">记忆</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <Stack gap="xl">
            {p.analysis && (
              <UnstyledButton onClick={() => setTab("analysis")} w="100%" p="md"
                style={{ borderRadius: "var(--mantine-radius-xl)", border: "1px solid light-dark(var(--mantine-color-violet-1), rgba(124,108,240,.25))", background: "light-dark(rgba(124,108,240,.04), rgba(124,108,240,.08))", textAlign: "left" }}>
                <Group gap={6} mb={6}><IconSparkles size={15} color="var(--mantine-color-violet-5)" /><Text size="xs" c="violet" fw={600}>AI 分析 · 推测，附依据</Text></Group>
                <Text size="sm" lh={1.7}>{p.analysis.summary}</Text>
                <Text size="xs" c="violet" mt={6}>看完整分析 ›</Text>
              </UnstyledButton>
            )}
            <Section title={`${short}的画像`} extra={<Text size="xs" className="faint">每条都有原话出处</Text>}>
              <Paper className="surface" radius="xl" py={4}>
                {facets.length ? facets.map((f, i) => (
                  <Group key={f.key} wrap="nowrap" align="flex-start" gap="sm" px="md" py={12}
                    style={{ borderTop: i ? "1px solid light-dark(rgba(20,24,39,.06), rgba(255,255,255,.05))" : undefined }}>
                    <UnstyledButton onClick={() => jump(f.key)} aria-label={`看全部${f.key}`}>
                      <ThemeIcon size={30} radius="md" variant="light" color={f.color}><f.icon size={17} /></ThemeIcon>
                    </UnstyledButton>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <UnstyledButton onClick={() => jump(f.key)}><Text size="xs" className="faint">{f.key}{f.list.length > 2 ? ` · ${f.list.length} 条 ›` : ""}</Text></UnstyledButton>
                      {f.list.slice(0, 2).map((x) => (
                        <UnstyledButton key={x.id} onClick={() => jump(f.key, x.id)} className="portrait-line" display="block" w="100%">
                          <Text size="sm" lh={1.5} truncate>{x.title}</Text>
                        </UnstyledButton>
                      ))}
                    </Box>
                  </Group>
                )) : <Text size="sm" className="faint" p="md">还没有记录到关于{short}的信息</Text>}
              </Paper>
            </Section>

            {!p.isGroup && p.chat && (
              <Paper component={Link} href={`/people/${encodeURIComponent(p.key)}/report`} className="surface report-entry pressable">
                <Group justify="space-between" wrap="nowrap">
                  <div style={{ minWidth: 0 }}>
                    <Group gap={6}><IconChartBar size={16} color="var(--mantine-color-radar-6)" /><Text size="sm" fw={600}>聊天分析</Text></Group>
                    <Text size="xs" className="faint" mt={2}>回复率、谁先开口、什么时候聊、口头禅、聊什么</Text>
                  </div>
                  <IconChevronRight size={18} className="faint" />
                </Group>
              </Paper>
            )}

            {openActions.length > 0 && (
              <UnstyledButton onClick={() => { pick(key); router.push("/"); }}>
                <Text size="sm" className="muted">{short}有 {openActions.length} 件事在关注，在「今天」里处理 ›</Text>
              </UnstyledButton>
            )}

            <Section title="最近聊天" extra={<UnstyledButton onClick={() => { setMemDate(null); setTab("chat"); }}><Text size="xs" c="radar">聊天记忆 ›</Text></UnstyledButton>}>
              <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
                {(mem?.days ?? []).slice(0, 3).map((d, i) => (
                  <UnstyledButton key={d.date} onClick={() => { setMemDate(d.date); setTab("chat"); }} w="100%" px="md" py={11} className="pressable"
                    style={{ borderTop: i ? "1px solid light-dark(rgba(20,24,39,.06), rgba(255,255,255,.05))" : undefined }}>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="sm">{relDate(d.date)}</Text>
                        {d.summary && <Text size="xs" className="muted" lineClamp={1}>{d.summary}</Text>}
                      </Box>
                      <Text size="xs" className="faint tabular" style={{ flex: "none" }}>{d.messages} 条{d.items ? ` · 记下 ${d.items} 件` : ""}</Text>
                    </Group>
                  </UnstyledButton>
                ))}
                {mem && !mem.days.length && <Text size="sm" className="faint" p="md">暂无</Text>}
              </Paper>
            </Section>

            <Section title="重要日程">
              <Paper className="surface" radius="xl" px="md" py="md">
                <Timeline active={-1} bulletSize={22} lineWidth={1.5}>
                  {milestones.map((i) => (
                    <Timeline.Item key={i.id} bullet={<IconCalendarEvent size={12} />}>
                      <Group justify="space-between" wrap="nowrap" renderRoot={(props) => <Link href={`/items/${i.id}`} {...props} />}>
                        <Text size="sm">{i.title}</Text>
                        <Text size="xs" className="faint tabular" style={{ flex: "none" }}>{i.eventDate}</Text>
                      </Group>
                    </Timeline.Item>
                  ))}
                  {p.chat?.firstAt && (
                    <Timeline.Item bullet={<IconSparkles size={12} />}>
                      <Group justify="space-between" wrap="nowrap"><Text size="sm">开始聊天</Text><Text size="xs" className="faint tabular">{p.chat.firstAt.slice(0, 10)}</Text></Group>
                    </Timeline.Item>
                  )}
                </Timeline>
                {!milestones.length && !p.chat?.firstAt && <Text size="sm" className="faint">暂无</Text>}
              </Paper>
            </Section>

            <Paper p="md" radius="xl" style={{ border: "1px solid light-dark(var(--mantine-color-violet-1), rgba(124,108,240,.25))", background: "light-dark(rgba(124,108,240,.04), rgba(124,108,240,.08))" }}>
              <Group gap={6} mb="xs"><IconSparkles size={16} color="var(--mantine-color-violet-5)" /><Text size="sm" fw={600}>问 AI 关于{short}</Text></Group>
              <Group gap={8}>
                {["最近有什么值得我主动关心的？", "最近我答应了什么还没完成？", "帮我按我平时的语气起草一条关心的消息"].map((q) => (
                  <Button key={q} size="xs" radius="xl" variant="light" color="violet" onClick={() => openCompanion(q)}>{q.replace(/[？?]$/, "")}</Button>
                ))}
              </Group>
            </Paper>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="analysis">
          {p.analysis ? (
            <Stack gap="lg">
              <Text size="xs" className="faint">AI 根据 {p.analysis.basisItems} 条整理过的记录写的分析，{p.analysis.generatedAt.slice(0, 16)} 更新。
                标「推测」的是归纳出来的，不是定论；点编号可以看原话。</Text>
              <Paper className="surface" radius="xl" p="md"><Text size="sm" lh={1.8}>{p.analysis.summary}</Text></Paper>
              {p.analysis.sections.map((sec) => (
                <Section key={sec.title} title={sec.title}>
                  <Paper className="surface" radius="xl" p="md">
                    <Stack gap="sm">
                      {sec.points.map((pt, i) => (
                        <Box key={i}>
                          <Group gap={6} align="flex-start" wrap="nowrap">
                            <Badge size="xs" mt={3} color={pt.basis === "fact" ? "teal" : "violet"} variant="light" style={{ flex: "none" }}>{pt.basis === "fact" ? "事实" : "推测"}</Badge>
                            <Text size="sm" lh={1.65}>{pt.text}</Text>
                          </Group>
                          <Group gap={4} mt={4} ml={40}>
                            {pt.items.map((id) => (
                              <Text key={id} component={Link} href={`/items/${id}`} size="xs" c="radar">#{id}</Text>
                            ))}
                          </Group>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Section>
              ))}
            </Stack>
          ) : (
            <Paper className="surface" radius="xl" p="xl" ta="center">
              <IconSparkles size={26} color="var(--mantine-color-violet-5)" />
              <Text size="sm" mt="xs">{short}的聊天还在整理中，整理完会自动写分析</Text>
              <Text size="xs" className="faint" mt={4}>已整理 {p.items.length} 条记录</Text>
            </Paper>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="chat">
          <ChatMemory personKey={key} personName={short} initialDate={memDate} />
        </Tabs.Panel>

        <Tabs.Panel value="memory">
          <Stack gap="lg">
            {facets.map((f) => (
              <div key={f.key} id={`mem-facet-${f.key}`} className="mem-facet" data-flash={flash === f.key || undefined}>
                <Section title={f.key} extra={<ThemeIcon size={22} radius="sm" variant="light" color={f.color}><f.icon size={13} /></ThemeIcon>}>
                  <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>
                    {f.list.map((i) => <Row key={i.id} item={i} flash={flash === i.id} right={i.status !== "open" ? <Badge size="xs" color="gray">{STATUS_LABEL[i.status]}</Badge> : undefined} />)}
                  </Paper>
                </Section>
              </div>
            ))}
            {!facets.length && <Text className="faint" ta="center" py="xl">还没有记录</Text>}
            {aboutMe.length > 0 && (
              <Stack gap="xs">
                <UnstyledButton onClick={() => setShowSelf((s) => !s)}>
                  <Group gap={6}><Text size="sm" className="muted">在和{short}的聊天里提到的你自己 · {aboutMe.length}</Text>
                    <IconChevronDown size={14} style={{ transform: showSelf ? "rotate(180deg)" : undefined }} /></Group>
                </UnstyledButton>
                <Collapse expanded={showSelf}>
                  <Paper className="surface" radius="xl" style={{ overflow: "hidden" }}>{aboutMe.map((i) => <Row key={i.id} item={i} />)}</Paper>
                </Collapse>
              </Stack>
            )}
          </Stack>
        </Tabs.Panel>

      </Tabs>
      {p.chat && dayDiff(p.chat.lastAt?.slice(0, 10) ?? "") < -14 && (
        <Text size="xs" className="faint" ta="center">已经 {-dayDiff(p.chat.lastAt!.slice(0, 10))} 天没有聊天了</Text>
      )}
    </Stack>
  );
}
