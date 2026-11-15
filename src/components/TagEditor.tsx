"use client";
import { t } from "@/lib/i18n";
import { Badge, Button, Group, Popover, Stack, TagsInput, Text, UnstyledButton } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { post, refreshAll } from "@/lib/client";

export const TAG_SUGGESTIONS = [t("恋人"), t("家人"), t("朋友"), t("同学"), t("老师"), t("同事"), t("上司"), t("客户"), t("客人")];
const TAG_COLOR: Record<string, string> = { 恋人: "pink", 家人: "orange", 朋友: "teal", 同学: "blue", 老师: "indigo", 同事: "cyan", 上司: "grape", 客户: "yellow", 客人: "violet" };
export const tagColor = (t: string) => TAG_COLOR[t] ?? "gray";

/** The person's tags, with a small editor (pick from common ones or type your own). */
export function TagEditor({ personKey, tags }: { personKey: string; tags: string[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags);
  async function save() {
    await post(`/api/people/${encodeURIComponent(personKey)}/tags`, { tags: draft });
    setOpen(false); refreshAll();
  }
  return (
    <Group gap={6} justify="center">
      {tags.map((t) => <Badge key={t} variant="light" color={tagColor(t)} radius="sm" tt="none">{t}</Badge>)}
      <Popover opened={open} onChange={setOpen} position="bottom" radius="lg" shadow="md" withinPortal>
        <Popover.Target>
          <UnstyledButton className="tag-add" onClick={() => { setDraft(tags); setOpen((o) => !o); }}><IconPlus size={12} />{tags.length ? "" : t("标签")}</UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown maw={300}>
          <Stack gap="xs">
            <TagsInput size="sm" radius="md" value={draft} onChange={setDraft} placeholder={t("输入后回车")} maxTags={8} />
            <Group gap={6}>
              {TAG_SUGGESTIONS.filter((t) => !draft.includes(t)).map((t) => (
                <Badge key={t} variant="outline" color={tagColor(t)} radius="sm" tt="none" style={{ cursor: "pointer" }} onClick={() => setDraft([...draft, t])}>+ {t}</Badge>
              ))}
            </Group>
            <Text size="xs" className="faint">{t("只用来分组和筛选，不会发给 AI")}</Text>
            <Button size="xs" radius="md" onClick={save}>{t("保存")}</Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
