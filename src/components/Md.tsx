"use client";
import { Text, Title } from "@mantine/core";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// Minimal, safe Markdown for AI answers: headings, bullet/numbered lists, **bold**, `code`,
// and record citations "#123" / "[#123]" rendered as links to the record. No raw HTML is ever injected.
function inline(s: string, key: string, onCite?: () => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[?#(\d{1,6})\]?/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] != null) out.push(<strong key={`${key}b${n++}`}>{m[1]}</strong>);
    else if (m[2] != null) out.push(<code key={`${key}c${n++}`} className="md-code">{m[2]}</code>);
    else out.push(<Link key={`${key}r${n++}`} href={`/items/${m[3]}`} onClick={onCite} className="cite-chip">#{m[3]}</Link>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function Md({ text, onCite }: { text: string; onCite?: () => void }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    const k = `l${blocks.length}`;
    blocks.push(<L key={k} className="md-list" {...(list.ordered && list.start !== 1 ? { start: list.start } : {})}>{list.items.map((t, i) => <li key={i}>{inline(t, `${k}-${i}`, onCite)}</li>)}</L>);
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/), num = line.match(/^\s*(\d+)[.、)]\s+(.*)$/), head = line.match(/^(#{1,4})\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, start: num ? Number(num[1]) : 1, items: [] };
      list.items.push(bullet ? bullet[1] : num![2]);
      return;
    }
    if (!line.trim()) return; // a blank line inside a list keeps the list (and its numbering) going
    flush();
    if (/^-{3,}$/.test(line.trim())) { blocks.push(<hr key={`h${i}`} className="md-hr" />); return; }
    if (head) { blocks.push(<Title key={`t${i}`} order={6} fz="sm" fw={650} mt={4}>{inline(head[2], `t${i}`, onCite)}</Title>); return; }
    blocks.push(<Text key={`p${i}`} size="sm" style={{ lineHeight: 1.75 }}>{inline(line, `p${i}`, onCite)}</Text>);
  });
  flush();
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
