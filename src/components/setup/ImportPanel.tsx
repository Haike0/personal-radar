"use client";
import { Anchor, Badge, Button, Checkbox, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
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
const FORMAT: Record<string, string> = { line: "LINE", whatsapp: "WhatsApp", telegram: "Telegram", discord: "Discord", instagram: "Instagram / Messenger", chatlab: "通用格式", text: "文本记录", qq: "QQ", googlechat: "Google Chat" };

// Where the chat comes from → three short steps. Shown only for the app you pick.
export const SOURCES: { id: string; name: string; color: string; file: string; steps: string[]; note?: string; link?: { label: string; href: string } }[] = [
  { id: "wechat", name: "微信", color: "#07C160", file: "通用聊天格式 / Markdown / 文本", steps: ["微信官方不支持导出聊天记录", "怎么拿到聊天记录需要你自己解决，可以参考其他开源项目", "整理成通用聊天格式（JSON），或带时间和发送人的 Markdown / 文本，拖到上面"], note: "Radar 只读取你自己提供的文件，不提供、不内置任何读取微信数据的工具" },
  { id: "line", name: "LINE", color: "#06C755", file: ".txt", steps: ["打开要导入的聊天", "右上角 ≡ →「设置 / その他」", "「发送聊天记录 / トーク履歴を送信」→ 存成文件"], note: "用手机导出更完整，电脑版只存已加载的消息" },
  { id: "qq", name: "QQ", color: "#12B7F5", file: ".txt / .json / Markdown", steps: ["旧版 QQ：消息管理器 →「导出消息记录」存成 .txt", "新版 QQ 官方没有导出功能，需要你自己解决（可参考其他开源项目）", "拖到上面；通用聊天格式、常见的 QQ 导出 JSON、Markdown / 文本都能识别"] },
  { id: "whatsapp", name: "WhatsApp", color: "#25D366", file: ".zip 或 .txt", steps: ["打开聊天，点对方名字", "「导出聊天」", "选「不含媒体」，保存"], note: "iPhone 得到 .zip，不用解压" },
  { id: "telegram", name: "Telegram", color: "#2AABEE", file: "result.json", steps: ["在电脑上打开 Telegram Desktop", "聊天右上角 ⋮ →「导出聊天记录」", "格式选 JSON"] },
  { id: "instagram", name: "Instagram", color: "#E1306C", file: "message_1.json", steps: ["账户中心 →「下载你的信息」", "只选「消息」，格式选 JSON", "解压，找到 inbox/对方/message_1.json"], note: "Facebook Messenger 也是这样" },
  { id: "douyin", name: "抖音", color: "#111111", file: "通用聊天格式 / Markdown / 文本", steps: ["抖音官方不支持导出私信", "需要你自己解决（可参考其他开源项目），整理成通用聊天格式或 Markdown / 文本", "拖到上面，或在「聚合平台 → 其他导出工具」里连接"] },
  { id: "imessage", name: "iMessage", color: "#34C759", file: "—", steps: ["最省事：在「聚合平台」里连接 Beeper（官方提供的本地接口）", "或者自己导出成通用聊天格式 / Markdown / 文本", "拖到上面"], note: "只能在 Mac 上做" },
  { id: "discord", name: "Discord", color: "#5865F2", file: ".json", steps: ["Discord 官方的「数据下载」不含完整私信", "需要你自己导出（可参考其他开源项目），格式选 JSON", "拖到上面"] },
  { id: "googlechat", name: "Google Chat", color: "#1A73E8", file: "Takeout .zip", steps: ["打开 takeout.google.com", "只勾选「Google Chat」，导出", "下载后整个 .zip 拖进来"], note: "第一次导出可能要几个小时" },
];

function ExportSteps() {
  const [pick, setPick] = useState<string | null>(null);
  const src = SOURCES.find((x) => x.id === pick);
  return (
    <Stack gap="sm">
      <Text size="sm" fw={600}>选你的聊天软件，看怎么导出</Text>
      <SimpleGrid cols={{ base: 4, sm: 5 }} spacing="xs">
        {SOURCES.map((x) => (
          <UnstyledButton key={x.id} className="source-tile" data-active={pick === x.id || undefined} onClick={() => setPick(pick === x.id ? null : x.id)}>
            <span className="source-dot" style={{ background: x.color }}>{x.name.slice(0, x.name.charCodeAt(0) > 255 ? 1 : 1)}</span>
            <Text size="xs" fw={500} mt={6} ta="center" lh={1.2}>{x.name}</Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      {src && (
        <Paper className="hint-box fade-in" radius="lg" p="md">
          <Stack gap={10}>
            {src.steps.map((t, i) => (
              <Group key={i} gap="sm" wrap="nowrap">
                <span className="step-num">{i + 1}</span>
                <Text size="sm">{t}</Text>
              </Group>
            ))}
            <Group gap={6} mt={2}>
              <Badge variant="white" color="gray" radius="sm" tt="none">得到 {src.file}</Badge>
              {src.note && <Text size="xs" className="faint">{src.note}</Text>}
              {src.link && <Anchor href={src.link.href} target="_blank" size="xs">{src.link.label} ↗</Anchor>}
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

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
          <Text size="xs" className="faint">可以一次选多个 · 先预览，确认后才导入</Text>
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

      {!pv && <ExportSteps />}
    </Stack>
  );
}
