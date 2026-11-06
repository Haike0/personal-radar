"use client";
import { Accordion, Badge, Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileImport, IconUpload } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { post, refreshAll } from "@/lib/client";

type Person = { id: string; name: string; messages: number };
type Plan =
  | { ok: true; id: string; name: string; me: string; meName: string; isGroup: boolean; platform: string; people: Person[]; total: number; existing: number; fresh: number; first: number; last: number }
  | { ok: false; error: string; needMe?: boolean; people?: Person[]; isGroup?: boolean };
type Row = { key: string; file: string; format: string; name: string | null; plan: Plan };
type Preview = { token: string; chats: Row[]; errors: { file: string; error: string }[] };
type Choice = { include: boolean; me?: string; name?: string };

const day = (s: number) => new Date(s * 1000).toLocaleDateString("sv-SE");
const FORMAT: Record<string, string> = { line: "LINE", whatsapp: "WhatsApp", telegram: "Telegram", discord: "Discord", instagram: "Instagram / Messenger", chatlab: "ChatLab" };

export const EXPORT_GUIDE: { label: string; steps: string }[] = [
  { label: "LINE", steps: "打开聊天 → 右上角「≡」→「设置 / その他」→「发送聊天记录 / トーク履歴を送信」，存成 .txt。电脑版只会存屏幕上已经加载的消息。" },
  { label: "WhatsApp", steps: "打开聊天 → 点对方名字（Android 是右上角 ⋮ → 更多）→「导出聊天」→「不含媒体」。iPhone 会得到一个 .zip，直接拖进来就行。" },
  { label: "Telegram", steps: "用 Telegram Desktop：打开聊天 → 右上角 ⋮ →「导出聊天记录」，格式选 JSON，得到 result.json。也可以在「设置 → 高级 → 导出数据」导出全部聊天。" },
  { label: "Discord", steps: "用开源工具 DiscordChatExporter 导出，格式选 JSON。它是第三方工具，使用前请自己确认安全性。" },
  { label: "Instagram / Messenger", steps: "在 Meta 账户中心「下载你的信息」，选「消息」、格式 JSON。每个聊天在 messages/inbox/对方名字/message_1.json；分成多个文件时一起拖进来。" },
  { label: "微信、QQ、iMessage 等", steps: "Radar 不提供解密或抓取工具。如果你在用 ChatLab，可以在下面「从 ChatLab 读取」里连接它，直接用 ChatLab 里已经导入的聊天；或者把 ChatLab 导出的 JSON / JSONL 拖进来。" },
];

