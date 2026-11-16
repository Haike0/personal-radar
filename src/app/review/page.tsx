"use client";
import { t } from "@/lib/i18n";
import { Badge, Box, Button, Group, Paper, Progress, SegmentedControl, Skeleton, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconChecks } from "@tabler/icons-react";
import Link from "next/link";
import { useBack } from "@/lib/nav";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ReviewButtons } from "@/components/ItemCard";
import { usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";
import { useListMotion } from "@/lib/motion";
import { relDate } from "@/lib/format";
import { isKnowledge, KIND_LABEL, unreviewed, type Item } from "@/lib/types";

const line = { borderTop: "1px solid light-dark(rgba(20,24,39,.07), rgba(255,255,255,.06))" };
// a stable "random" order so the spot-check sample doesn't reshuffle after every tap
const hash = (n: number) => ((n * 2654435761) >>> 0) % 1000;

function Rows({ list }: { list: Item[] }) {
  const motion = useListMotion();
  return (
    <Paper className="surface" radius="xl" style={{ overflow: "hidden" }} ref={motion}>
      {list.map((i, idx) => (
        <Box key={i.id} px="md" py={12} style={idx ? line : undefined}>
          <Group gap={6} mb={4}>
            <Badge size="xs" color="gray">{KIND_LABEL[i.kind]}</Badge>
            <Text size="xs" className="faint">{i.personName} · {i.eventDate ? relDate(i.eventDate, i.eventTime) : i.observedAt ? t("{0}提到", relDate(i.observedAt.slice(0, 10))) : ""}</Text>
          </Group>
          <Text component={Link} href={`/items/${i.id}`} size="sm" fw={550} lh={1.45} display="block">{i.title}</Text>
          {i.summary && <Text size="xs" className="muted" lh={1.55} mt={2} lineClamp={2}>{i.summary}</Text>}
          <Group justify="space-between" mt={8} wrap="nowrap">
            <Text component={Link} href={`/items/${i.id}`} size="xs" c="radar">{t("看原话 ›")}</Text>
            <ReviewButtons item={i} />
          </Group>
        </Box>
      ))}
    </Paper>
  );
}

function Review() {
  const back = useBack("/");
  const person = useSearchParams().get("person");
  usePageContext({ page: "home" });
  const { data, loading } = useApi<{ items: Item[] }>(`/api/items${person ? `?person=${encodeURIComponent(person)}` : ""}`);
  const [tab, setTab] = useState("action");
  const all = useMemo(() => (data?.items ?? []).filter((i) => i.origin === "ai"), [data]);
  const action = all.filter((i) => !isKnowledge(i) && i.status === "open" && unreviewed(i))
    .sort((a, b) => (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999"));
  const knowledge = all.filter((i) => isKnowledge(i) && unreviewed(i));
  const sample = [...knowledge].sort((a, b) => hash(a.id) - hash(b.id)).slice(0, 10);
  const checked = all.filter((i) => i.review === "accepted").length;
  const name = data?.items[0]?.personName;

  return (
    <Stack gap="lg" className="fade-in">
      <Button onClick={back} variant="subtle" color="gray" leftSection={<IconArrowLeft size={18} />} px={6} w="fit-content">{t("今天")}</Button>
      <div>
        <Title order={1} fz={26}>{t("核对 AI 整理的记录{0}", person && name ? ` · ${name}` : "")}</Title>
        <Text size="sm" className="muted" mt={4} lh={1.6}>
          {" "}{t("先核对「行动类」：它们会出现在今天页、也可能触发提醒。「关于 TA 的信息」不用一条条看，每次抽 10 条检查，错得多再说。 点「对」记为识别正确；点「不对」这条就不再显示。都可以撤销。")}{" "}
        </Text>
      </div>
      {loading && !data ? <Skeleton h={240} radius="xl" /> : (
        <>
          <Paper className="surface" radius="xl" p="md">
            <Group justify="space-between" mb={6}><Text size="sm">{t("行动类还剩 {0} 条", action.length)}</Text><Text size="xs" className="faint">{t("你已确认 {0} 条", checked)}</Text></Group>
            <Progress value={all.length ? (100 * (all.length - action.length - knowledge.length)) / all.length : 100} color="violet" radius="xl" />
            <Text size="xs" className="faint" mt={6}>{t("AI 一共整理了 {0} 条，其中 {1} 条「关于 TA 的信息」还没看过", all.length, knowledge.length)}</Text>
          </Paper>
          <SegmentedControl value={tab} onChange={setTab} radius="xl" fullWidth
            data={[{ value: "action", label: t("行动类 {0}", action.length) }, { value: "sample", label: t("抽查信息 {0}", sample.length) }]} />
          {tab === "action" && (action.length ? <Rows list={action} /> : (
            <Paper className="surface" radius="xl" p="xl" ta="center"><IconChecks size={28} color="var(--mantine-color-teal-5)" /><Text mt="xs">{t("行动类都核对完了")}</Text></Paper>
          ))}
          {tab === "sample" && (sample.length ? <Rows list={sample} /> : <Text className="faint" ta="center" py="xl">{t("没有待看的信息")}</Text>)}
        </>
      )}
    </Stack>
  );
}

export default function ReviewPage() {
  return <Suspense fallback={<Skeleton h={240} radius="xl" />}><Review /></Suspense>;
}
