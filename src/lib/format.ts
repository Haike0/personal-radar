import { locale, t, weekdays } from "@/lib/i18n";
const WD = weekdays("short"); // 周日… / 週日… / 日… / Sun…
const p = (n: number) => String(n).padStart(2, "0");
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export function dayDiff(date: string) {
  const t = new Date(todayISO() + "T00:00:00").getTime();
  return Math.round((new Date(date + "T00:00:00").getTime() - t) / 86400000);
}

/** “明天 15:00” / “周六 · 11月8日” / “3天前” / “11月20日” */
export function relDate(date: string | null, time?: string | null) {
  if (!date) return "";
  const n = dayDiff(date);
  const x = new Date(date + "T00:00:00");
  const md = t("{0}月{1}日", x.getMonth() + 1, x.getDate());
  let w: string;
  if (n === 0) w = t("今天");
  else if (n === 1) w = t("明天");
  else if (n === 2) w = t("后天");
  else if (n === -1) w = t("昨天");
  else if (n > 2 && n < 7) w = `${WD[x.getDay()]} · ${md}`;
  else if (n < -1 && n > -7) w = t("{0}天前", -n);
  else w = x.getFullYear() === new Date().getFullYear() ? md : t("{0}年{1}", x.getFullYear(), md);
  return time ? `${w} ${time}` : w;
}

export function sinceText(ts: string) {
  // ts "YYYY-MM-DD HH:mm[:ss]"
  const n = -dayDiff(ts.slice(0, 10));
  if (n <= 0) return t("今天 {0}", ts.slice(11, 16));
  if (n === 1) return t("昨天 {0}", ts.slice(11, 16));
  if (n < 7) return t("{0}天前", n);
  return ts.slice(5, 10).replace("-", "月") + t("日");
}

export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? t("夜深了") : h < 11 ? t("早上好") : h < 13 ? t("中午好") : h < 18 ? t("下午好") : t("晚上好");
}
export const weekdayLine = () => new Intl.DateTimeFormat(locale(), { month: "long", day: "numeric", weekday: "short" }).format(new Date());
export const WEEKDAYS = WD;
export const initial = (n: string) => n.replace(/^演示·/, "").slice(0, 1);