/** Drag exports in → see what each one contains → pick who you are → import. Nothing is written before the last click. */
export function ImportPanel({ onImported }: { onImported?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [choice, setChoice] = useState<Record<string, Choice>>({});

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    setBusy("preview");
    try {
      const fd = new FormData();
      for (const f of list) fd.append("file", f);
      const r = await fetch("/api/import/preview", { method: "POST", body: fd });
      const j = (await r.json()) as Preview & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setPv(j);
      setChoice(Object.fromEntries(j.chats.map((c) => [c.key, { include: c.plan.ok && c.plan.fresh > 0 }])));
    } catch (e) {
      notifications.show({ color: "red", radius: "lg", message: (e as Error).message });
    } finally { setBusy(null); }
  }
  async function setMe(row: Row, me: string | null) {
    if (!pv || !me) return;
    const r = await post<{ plan: Plan }>("/api/import/preview", { token: pv.token, key: row.key, me });
    setPv({ ...pv, chats: pv.chats.map((c) => (c.key === row.key ? { ...c, plan: r.plan } : c)) });
    setChoice((x) => ({ ...x, [row.key]: { ...x[row.key], me, include: r.plan.ok } }));
  }
  async function commit() {
    if (!pv) return;
    const picks = pv.chats.filter((c) => choice[c.key]?.include).map((c) => ({ key: c.key, me: choice[c.key].me, name: choice[c.key].name }));
    setBusy("commit");
    try {
      const r = await post<{ done: { name: string; added: number }[]; failed: { error: string }[] }>("/api/import/commit", { token: pv.token, choices: picks });
      refreshAll();
      notifications.show({ radius: "lg", color: r.failed.length ? "orange" : undefined,
        message: `导入了 ${r.done.length} 个聊天，共新增 ${r.done.reduce((a, d) => a + d.added, 0)} 条消息${r.failed.length ? `；${r.failed.length} 个失败：${r.failed[0].error}` : ""}` });
      if (r.done.length) { setPv(null); onImported?.(); }
    } catch (e) {
      notifications.show({ color: "red", radius: "lg", message: (e as Error).message });
    } finally { setBusy(null); }
  }
  const picked = pv?.chats.filter((c) => choice[c.key]?.include).length ?? 0;

  return (
    <Stack gap="sm">
      <Paper
        className="drop-zone" data-active={drag || undefined} radius="lg" p="lg" withBorder
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} style={{ cursor: "pointer", textAlign: "center", borderStyle: "dashed" }}>
        <input ref={input} type="file" multiple hidden accept=".txt,.json,.jsonl,.zip" onChange={(e) => e.currentTarget.files && upload(e.currentTarget.files)} />
        <Stack gap={6} align="center">
          <IconUpload size={22} />
          <Text size="sm" fw={600}>{busy === "preview" ? "读取中…" : "把导出的聊天文件拖到这里，或点一下选择"}</Text>
          <Text size="xs" className="faint">LINE / WhatsApp（.txt 或 .zip）· Telegram · Discord · Instagram · ChatLab JSON / JSONL。可以一次选多个。</Text>
          <Text size="xs" className="faint">先预览，确认后才写入；文件只在这台电脑上读取。</Text>
        </Stack>
      </Paper>

      {pv && (
        <Stack gap="xs">
          {pv.errors.map((e) => <Text key={e.file} size="xs" c="red">{e.file}：{e.error}</Text>)}
          {pv.chats.map((c) => {
            const pl = c.plan, ch = choice[c.key] ?? { include: false };
            const people = pl.people ?? [];
            return (
              <Paper key={c.key} className="surface" radius="lg" p="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Checkbox checked={ch.include} disabled={!pl.ok} onChange={(e) => { const include = e.currentTarget.checked; setChoice((x) => ({ ...x, [c.key]: { ...ch, include } })); }}
                    label={<Text size="sm" fw={600}>{pl.ok ? pl.name : c.name ?? c.file}</Text>} />
                  <Badge variant="light" style={{ flex: "none" }}>{FORMAT[c.format] ?? c.format}{pl.ok && pl.isGroup ? " · 群聊" : ""}</Badge>
                </Group>
                <Stack gap={6} mt={6} pl={30}>
                  {pl.ok ? (
                    <Text size="xs" className="muted">{pl.total.toLocaleString()} 条 · {day(pl.first)} → {day(pl.last)} · {pl.existing ? `其中 ${pl.fresh.toLocaleString()} 条是新的` : "全部是新的"}{pl.isGroup ? " · 群聊只导入查看，不会被 AI 整理" : ""}</Text>
                  ) : <Text size="xs" c={pl.needMe ? "orange" : "red"}>{pl.error}</Text>}
                  {people.length > 0 && (
                    <Group gap="xs" wrap="nowrap">
                      <Select size="xs" radius="md" label="哪个是你" w={200} allowDeselect={false}
                        data={people.slice(0, 50).map((x) => ({ value: x.id, label: `${x.name}（${x.messages} 条）` }))}
                        value={pl.ok ? pl.me : ch.me ?? null} onChange={(v) => setMe(c, v)} />
                      {pl.ok && <TextInput size="xs" radius="md" label="显示名" w={160} defaultValue={pl.name} onChange={(e) => { const name = e.currentTarget.value; setChoice((x) => ({ ...x, [c.key]: { ...x[c.key], name } })); }} />}
                    </Group>
                  )}
                </Stack>
              </Paper>
            );
          })}
          <Group gap="xs">
            <Button radius="md" leftSection={<IconFileImport size={16} />} disabled={!picked} loading={busy === "commit"} onClick={commit}>导入 {picked} 个聊天</Button>
            <Button radius="md" variant="subtle" color="gray" onClick={() => setPv(null)}>取消</Button>
          </Group>
        </Stack>
      )}

      <Accordion variant="contained" radius="lg" chevronPosition="right">
        <Accordion.Item value="guide">
          <Accordion.Control><Text size="sm">怎么从各个 App 导出聊天</Text></Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              {EXPORT_GUIDE.map((g) => (
                <div key={g.label}><Text size="xs" fw={600}>{g.label}</Text><Text size="xs" className="muted" lh={1.6}>{g.steps}</Text></div>
              ))}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
