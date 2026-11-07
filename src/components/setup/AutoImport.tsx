"use client";
import { Badge, Button, Group, SegmentedControl, Stack, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { post, refreshAll, useApi } from "@/lib/client";

type St = { watch: { on: boolean; dir: string; exists: boolean; last: string | null; recent: { file: string; at: string; result: string; ok: boolean }[] }; hubs: { every: number; last: string | null } };
const oops = (e: unknown) => notifications.show({ color: "red", radius: "lg", message: (e as Error).message });

/** A folder Radar keeps an eye on: point an exporter at it once, and new exports come in by themselves. */
export function WatchFolder() {
  const { data, reload } = useApi<St>("/api/auto-import");
  const [dir, setDir] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Text size="xs" className="faint">读取中…</Text>;
  const w = data.watch;
  const value = dir ?? w.dir;
  const set = (b: Record<string, unknown>) => post("/api/auto-import", b).then(reload).catch(oops);
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text size="sm" fw={600}>自动导入文件夹</Text>
          <Text size="xs" className="faint">把导出工具的保存位置设成这里，新文件每 5 分钟自动导入一次</Text>
        </div>
        <Switch checked={w.on} onChange={(e) => set({ watch_on: e.currentTarget.checked })} />
      </Group>
      <Group gap="xs" align="flex-end" wrap="nowrap">
        <TextInput size="xs" radius="md" style={{ flex: 1 }} value={value} onChange={(e) => setDir(e.currentTarget.value)} onBlur={() => dir != null && set({ watch_dir: dir })} />
        {!w.exists && <Button size="xs" radius="md" variant="light" onClick={() => set({ action: "mkdir" })}>创建</Button>}
        <Button size="xs" radius="md" variant="subtle" loading={busy} disabled={!w.exists} onClick={async () => {
          setBusy(true);
          try { const r = await post<{ scanned: number; imported: number }>("/api/auto-import", { action: "scan" }); notifications.show({ radius: "lg", message: `看了 ${r.scanned} 个新文件，导入了 ${r.imported} 个聊天` }); reload(); refreshAll(); }
          catch (e) { oops(e); } finally { setBusy(false); }
        }}>现在看一下</Button>
      </Group>
      {w.recent.length > 0 && (
        <Stack gap={4}>
          {w.recent.slice(0, 4).map((r) => (
            <Group key={r.file + r.at} gap={6} wrap="nowrap">
              <Badge size="xs" variant="light" color={r.ok ? "teal" : "orange"} style={{ flex: "none" }}>{r.ok ? "已导入" : "需处理"}</Badge>
              <Text size="xs" className="faint" truncate>{r.file.split("/").pop()} · {r.result}</Text>
            </Group>
          ))}
        </Stack>
      )}
      <Text size="xs" className="faint" lh={1.6}>适合能定时导出的工具（QQ Chat Exporter、WeFlow），也可以把手机导出的文件存到这个文件夹（比如用 iCloud 云盘同步过来）。原文件不会被移动或修改。分不出「谁是你」的文件会标「需处理」，到上面拖进来选一下就行。</Text>
    </Stack>
  );
}

/** How often connected platforms are pulled. */
export function HubSync() {
  const { data, reload } = useApi<St>("/api/auto-import");
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const set = (b: Record<string, unknown>) => post("/api/auto-import", b).then(reload).catch(oops);
  return (
    <Stack gap="sm">
      <div>
        <Text size="sm" fw={600}>自动同步</Text>
        <Text size="xs" className="faint">已连接的平台多久拉一次新消息{data.hubs.last ? ` · 上次 ${data.hubs.last.slice(5, 16)}` : ""}</Text>
      </div>
      <SegmentedControl size="xs" radius="xl" value={String(data.hubs.every)} onChange={(v) => set({ hub_sync: Number(v) })}
        data={[{ value: "0", label: "不自动" }, { value: "1", label: "每小时" }, { value: "6", label: "每 6 小时" }, { value: "24", label: "每天" }]} />
      <Button size="xs" radius="md" variant="subtle" w="fit-content" loading={busy} onClick={async () => {
        setBusy(true); try { await post("/api/auto-import", { action: "sync" }); notifications.show({ radius: "lg", message: "同步完了" }); reload(); refreshAll(); } catch (e) { oops(e); } finally { setBusy(false); }
      }}>现在同步一次</Button>
    </Stack>
  );
}
