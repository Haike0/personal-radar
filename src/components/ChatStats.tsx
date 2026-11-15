"use client";
import { t } from "@/lib/i18n";
import { Group, Paper, SimpleGrid, Skeleton, Stack, Text, Tooltip } from "@mantine/core";
import { useApi } from "@/lib/client";

type Stats = {
  total: number; mine: number; theirs: number; days: number; replyRate: number | null; theirReplyMin: number | null; myReplyMin: number | null;
  openers: { me: number; them: number }; periods: { from: string; to: string; count: number }[]; peakHours: number[];
};

const dur = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}` : m < 1440 ? `${(m / 60).toFixed(m < 600 ? 1 : 0)}` : `${(m / 1440).toFixed(1)}`);
const unit = (m: number | null) => (m == null ? "" : m < 60 ? t("分钟") : m < 1440 ? t("小时") : t("天"));

function Tile({ label, value, unit: u, hint }: { label: string; value: string; unit?: string; hint: string }) {
  return (
    <Paper className="surface" radius="xl" p="md">
      <Text size="xs" className="muted">{label}</Text>
      <Group gap={4} align="baseline" mt={6} wrap="nowrap">
        <Text fz={28} fw={650} lh={1} className="tabular">{value}</Text>
        {u && <Text size="sm" c="radar" fw={600}>{u}</Text>}
      </Group>
      <Text size="xs" className="faint" mt={6}>{hint}</Text>
    </Paper>
  );
}

/** Numbers straight from the chat — available right after import, before any AI runs. */
export function ChatStats({ personKey }: { personKey: string; name?: string }) {
  const { data } = useApi<{ stats: Stats | null }>(`/api/people/${encodeURIComponent(personKey)}/stats`);
  if (!data) return <Skeleton h={220} radius="xl" />;
  const s = data.stats;
  if (!s) return null;
  const ratio = s.theirs ? s.mine / s.theirs : null;
  const max = Math.max(...s.periods.map((p) => p.count), 1);
  const opener = s.openers.me + s.openers.them ? Math.round((100 * s.openers.me) / (s.openers.me + s.openers.them)) : null;
  return (
    <Stack gap="sm">
      <SimpleGrid cols={2} spacing="sm">
        <Tile label={t("回复率")} value={s.replyRate == null ? "—" : `${Math.round(s.replyRate * 100)}`} unit={s.replyRate == null ? undefined : "%"} hint={t("你发完消息后，对方 24 小时内回了的比例")} />
        <Tile label={t("对方多久回")} value={dur(s.theirReplyMin)} unit={unit(s.theirReplyMin)} hint={t("你回对方约 {0} {1}", dur(s.myReplyMin), unit(s.myReplyMin))} />
        <Tile label={t("发送比例")} value={ratio == null ? "—" : ratio.toFixed(1)} unit=": 1" hint={ratio == null ? "" : ratio >= 1.15 ? t("你发得多一些") : ratio <= 0.87 ? t("对方发得多一些") : t("两边差不多")} />
        <Tile label={t("消息")} value={s.total.toLocaleString()} unit={t("条")} hint={t("{0} 天 · 你先开口占 {1}%", s.days, opener ?? "—")} />
      </SimpleGrid>
      <Paper className="surface" radius="xl" p="md">
        <Group justify="space-between" mb={4}>
          <Text size="sm" fw={600}>{t("聊天的频率")}</Text>
          <Text size="xs" className="faint">{t("最活跃 {0}", s.peakHours.map((h) => t("{0} 点", h)).join("、"))}</Text>
        </Group>
        <Text size="xs" className="faint" mb="sm">{t("从第一条到最近一条，分成 8 段，每段的消息数")}</Text>
        <Group gap={6} align="flex-end" wrap="nowrap" h={120}>
          {s.periods.map((p, i) => (
            <Tooltip key={i} label={t("{0} → {1}：{2} 条", p.from, p.to, p.count)} withArrow>
              <Stack gap={4} align="center" style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
                <Text size="xs" className={i === s.periods.length - 1 ? "tabular" : "faint tabular"} c={i === s.periods.length - 1 ? "radar" : undefined}>{p.count}</Text>
                <div className="freq-bar" data-last={i === s.periods.length - 1 || undefined} style={{ height: `${Math.max(4, (p.count / max) * 84)}px` }} />
              </Stack>
            </Tooltip>
          ))}
        </Group>
      </Paper>
    </Stack>
  );
}
