"use client";
import { Box, Skeleton, Text } from "@mantine/core";
import Link from "next/link";
import { useState } from "react";
import { CalendarView } from "@/components/CalendarView";
import { PersonBar, useCurrentPerson } from "@/components/PersonSwitcher";
import { usePageContext } from "@/components/Shell";
import { useApi } from "@/lib/client";
import { dayDiff, sinceText } from "@/lib/format";
import { CERTAINTY_LABEL, isKnowledge, STATUS_LABEL, type Item, type PersonProfile } from "@/lib/types";

// Layout follows the user's Apple-style prototype (docs/design/apple-design-system.html → 时间线):
// kicker + big title + lead, filter pills, one vertical rail with dots, date / title / text / tags per entry.

type Kind = "日程" | "事项" | "近况";
type Entry = { key: string; date: string; time?: string | null; type: Kind; title: string; text?: string | null; href?: string; dot: "accent" | "warn" | "meta"; tags: { label: string; tone?: "watch" | "neutral" | "danger" }[] };

const FILTERS: ("全部" | Kind)[] = ["全部", "日程", "事项", "近况"];
const PAGE = 40;

function typeOf(i: Item): Kind | null {
  if (i.subject === "self") return null;                 // things about you live on the person page, not here
  // only real events in their life; small details (有驾照) and preferences / needs live in the portrait
  if (isKnowledge(i)) return i.kind === "fact" && i.milestone === true ? "近况" : null;
  if ((i.kind === "plan" || i.kind === "change") && i.eventDate) return "日程";
  return "事项";
}

function toEntries(p: PersonProfile): Entry[] {
  const out: Entry[] = [];
  for (const i of p.items) {
    const type = typeOf(i);
    const date = i.eventDate ?? i.observedAt?.slice(0, 10);
    if (!type || !date || i.status === "superseded" || i.status === "ignored") continue;
    const future = dayDiff(date) > 0;
    const unsure = i.certainty === "uncertain" || i.certainty === "tentative";
    const tags: Entry["tags"] = [{ label: type }];
    if (i.certainty !== "confirmed") tags.push({ label: CERTAINTY_LABEL[i.certainty], tone: i.certainty === "cancelled" ? "neutral" : "watch" });
    if (i.status !== "open") tags.push({ label: STATUS_LABEL[i.status], tone: "neutral" });
    else if (i.category === "urgent" || i.category === "forgotten") tags.push({ label: i.category === "urgent" ? "需要行动" : "可能遗忘", tone: "danger" });
    out.push({
      key: `i${i.id}`, date, time: i.eventDate ? i.eventTime : null, type, title: i.title, text: i.summary, href: `/items/${i.id}`,
      dot: future ? "accent" : unsure || (i.status === "open" && (i.category === "urgent" || i.category === "forgotten")) ? "warn" : "meta", tags,
    });
  }
  if (p.chat?.lastAt) out.push({ key: "last", date: p.chat.lastAt.slice(0, 10), time: p.chat.lastAt.slice(11, 16), type: "近况", title: "最近一次联系", text: `${sinceText(p.chat.lastAt)}，这是目前记录里的最后一条消息。`, dot: "accent", tags: [{ label: "近况" }] });
  if (p.chat?.firstAt) out.push({ key: "first", date: p.chat.firstAt.slice(0, 10), type: "近况", title: "开始聊天", text: "从这一天开始有你们的聊天记录。", dot: "accent", tags: [{ label: "起点" }] });
  // newest first; things still ahead of you sit on top
  return out.sort((a, b) => (b.date + (b.time ?? "")).localeCompare(a.date + (a.time ?? "")));
}

