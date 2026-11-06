const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
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
  const md = `${x.getMonth() + 1}月${x.getDate()}日`;
  let w: string;
  if (n === 0) w = "今天";
  else if (n === 1) w = "明天";
  else if (n === 2) w = "后天";
  else if (n === -1) w = "昨天";
  else if (n > 2 && n < 7) w = `${WD[x.getDay()]} · ${md}`;
  else if (n < -1 && n > -7) w = `${-n}天前`;
  else w = x.getFullYear() === new Date().getFullYear() ? md : `${x.getFullYear()}年${md}`;
  return time ? `${w} ${time}` : w;
}

export function sinceText(ts: string) {
  // ts "YYYY-MM-DD HH:mm[:ss]"
  const n = -dayDiff(ts.slice(0, 10));
  if (n <= 0) return `今天 ${ts.slice(11, 16)}`;
  if (n === 1) return `昨天 ${ts.slice(11, 16)}`;
  if (n < 7) return `${n}天前`;
  return ts.slice(5, 10).replace("-", "月") + "日";
}

export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
}
export const weekdayLine = () => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]}`; };
export const WEEKDAYS = WD;
export const initial = (n: string) => n.replace(/^演示·/, "").slice(0, 1);
