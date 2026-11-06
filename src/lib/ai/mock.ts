import "server-only";
import { getItem, listItems } from "@/lib/db";
import type { Item } from "@/lib/types";
import type { Citation, CompanionContext, CompanionProvider, Proposal, StreamEvent } from "./types";

// Rule-based stand-in so the full flow (questions → evidence → proposals → confirm/undo) works without an API key.
// It only ever answers from stored items + their evidence; it never invents facts.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cite(i: Item): Citation {
  const d = getItem(i.id);
  const keys = d?.evidence.filter((e) => e.isKey) ?? [];
  const q = (i.kind === "promise" ? keys.find((e) => e.sender === "我") : undefined) ?? keys[0];
  return { itemId: i.id, title: i.title, personName: i.personName, quote: q ? { ts: q.ts, sender: q.sender, text: q.text } : undefined };
}

function scope(ctx: CompanionContext): Item[] {
  const all = listItems();
  if (ctx.page === "person") return all.filter((i) => i.personKey === ctx.personKey);
  if (ctx.page === "item") {
    const it = all.find((i) => i.id === ctx.itemId);
    return it ? all.filter((i) => i.personKey === it.personKey) : all;
  }
  return all;
}

const open = (xs: Item[]) => xs.filter((i) => i.status === "open");

export const mockProvider: CompanionProvider = {
  name: "演示 AI（规则模拟）",
  simulated: true,
  async *respond(history, ctx): AsyncGenerator<StreamEvent> {
    yield { type: "meta", provider: this.name, simulated: true };
    const q = history.filter((h) => h.role === "user").at(-1)?.content ?? "";
    const items = scope(ctx);
    let text = "";
    let cites: Item[] = [];
    let proposals: Proposal[] = [];
    let draft: string | null = null;
    const current = ctx.page === "item" ? getItem(ctx.itemId) : null;

    if (/答应|承诺|没完成|还没做/.test(q)) {
      cites = open(items).filter((i) => i.kind === "promise");
      text = cites.length
        ? `找到 ${cites.length} 件你答应过、还没看到处理记录的事：\n` + cites.map((i, n) => `${n + 1}. ${i.title}（${i.personName}）`).join("\n")
        : "没有找到你答应过但还没处理的事。";
      proposals = cites.slice(0, 2).map((i) => ({ id: `p-${i.id}-snooze`, label: `把「${i.title}」延后 3 天`, itemId: i.id, type: "snooze", days: 3 }));
    } else if (/忽略|遗漏|忘/.test(q)) {
      cites = open(items).filter((i) => i.category === "forgotten" || i.category === "potential");
      text = cites.length ? `这些可能被你忽略了：\n` + cites.map((i, n) => `${n + 1}. ${i.title} — ${i.why ?? ""}`).join("\n") : "目前没有发现可能被忽略的事。";
    } else if (/最早|什么时候提到|第一次/.test(q) && current) {
      const first = [...current.evidence].sort((a, b) => a.ts.localeCompare(b.ts))[0];
      cites = [current];
      text = first ? `最早是 ${first.ts}，${first.sender} 说：“${first.text}”。` : "这件事没有保存原话。";
    } else if (/背景|前后|上下文/.test(q) && current) {
      cites = [current];
      text = `这条消息前后的聊天：\n` + current.evidence.map((e) => `${e.ts.slice(5)} ${e.sender}：${e.text}${e.isKey ? "  ← 关键" : ""}`).join("\n");
    } else if (/回复|起草|怎么回|写一条/.test(q)) {
      const target = current ?? open(items).find((i) => i.category === "urgent") ?? null;
      if (target) {
        cites = [target];
        draft = target.kind === "plan" ? `明天${target.eventTime ? target.eventTime.replace(":00", "点") : ""}就是了吧 准备得怎么样啦 别太紧张 你没问题的` : `上次说的${target.title.replace(/^你/, "")}我记着呢 这两天弄好发你`;
        text = `按你平时说话的习惯起草了一条（简短、口语、不加敬语）。是否发送由你决定，我不会替你发。`;
      } else text = "先告诉我想回复哪件事，或者在某件事的详情页里问我。";
    } else if (/关心|主动|状态|最近/.test(q)) {
      cites = open(items).filter((i) => i.kind === "concern" || i.category === "urgent").slice(0, 3);
      text = cites.length ? "值得你主动关心的：\n" + cites.map((i, n) => `${n + 1}. ${i.title}。${i.nextStep ?? ""}`).join("\n") : "暂时没有特别需要主动关心的事。";
      proposals = cites.filter((i) => i.kind === "concern").map((i) => ({ id: `p-${i.id}-f`, label: `关心过后，把「${i.title}」标记为已关心`, itemId: i.id, type: "followed" }));
    } else if (/今天|关注|重要/.test(q)) {
      cites = open(items).filter((i) => i.category === "urgent").slice(0, 3);
      text = cites.length ? `今天有 ${cites.length} 件值得关注：\n` + cites.map((i, n) => `${n + 1}. ${i.title}。建议：${i.nextStep ?? "—"}`).join("\n") : "今天没有紧急的事。";
    } else {
      text = "我能回答这些：最近答应了什么还没做、可能忽略了什么、某件事最早什么时候提到、某条消息的前后背景、值得主动关心什么，或者帮你起草回复。\n\n现在是演示模式，回答完全来自 App 里保存的事项和原话，没有调用真实模型。";
    }
    if (!cites.length && ctx.page === "person" && !/^我能/.test(text)) text += "\n\n（只在这个人的记录里查了，可以说“扩大范围”看全部。）";

    for (const ch of text.match(/[\s\S]{1,6}/g) ?? []) {
      yield { type: "text", delta: ch };
      await sleep(18);
    }
    if (draft) yield { type: "draft", text: draft };
    if (cites.length) yield { type: "citations", items: cites.slice(0, 5).map(cite) };
    if (proposals.length) yield { type: "proposals", items: proposals };
    yield { type: "done" };
  },
};
