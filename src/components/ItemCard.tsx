"use client";
import { ActionIcon, Badge, Box, Button, Group, Menu, Paper, Text, ThemeIcon } from "@mantine/core";
import { useCompanion } from "@/components/Shell";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle, IconArrowRight, IconBan, IconBriefcase, IconCalendarTime, IconCheck, IconClockPause, IconDots, IconEyeOff,
  IconHeart, IconHeartHandshake, IconMessageQuestion, IconRefresh, IconSparkles, IconStar, IconUserHeart, IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { post, refreshAll } from "@/lib/client";
import { relDate } from "@/lib/format";
import { CERTAINTY_LABEL, STATUS_LABEL, unreviewed, type Category, type Item, type Kind } from "@/lib/types";

export const CAT_COLOR: Record<Category, string> = { urgent: "red", later: "blue", potential: "violet", forgotten: "orange" };
const KIND_ICON: Record<Kind, typeof IconHeart> = {
  plan: IconCalendarTime, promise: IconHeartHandshake, need: IconUserHeart, pending: IconMessageQuestion,
  preference: IconStar, concern: IconHeart, change: IconRefresh, fact: IconBriefcase,
};
const CERT_COLOR = { confirmed: "teal", tentative: "yellow", changed: "orange", cancelled: "gray", uncertain: "violet" } as const;

export async function act(id: number, action: string, extra: Record<string, unknown> = {}, label?: string) {
  try {
    const r = await post<{ historyId: number }>(`/api/items/${id}/action`, { action, ...extra });
    refreshAll();
    const nid = `act-${r.historyId}`;
    notifications.show({
      id: nid, autoClose: 7000, withCloseButton: false, radius: "lg",
      message: (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">{label ?? "已更新"}</Text>
          <Button size="compact-sm" variant="subtle" onClick={async () => {
            await post(`/api/history/${r.historyId}/undo`, {});
            notifications.hide(nid);
            refreshAll();
          }}>撤销</Button>
        </Group>
      ),
    });
  } catch (e) {
    notifications.show({ color: "red", message: `操作失败：${(e as Error).message}` });
  }
}

export function QuickMenu({ item }: { item: Item }) {
  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <Menu position="bottom-end" withinPortal shadow="md" radius="lg" width={180}>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" className="hit-pad" onClick={stop} onPointerDown={(e) => e.stopPropagation()} aria-label="快捷操作"><IconDots size={18} /></ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={stop}>
        {item.status === "open" ? (
          <>
            <Menu.Item leftSection={<IconCheck size={16} />} onClick={() => act(item.id, "followed", {}, "已标记为已关心，不再提醒")}>已关心</Menu.Item>
            <Menu.Item leftSection={<IconClockPause size={16} />} onClick={() => act(item.id, "snooze", { days: 1 }, "明天再提醒")}>明天再说</Menu.Item>
            <Menu.Item leftSection={<IconClockPause size={16} />} onClick={() => act(item.id, "snooze", { days: 3 }, "3 天后再提醒")}>延后 3 天</Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<IconEyeOff size={16} />} onClick={() => act(item.id, "ignore", {}, "已忽略")}>忽略</Menu.Item>
            <Menu.Item leftSection={<IconBan size={16} />} onClick={() => act(item.id, "cancel", {}, "已标记为取消")}>这件事取消了</Menu.Item>
          </>
        ) : (
          <Menu.Item leftSection={<IconRefresh size={16} />} onClick={() => act(item.id, "reopen", {}, "已重新打开")}>重新打开</Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/** 对 / 不对 — one tap to check what the AI organized. Both are undoable from the toast. */
export function ReviewButtons({ item, size = "compact-sm" }: { item: Item; size?: "compact-xs" | "compact-sm" }) {
  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <Group gap={6} wrap="nowrap" onClick={stop}>
      <Button size={size} radius="xl" variant="light" color="teal" leftSection={<IconCheck size={14} />} onClick={(e) => { stop(e); act(item.id, "accept", {}, "已确认，记为识别正确"); }}>对</Button>
      <Button size={size} radius="xl" variant="light" color="gray" leftSection={<IconX size={14} />} onClick={(e) => { stop(e); act(item.id, "reject", {}, "已记为识别错误，不再显示"); }}>不对</Button>
    </Group>
  );
}

/** The three things you'd do with a focus item, right on the card. */
function CardActions({ item }: { item: Item }) {
  const { openCompanion } = useCompanion();
  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <Group gap={6} mt={10} wrap="wrap" onClick={stop}>
      <Button size="compact-sm" radius="xl" variant="light" leftSection={<IconCheck size={14} />} onClick={(e) => { stop(e); act(item.id, "done", {}, "已完成"); }}>完成了</Button>
      <Button size="compact-sm" radius="xl" variant="default" leftSection={<IconClockPause size={14} />} onClick={(e) => { stop(e); act(item.id, "snooze", { days: 1 }, "明天再提醒"); }}>明天再提醒</Button>
      <Button size="compact-sm" radius="xl" variant="light" color="violet" leftSection={<IconSparkles size={14} />}
        onClick={(e) => { stop(e); openCompanion("分析这件事：现在是什么情况，我接下来该做什么？", { page: "item", itemId: item.id, title: item.title, personName: item.personName, personKey: item.personKey }); }}>问 AI</Button>
    </Group>
  );
}