export default function TimelinePage() {
  const who = useCurrentPerson();
  const person = who.person;
  usePageContext(person ? { page: "person", personKey: person.key, personName: person.name } : { page: "timeline" });
  const { data: p, loading } = useApi<PersonProfile>(person ? `/api/people/${encodeURIComponent(person.key)}` : null);
  const [view, setView] = useState<"cal" | "line">("cal");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("全部");
  const [shown, setShown] = useState(PAGE);
  const now = new Date();

  const all = p ? toEntries(p) : [];
  const details = (p?.items ?? []).filter((i) => i.kind === "fact" && i.subject !== "self" && i.milestone !== true && i.status !== "ignored").length;
  const list = all.filter((e) => filter === "全部" || e.type === filter);
  const count = (f: (typeof FILTERS)[number]) => (f === "全部" ? all.length : all.filter((e) => e.type === f).length);

  if (!who.loading && !person) return <Text className="faint" ta="center" py="xl">还没有联系人</Text>;
  const switcher = (
    <div className="view-switch" role="group" aria-label="切换视图">
      <button type="button" aria-pressed={view === "cal"} onClick={() => setView("cal")}>日历</button>
      <button type="button" aria-pressed={view === "line"} onClick={() => setView("line")}>时间线</button>
    </div>
  );
  // 日历: everyone's dated things by month, filtered by group. 时间线: one person's history, newest first.
  if (view === "cal") return (
    <div className="apl fade-in">
      <p className="apl-kicker">{now.getFullYear()}年{now.getMonth() + 1}月</p>
      <h1 className="apl-title">日历</h1>
      <p className="apl-lead">每个人接下来要你面对的事，按恋人、朋友、同事、客户这些分组看。点一天看当天的安排，虚线框的是还没定下来的。</p>
      {switcher}
      <CalendarView />
    </div>
  );
  return (
    <div className="apl fade-in">
      <p className="apl-kicker">{now.getFullYear()}年{now.getMonth() + 1}月</p>
      <h1 className="apl-title">时间线</h1>
      <p className="apl-lead">按时间回看你和{person?.name ?? "TA"}之间记下来的事，每条都能点开看原话。标「待判断」「待定」的还没确定。</p>
      {switcher}
      <Box mt={18}><PersonBar {...who} subtitle={p ? `${all.length} 个节点` : undefined} /></Box>

      <div className="apl-filters" role="group" aria-label="筛选时间线">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="apl-filter" aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }}>
            {f}<span className="apl-filter-n">{count(f)}</span>
          </button>
        ))}
      </div>

      {(loading || who.loading) && !p ? <Skeleton h={300} radius="lg" mt={26} /> : list.length === 0 ? (
        <p className="apl-empty">这个分类里还没有记录</p>
      ) : (
        <>
          <ol className="apl-tl">
            {list.slice(0, shown).map((e) => (
              <li key={e.key} className="apl-tl-item">
                <span className={`apl-dot is-${e.dot}`} aria-hidden="true" />
                <p className="apl-date">{e.date}{e.time ? ` ${e.time}` : ""}{dayDiff(e.date) === 0 ? " · 今天" : dayDiff(e.date) > 0 ? " · 接下来" : ""}</p>
                {e.href ? <Link href={e.href} className="apl-tl-title">{e.title}</Link> : <h2 className="apl-tl-title">{e.title}</h2>}
                {e.text && <p className="apl-text">{e.text}</p>}
                <div className="apl-tags">
                  {e.tags.map((t) => <span key={t.label} className={t.tone ? "apl-status" : "apl-tag"} data-tone={t.tone}>{t.label}</span>)}
                </div>
              </li>
            ))}
          </ol>
          {details > 0 && list.length <= shown && (filter === "全部" || filter === "近况") && (
            <p className="apl-empty" style={{ marginTop: 22 }}>另有 {details} 条关于{person?.name ?? "TA"}的小事（比如证件、习惯、日常状态）不进时间线，在人物页的「记忆」里。</p>
          )}
          {list.length > shown && (
            <button type="button" className="apl-more" onClick={() => setShown((n) => n + PAGE)}>显示更早的 {Math.min(PAGE, list.length - shown)} 条（还有 {list.length - shown} 条）</button>
          )}
        </>
      )}
    </div>
  );
}
