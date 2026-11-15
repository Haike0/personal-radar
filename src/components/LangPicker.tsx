"use client";
import { SegmentedControl, Select } from "@mantine/core";
import { IconLanguage } from "@tabler/icons-react";
import { lang, LANGS, setLang, type Lang } from "@/lib/i18n";

/** 简体中文 / 繁體中文 / 日本語 / English. Changing it reloads the page. */
export function LangPicker({ compact }: { compact?: boolean }) {
  const data = LANGS.map((l) => ({ value: l.id, label: l.label }));
  if (compact) return (
    <Select size="xs" radius="xl" w={128} data={data} value={lang()} allowDeselect={false} leftSection={<IconLanguage size={14} />}
      onChange={(v) => v && v !== lang() && setLang(v as Lang)} aria-label="Language" comboboxProps={{ withinPortal: true }} />
  );
  return <SegmentedControl fullWidth radius="md" data={data} value={lang()} onChange={(v) => v !== lang() && setLang(v as Lang)} />;
}