export function ItemCard({ item, focus, actions }: { item: Item; focus?: boolean; actions?: boolean }) {
  const Icon = KIND_ICON[item.kind] ?? IconAlertTriangle;
  const closed = item.status !== "open";
  const color = CAT_COLOR[item.category];
  return (
    <Paper component={Link} href={`/items/${item.id}`} className="surface pressable" p={focus ? "md" : 14} radius="xl"
      style={{ display: "block", opacity: closed ? 0.62 : 1 }}>
      <Group align="flex-start" wrap="nowrap" gap="sm">
        <ThemeIcon size={focus ? 40 : 36} radius="md" variant="light" color={color}><Icon size={focus ? 21 : 19} stroke={1.7} /></ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
            <Text fw={600} size={focus ? "md" : "sm"} lh={1.4} style={{ textDecoration: item.status === "cancelled" ? "line-through" : undefined }}>
              {item.title}
            </Text>
            <QuickMenu item={item} />
          </Group>
          <Group gap={8} mt={2} wrap="wrap">
            {item.eventDate && <Text size="xs" fw={item.category === "urgent" ? 600 : 400} c={item.category === "urgent" ? "red.5" : undefined} className={item.category === "urgent" ? "tabular" : "muted tabular"}>
              {relDate(item.eventDate, item.eventTime)}</Text>}
            {!item.eventDate && item.observedAt && <Text size="xs" className="faint tabular">{relDate(item.observedAt.slice(0, 10))}提到</Text>}
            {unreviewed(item) && <Badge size="xs" color="violet" variant="dot">AI 整理·待你核对</Badge>}
            {item.certainty !== "confirmed" && <Badge size="xs" color={CERT_COLOR[item.certainty]}>{CERTAINTY_LABEL[item.certainty]}</Badge>}
            {closed && <Badge size="xs" color="gray">{STATUS_LABEL[item.status]}{item.status === "snoozed" && item.snoozeUntil ? ` · ${relDate(item.snoozeUntil)}` : ""}</Badge>}
          </Group>
          {item.nextStep && !closed && (
            <Group gap={6} mt={8} wrap="nowrap" align="flex-start">
              <IconArrowRight size={14} style={{ marginTop: 3, flex: "none" }} color="var(--mantine-color-radar-filled)" />
              <Text size="sm" className="muted" lh={1.5}>{item.nextStep}</Text>
            </Group>
          )}
          {actions && !closed && <CardActions item={item} />}
        </Box>
      </Group>
    </Paper>
  );
}
