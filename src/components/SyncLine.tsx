"use client";
import { Group, Text } from "@mantine/core";
import Link from "next/link";
import type { SyncStatus } from "@/lib/sync";

export function SyncLine({ sync }: { sync: SyncStatus }) {
  const color = sync.ok ? "var(--mantine-color-radar-filled)" : sync.ok === false ? "var(--mantine-color-red-6)" : "var(--mantine-color-gray-5)";
  const text = sync.at
    ? `上次导入 ${sync.at.slice(5, 16).replace("T", " ")}${sync.ok ? `，新增 ${sync.newMessages ?? 0} 条` : `，失败：${sync.error ?? "未知"}`}`
    : "还没有导入记录";
  return (
    <Link href="/settings"><Group gap={8} justify="center" py="xs">
      <span style={{ width: 7, height: 7, borderRadius: 4, background: color }} />
      <Text size="xs" className="faint">{text}</Text>
    </Group></Link>
  );
}
