"use client";
import { t } from "@/lib/i18n";
import { Badge, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip, UnstyledButton } from "@mantine/core";
import { IconChevronLeft } from "@tabler/icons-react";
import { useParams } from "next/navigation";
import { ChatStats } from "@/components/ChatStats";
import { usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";
import { useBack } from "@/lib/nav";

type W = { w: string; c: number };
type Report = {
  keywords: W[]; catchphrases: { me: W[]; them: W[] }; emoji: { me: W[]; them: W[] }; avgLen: { me: number; them: number };
  heat: number[][]; types: [string, number][]; activeDays: number; longestStreak: number; longestGap: number;
};
const DAYS = [t("日"), t("一"), t("二"), t("三"), t("四"), t("五"), t("六")];

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
  if (!list.length) return <Text size="xs" className="faint">{t("不够多，看不出来")}</Text>;
  return <Group gap={6}>{list.map((x) => <Badge key={x.w} variant="light" color={color} radius="sm" tt="none" size="lg" fw={500}>{x.w} <Text span size="xs" className="faint">{x.c}</Text></Badge>)}</Group>;
}

/** Everything the chat itself says about how you two talk — computed on this computer, no AI involved. */
export default function ReportPage() {
  const key = decodeURIComponent(useParams<{ key: string }>().key);
  const { data: prof } = useApi<{ name: string }>(`/api/people/${encodeURIComponent(key)}`);
  const { data } = useApi<{ report: Report | null }>(`/api/people/${encodeURIComponent(key)}/report`);
  const name = (prof?.name ?? "").replace(/^演示·/, "");
  const back = useBack(`/people/${encodeURIComponent(key)}`);
  usePageContext({ page: "person", personKey: key, personName: name });
  const r = data?.report;
  const maxHeat = r ? Math.max(1, ...r.heat.flat()) : 1;
  const maxKw = r?.keywords[0]?.c ?? 1;
  const totalTypes = r?.types.reduce((a, [, n]) => a + n, 0) ?? 1;

  return (
    <Stack gap="lg" className="fade-in">
      <div>
        <UnstyledButton onClick={back} className="back-link"><IconChevronLeft size={18} />{name || t("返回")}</UnstyledButton>
        <Title order={1} fz={26} mt={6}>{t("聊天分析")}</Title>
        <Text size="sm" className="muted" mt={4}>{t("只用这台电脑上的聊天记录算出来，不经过 AI，也不打「好感度」之类的分。")}</Text>
      </div>
      <ChatStats personKey={key} />
      {!data ? <Skeleton h={300} radius="xl" /> : !r ? <Text className="faint">{t("聊天太少，算不出来")}</Text> : (
        <>
          <Block title={t("什么时候聊")} sub={t("聊过 {0} 天 · 最长连续 {1} 天都在聊 · 最长 {2} 天没聊", r.activeDays, r.longestStreak, r.longestGap)}>
            <Stack gap={3}>
              {r.heat.map((row, d) => (
                <Group key={d} gap={3} wrap="nowrap">
                  <Text size="10px" className="faint" w={14}>{DAYS[d]}</Text>
                  {row.map((n, h) => (
                    <Tooltip key={h} label={t("周{0} {1} 点：{2} 条", DAYS[d], h, n)} withArrow>
                      <div className="heat-cell" style={{ opacity: n ? 0.15 + 0.85 * (n / maxHeat) : 0.06 }} />
                    </Tooltip>
                  ))}
                </Group>
              ))}
              <Group gap={3} wrap="nowrap" ml={17}>{[0, 6, 12, 18, 23].map((h) => <Text key={h} size="10px" className="faint" style={{ position: "relative", left: `${(h / 24) * 100}%` }}>{h}</Text>)}</Group>
            </Stack>
          </Block>
          <Block title={t("聊什么")} sub={t("两个人用得最多的词")}>
            <Group gap={6}>
              {r.keywords.map((x) => <Text key={x.w} span fz={12 + Math.round(10 * (x.c / maxKw))} fw={x.c / maxKw > 0.5 ? 650 : 450} c={x.c / maxKw > 0.5 ? "radar" : undefined} className={x.c / maxKw > 0.5 ? undefined : "muted"}>{x.w}</Text>)}
            </Group>
          </Block>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Block title={t("{0} 的口头禅", name || t("对方"))} sub={t("平均每条 {0} 个字", r.avgLen.them)}><Chips list={r.catchphrases.them} color="violet" /></Block>
            <Block title={t("你的口头禅")} sub={t("平均每条 {0} 个字", r.avgLen.me)}><Chips list={r.catchphrases.me} color="radar" /></Block>
            <Block title={t("{0} 常用的表情", name || t("对方"))}><Group gap="sm">{r.emoji.them.map((x) => <Text key={x.w} fz={22}>{x.w}<Text span size="xs" className="faint"> {x.c}</Text></Text>)}{!r.emoji.them.length && <Text size="xs" className="faint">{t("很少用")}</Text>}</Group></Block>
            <Block title={t("你常用的表情")}><Group gap="sm">{r.emoji.me.map((x) => <Text key={x.w} fz={22}>{x.w}<Text span size="xs" className="faint"> {x.c}</Text></Text>)}{!r.emoji.me.length && <Text size="xs" className="faint">{t("很少用")}</Text>}</Group></Block>
          </SimpleGrid>
          <Block title={t("消息类型")}>
            <Stack gap={6}>
              {r.types.map(([kind, n]) => (
                <Group key={kind} gap="sm" wrap="nowrap">
                  <Text size="xs" w={64}>{t(kind)}</Text>
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
