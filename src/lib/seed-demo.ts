import type { DatabaseSync } from "node:sqlite";
import { clearNightChats, nightAvailable, seedNight } from "./seed-night";

// Clearly-labelled demo data (mode='demo'). Names are fictional; never real chat content.
export type Ev = [string, string, string, boolean?]; // [relative-day-offset:HH:mm, sender, text, isKey]
export type Seed = {
  key: string; person: string; group?: boolean; title: string; summary: string; why: string; next: string;
  category: string; certainty: string; kind: string; day?: number; time?: string; ev: Ev[]; supersedes?: string; status?: string;
  facet?: string; milestone?: boolean;
};

export type DemoSet = "life" | "night" | "love";

const LIFE_SEEDS: Seed[] = [
  {
    key: "d1", person: "演示·小林", title: "她明天下午有一场面试", summary: "新公司二面，下午 3 点，线上进行。",
    why: "明确的日期，就在明天", next: "今晚可以问问她准备得怎么样，别聊太晚",
    category: "urgent", certainty: "confirmed", kind: "plan", day: 1, time: "15:00",
    ev: [["-2 21:02", "演示·小林", "面试时间定了", false], ["-2 21:03", "演示·小林", "后天下午三点 线上二面", true], ["-2 21:03", "我", "好 那天我提醒你", true], ["-2 21:04", "演示·小林", "有点紧张哈哈", false]],
  },
  {
    key: "d2", person: "演示·小林", title: "你答应帮她改简历，还没改", summary: "她周一发来简历，你说周末前帮她改一版。",
    why: "你主动答应的事，已经过去 3 天", next: "今天抽 20 分钟改完发给她",
    category: "urgent", certainty: "confirmed", kind: "promise", day: 2,
    ev: [["-3 22:40", "演示·小林", "[文件] 简历_2026.pdf", false], ["-3 22:41", "演示·小林", "帮我看看哪里要改", true], ["-3 22:45", "我", "周末前我帮你改一版", true]],
  },
  {
    key: "d3", person: "演示·小林", title: "入职日期推迟了", summary: "原定的入职日往后推了 4 天，昨天她说的。",
    why: "日期变了，旧的提醒已作废", next: "把你那边的安排也顺延",
    category: "later", certainty: "changed", kind: "change", day: 15, supersedes: "d3old",
    ev: [["-1 18:02", "演示·小林", "入职推迟了 晚4天", true], ["-1 18:03", "我", "那正好多休息几天", false]],
  },
  {
    key: "d3old", person: "演示·小林", title: "原定入职日（已改期）", summary: "最初说的入职日期。", why: "已被新日期取代", next: "无需处理",
    category: "later", certainty: "cancelled", kind: "plan", day: 11, status: "cancelled",
    ev: [["-9 20:10", "演示·小林", "offer下来了 定好入职日了", true]],
  },
  {
    key: "d4", person: "演示·小林", title: "她最近工作压力比较大", summary: "这周有三次提到加班到很晚。",
    why: "AI 从多条消息里看出来的，不一定准确", next: "可以简单关心一句，不用追问",
    category: "potential", certainty: "uncertain", kind: "concern",
    ev: [["-4 23:30", "演示·小林", "今天又加班到11点", true], ["-2 23:55", "演示·小林", "累死了 明天还要早起", true], ["-1 00:20", "演示·小林", "这周真的顶不住", true]],
  },
  {
    key: "d5", person: "演示·阿哲", title: "下周可能一起去看展", summary: "提到想去国立新美术馆，时间没定。",
    why: "还没定日子，先放着", next: "等他定了时间再说",
    category: "later", certainty: "tentative", kind: "plan",
    ev: [["-1 13:20", "演示·阿哲", "下周有空去看那个展不", true], ["-1 13:25", "我", "可以啊 你定时间", false]],
  },
  {
    key: "d6", person: "演示·阿哲", title: "上次说要介绍的学长还没联系", summary: "两周前你说会把学长微信推给他。",
    why: "你确认过要做，之后没找到推送记录", next: "确认一下是不是已经在别处推过了",
    category: "forgotten", certainty: "confirmed", kind: "promise",
    ev: [["-14 19:40", "演示·阿哲", "那个做投行的学长能介绍下吗", true], ["-14 19:41", "我", "行 我回头推给你", true]],
  },
  {
    key: "d7", person: "演示·投资群", group: true, title: "群里在等你回复对美团的看法", summary: "有人 @ 你问对美团季报的判断，你还没回。",
    why: "别人在等你，已经过去一天", next: "回复你的判断，或说晚点再聊",
    category: "potential", certainty: "confirmed", kind: "pending",
    ev: [["-1 10:12", "演示·阿杰", "@我 你怎么看美团这季", true], ["-1 10:13", "演示·阿杰", "外卖竞争好像还没结束", false]],
  },
  {
    key: "d8", person: "演示·小林", title: "她不喜欢香菜", summary: "点外卖时专门提过。", why: "以后约饭可以注意", next: "",
    category: "later", certainty: "confirmed", kind: "preference",
    ev: [["-20 12:10", "演示·小林", "千万别放香菜！！", true]],
  },
];

