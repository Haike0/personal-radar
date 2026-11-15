"use client";
import { t } from "@/lib/i18n";
import { Group, Text } from "@mantine/core";
import Link from "next/link";
import type { SyncStatus } from "@/lib/sync";

export function SyncLine({ sync }: { sync: SyncStatus }) {
  const color = sync.ok ? "var(--mantine-color-radar-filled)" : sync.ok === false ? "var(--mantine-color-red-6)" : "var(--mantine-color-gray-5)";
  const text = sync.at
    ? t("上次导入 {0}{1}", sync.at.slice(5, 16).replace("T", " "), sync.ok ? t("，新增 {0} 条", sync.newMessages ?? 0) : t("，失败：{0}", sync.error ?? t("未知")))
    : t("还没有导入记录");
  return (
    <Link href="/settings"><Group gap={8} justify="center" py="xs">
      <span style={{ width: 7, height: 7, borderRadius: 4, background: color }} />
      <Text size="xs" className="faint">{text}</Text>
    </Group></Link>
  );
}
