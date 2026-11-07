"use client";
import { Badge, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChatStats } from "@/components/ChatStats";
import { usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";

type W = { w: string; c: number };
type Report = {
  keywords: W[]; catchphrases: { me: W[]; them: W[] }; emoji: { me: W[]; them: W[] }; avgLen: { me: number; them: number };
  heat: number[][]; types: [string, number][]; activeDays: number; longestStreak: number; longestGap: number;
};
const DAYS = ["日", "一", "二", "三", "四", "五", "六"];

function Block({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Paper className="surface" radius="xl" p="md">
      <Text size="sm" fw={650}>{title}</Text>
      {sub && <Text size="xs" className="faint" mb="sm">{sub}</Text>}
      {!sub && <div style={{ height: 8 }} />}
      {children}
    </Paper>
  );
}
function Chips({ list, color }: { list: W[]; color: string }) {
  if (!list.length) return <Text size="xs" className="faint">不够多，看不出来</Text>;
  return <Group gap={6}>{list.map((x) => <Badge key={x.w} variant="light" color={color} radius="sm" tt="none" size="lg" fw={500}>{x.w} <Text span size="xs" className="faint">{x.c}</Text></Badge>)}</Group>;
}

/** Everything the chat itself says about how you two talk — computed on this computer, no AI involved. */
export default function ReportPage() {
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const { data: prof } = useApi<{ name: string }>(`/api/people/${encodeURIComponent(key)}`);
  const { data } = useApi<{ report: Report | null }>(`/api/people/${encodeURIComponent(key)}/report`);
  const name = (prof?.name ?? "").replace(/^演示·/, "");
  usePageContext({ page: "person", personKey: key, personName: name });
  const r = data?.report;
  const maxHeat = r ? Math.max(1, ...r.heat.flat()) : 1;
  const maxKw = r?.keywords[0]?.c ?? 1;
  const totalTypes = r?.types.reduce((a, [, n]) => a + n, 0) ?? 1;

  return (
    <Stack gap="lg" className="fade-in">
      <div>
        <UnstyledButton component={Link} href={`/people/${encodeURIComponent(key)}`} className="back-link"><IconChevronLeft size={18} />{name || "返回"}</UnstyledButton>
        <Title order={1} fz={26} mt={6}>聊天分析</Title>
        <Text size="sm" className="muted" mt={4}>只用这台电脑上的聊天记录算出来，不经过 AI，也不打「好感度」之类的分。</Text>
      </div>
      <ChatStats personKey={key} />
      {!data ? <Skeleton h={300} radius="xl" /> : !r ? <Text className="faint">聊天太少，算不出来</Text> : (
        <>
          <Block title="什么时候聊" sub={`聊过 ${r.activeDays} 天 · 最长连续 ${r.longestStreak} 天都在聊 · 最长 ${r.longestGap} 天没聊`}>
            <Stack gap={3}>
              {r.heat.map((row, d) => (
                <Group key={d} gap={3} wrap="nowrap">
                  <Text size="10px" className="faint" w={14}>{DAYS[d]}</Text>
                  {row.map((n, h) => (
                    <Tooltip key={h} label={`周${DAYS[d]} ${h} 点：${n} 条`} withArrow>
                      <div className="heat-cell" style={{ opacity: n ? 0.15 + 0.85 * (n / maxHeat) : 0.06 }} />
                    </Tooltip>
                  ))}
                </Group>
              ))}
              <Group gap={3} wrap="nowrap" ml={17}>{[0, 6, 12, 18, 23].map((h) => <Text key={h} size="10px" className="faint" style={{ position: "relative", left: `${(h / 24) * 100}%` }}>{h}</Text>)}</Group>
            </Stack>
          </Block>
          <Block title="聊什么" sub="两个人用得最多的词">
            <Group gap={6}>
              {r.keywords.map((x) => <Text key={x.w} span fz={12 + Math.round(10 * (x.c / maxKw))} fw={x.c / maxKw > 0.5 ? 650 : 450} c={x.c / maxKw > 0.5 ? "radar" : undefined} className={x.c / maxKw > 0.5 ? undefined : "muted"}>{x.w}</Text>)}
            </Group>
          </Block>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Block title={`${name || "对方"} 的口头禅`} sub={`平均每条 ${r.avgLen.them} 个字`}><Chips list={r.catchphrases.them} color="violet" /></Block>
            <Block title="你的口头禅" sub={`平均每条 ${r.avgLen.me} 个字`}><Chips list={r.catchphrases.me} color="radar" /></Block>
            <Block title={`${name || "对方"} 常用的表情`}><Group gap="sm">{r.emoji.them.map((x) => <Text key={x.w} fz={22}>{x.w}<Text span size="xs" className="faint"> {x.c}</Text></Text>)}{!r.emoji.them.length && <Text size="xs" className="faint">很少用</Text>}</Group></Block>
            <Block title="你常用的表情"><Group gap="sm">{r.emoji.me.map((x) => <Text key={x.w} fz={22}>{x.w}<Text span size="xs" className="faint"> {x.c}</Text></Text>)}{!r.emoji.me.length && <Text size="xs" className="faint">很少用</Text>}</Group></Block>
          </SimpleGrid>
          <Block title="消息类型">
            <Stack gap={6}>
              {r.types.map(([t, n]) => (
                <Group key={t} gap="sm" wrap="nowrap">
                  <Text size="xs" w={40}>{t}</Text>
                  <div style={{ flex: 1 }}><div className="type-bar" style={{ width: `${Math.max(2, (100 * n) / totalTypes)}%` }} /></div>
                  <Text size="xs" className="faint tabular" w={56} ta="right">{n.toLocaleString()}</Text>
                </Group>
              ))}
            </Stack>
          </Block>
        </>
      )}
    </Stack>
  );
}