export function seedDemo(d: DatabaseSync, set: DemoSet = "life") {
  const SEEDS = LIFE_SEEDS;
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const dateOf = (off: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + off);
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };
  const now = `${dateOf(0)} ${p(today.getHours())}:${p(today.getMinutes())}:00`;
  if ((set === "night" || set === "love") && nightAvailable(set)) {
    ensureAnalysisTable(d);
    seedNight(d, now, dateOf, set);
    return;
  }
  clearNightChats();
  const insItem = d.prepare(`INSERT INTO items(mode,source_key,person_key,person_name,is_group,title,summary,why,next_step,category,status,certainty,kind,event_date,event_time,created_at,updated_at)
    VALUES('demo',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insEv = d.prepare("INSERT INTO evidence(item_id,session_id,message_id,ts,sender,text,is_key,ord) VALUES(?,?,?,?,?,?,?,?)");
  const ids = new Map<string, number>();
  for (const s of SEEDS) {
    insItem.run(s.key, `demo:${s.person}`, s.person, s.group ? 1 : 0, s.title, s.summary, s.why, s.next, s.category, s.status ?? "open",
      s.certainty, s.kind, s.day == null ? null : dateOf(s.day), s.time ?? null, now, now);
    const id = Number((d.prepare("SELECT last_insert_rowid() id").get() as { id: number }).id);
    ids.set(s.key, id);
    s.ev.forEach(([when, who, text, isKey = true], i) => {
      const [off, hm] = when.split(" ");
      insEv.run(id, `demo:${s.person}`, `demo-${s.key}-${i}`, `${dateOf(Number(off))} ${hm}`, who, text, isKey ? 1 : 0, i);
    });
  }
  d.exec(`UPDATE items SET observed_at=(SELECT MAX(ts) FROM evidence e WHERE e.item_id=items.id AND e.is_key=1) WHERE mode='demo'`);
  for (const s of SEEDS) if (s.supersedes) d.prepare("UPDATE items SET supersedes_id=? WHERE id=?").run(ids.get(s.supersedes)!, ids.get(s.key)!);
  for (const s of SEEDS) if (s.facet || s.milestone != null)
    d.prepare("UPDATE items SET facet=COALESCE(?,facet), milestone=? WHERE id=?").run(s.facet ?? null, s.milestone == null ? null : s.milestone ? 1 : 0, ids.get(s.key)!);
}

/** Replace the demo rows with another demo set (real data is never touched). */
export function reseedDemo(d: DatabaseSync, set: DemoSet) {
  const ids = "SELECT id FROM items WHERE mode='demo'";
  d.exec(`DELETE FROM evidence WHERE item_id IN (${ids}); DELETE FROM history WHERE item_id IN (${ids}); DELETE FROM items WHERE mode='demo';`);
  ensureAnalysisTable(d);
  d.exec("DELETE FROM person_analysis WHERE session_id LIKE 'demo:%'");
  seedDemo(d, set);
}

// same shape the background analysis job writes; demo rows use session ids "demo:<person>"
function ensureAnalysisTable(d: DatabaseSync) {
  d.exec("CREATE TABLE IF NOT EXISTS person_analysis(session_id TEXT PRIMARY KEY, content TEXT NOT NULL, basis_items INTEGER NOT NULL, basis_until TEXT, generated_at TEXT NOT NULL)");
}
