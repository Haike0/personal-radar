"use client";
import { locale, t, weekdays } from "@/lib/i18n";
import { Skeleton, UnstyledButton } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/client";
import { CERTAINTY_LABEL, type Certainty } from "@/lib/types";

type Ev = { id: number; person: string; title: string; date: string; time: string | null; kind: string; certainty: Certainty; status: string; category: string };
type P = { key: string; name: string; tags: string[] };
const WD = weekdays("narrow");
const TONES = ["#ff6a3d", "#ff4f86", "#7c5cff", "#00a891", "#2f80ed", "#f2994a", "#9b51e0", "#27ae60", "#eb5757", "#56ccf2"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const GROUP_KEY = "radar.calendarGroup";
const ALL = "全部"; // id of the "everyone" filter, shown translated

/**
 * Month calendar across people, filtered by group (恋人 / 朋友 / 家人 / 同事 / 客户 …, from people's tags).
 * Tap a day to see what's on it below the grid.
 */
export function CalendarView() {
  const { data } = useApi<{ events: Ev[]; people: P[] }>("/api/calendar");
  const today = ymd(new Date());
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(today);
  const [group, setGroupState] = useState<string>(() => { try { return localStorage.getItem(GROUP_KEY) ?? ALL; } catch { return ALL; } });
  const setGroup = (g: string) => { setGroupState(g); try { localStorage.setItem(GROUP_KEY, g); } catch { /* private window */ } };

  const people = useMemo(() => new Map((data?.people ?? []).map((p, i) => [p.key, { ...p, tone: TONES[i % TONES.length] }])), [data]);
  const groups = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of data?.people ?? []) for (const t of p.tags) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.keys()];
  }, [data]);
  const g = group === ALL || groups.includes(group) ? group : ALL;
  const events = (data?.events ?? []).filter((e) => people.has(e.person) && (g === ALL || people.get(e.person)!.tags.includes(g)));
  const byDay = new Map<string, Ev[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  for (const l of byDay.values()) l.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  // 6 weeks starting on the Sunday on or before the 1st
  const start = new Date(month); start.setDate(1 - start.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const inMonth = events.filter((e) => e.date.slice(0, 7) === ymd(month).slice(0, 7));
  const busyPeople = new Set(inMonth.map((e) => e.person)).size;
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const picked = byDay.get(day) ?? [];

  if (!data) return <Skeleton h={420} radius="lg" mt={22} />;
  return (
    <div className="cal">
      <div className="apl-filters" role="group" aria-label={t("按分组看")}>
        {[ALL, ...groups].map((x) => (
          <button key={x} type="button" className="apl-filter" aria-pressed={g === x} onClick={() => setGroup(x)}>
            {x === ALL ? t("全部") : t(x)}<span className="apl-filter-n">{x === ALL ? people.size : [...people.values()].filter((p) => p.tags.includes(x)).length}</span>
          </button>
        ))}
      </div>

      <div className="cal-head">
        <UnstyledButton className="cal-nav" onClick={() => shift(-1)} aria-label={t("上个月")}><IconChevronLeft size={18} /></UnstyledButton>
        <div className="cal-month">{new Intl.DateTimeFormat(locale(), { year: "numeric", month: "long" }).format(month)}</div>
        <UnstyledButton className="cal-nav" onClick={() => shift(1)} aria-label={t("下个月")}><IconChevronRight size={18} /></UnstyledButton>
        <UnstyledButton className="cal-today" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setDay(today); }}>{t("今天")}</UnstyledButton>
        <span className="cal-sum">{t("{0} 件事 · {1} 个人", inMonth.length, busyPeople)}</span>
      </div>

      <div className="cal-grid" role="grid">
        {WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}
        {cells.map((d) => {
          const k = ymd(d), list = byDay.get(k) ?? [];
          const out = d.getMonth() !== month.getMonth();
          return (
            <button key={k} type="button" className="cal-cell" data-out={out || undefined} data-today={k === today || undefined} data-picked={k === day || undefined} onClick={() => setDay(k)}>
              <span className="cal-n">{d.getDate()}</span>
              {list.slice(0, 3).map((e) => {
                const p = people.get(e.person)!;
                return <span key={e.id} className="cal-chip" data-soft={e.certainty !== "confirmed" || undefined} style={{ "--tone": p.tone } as React.CSSProperties}>{p.name}</span>;
              })}
              {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
            </button>
          );
        })}
      </div>

      <div className="cal-day">
        <p className="apl-date">{new Intl.DateTimeFormat(locale(), { month: "long", day: "numeric", weekday: "short" }).format(new Date(day + "T00:00:00"))}{day === today ? t(" · 今天") : ""}</p>
        {picked.length ? picked.map((e) => {
          const p = people.get(e.person)!;
          return (
            <Link key={e.id} href={`/items/${e.id}`} className="cal-row">
              <span className="cal-dot" style={{ background: p.tone }} />
              <span className="cal-time">{e.time ?? t("全天")}</span>
              <span className="cal-title">{e.title}</span>
              <span className="cal-who">{p.name}{e.certainty !== "confirmed" ? ` · ${CERTAINTY_LABEL[e.certainty]}` : ""}</span>
            </Link>
          );
        }) : <p className="apl-empty">{t("这天没有安排")}</p>}
      </div>
    </div>
  );
}
