// Assistant presets for the AI chat. Shared by server (prompt) and client (labels, quick questions).
// Written for this app; not copied from any other project.
export interface Assistant {
  id: string;
  name: string;
  intro: string;
  /** extra instructions appended to the base rules */
  prompt: string;
  /** quick questions; {who} becomes the person's name, or "大家" when the scope is everyone */
  quick: string[];
}

export const ASSISTANTS: Assistant[] = [
  {
    id: "general",
    name: "通用分析",
    intro: "梳理你们聊过的事实、时间线和近况变化，回答具体问题，每个说法都附依据。",
    prompt: "按问题梳理事实和时间线，指出最近的变化和还没落地的事。",
    quick: ["{who}最近在忙什么？", "最近有什么变化值得我注意？", "我们最近一次见面聊了什么？", "有哪些事还没落地？"],
  },
  {
    id: "relationship",
    name: "关系顾问",
    intro: "从你们的相处记录出发，看清对方在意什么、摩擦从哪来，给出具体可做的建议。",
    prompt: "像一位冷静、公平的关系顾问：先讲对方明确说过的需要和在意的点，再讲你们的相处模式和摩擦是怎么发生、怎么化解的，最后给 2–4 条具体可做的建议。不评判谁对谁错，不贴心理标签，推测要写明是推测。",
    quick: ["{who}最在意的是什么？", "我们的摩擦一般是怎么开始的？", "我最近哪里可以做得更好？", "下次见面可以一起做什么？"],
  },
  {
    id: "reply",
    name: "回复参谋",
    intro: "根据你们的聊天习惯和最近的事，帮你起草要发的话。只起草，发不发由你决定。",
    prompt: "用户要发消息给对方时，先用一两句说明你依据了哪些记录，再给出 2 个不同语气的版本（比如一个直接、一个更柔和），用用户平时的口吻，自然、有温度、不肉麻、没有 AI 腔。草稿单独成段，方便复制。",
    quick: ["帮我想想现在怎么跟{who}开口", "帮我写一条关心近况的消息", "帮我道个歉，说清楚但不卑微", "帮我约下次见面"],
  },
  {
    id: "memory",
    name: "记忆检索",
    intro: "只查事实，不做分析：某件事是什么时候说的、原话是什么、答应过什么。",
    prompt: "只回答事实：给出日期、说话人和原话，按时间排列。不做分析和建议。找不到就说找不到。",
    quick: ["我答应过{who}什么还没做？", "{who}说过不喜欢什么？", "{who}的生日和重要日子", "我们约过但取消了的事"],
  },
  {
    id: "views",
    name: "观点对照",
    intro: "整理对方对投资、工作、社会等话题的看法，和你的观点放在一起对照。",
    prompt: "整理对方明确表达过的观点（注明时间），再和用户自己说过的观点对照，指出相同点、分歧点，以及对方后来有没有改变看法。",
    quick: ["{who}的投资观点是什么？", "我们在哪些问题上分歧最大？", "{who}最近改变了什么看法？", "{who}对我的提醒和批评有哪些？"],
  },
];

export const assistantOf = (id: string | null | undefined) => ASSISTANTS.find((a) => a.id === id) ?? ASSISTANTS[0];
export const quickFor = (a: Assistant, who: string | null) => a.quick.map((q) => q.replaceAll("{who}", who ?? "大家"));

/** Pre-meeting brief: one card to read before you see someone. Contains "最近" so the latest chat is included. */
export const briefFor = (who: string) =>
  `见面前简报：我马上要见${who}。请告诉我①上次聊到哪 ②${who}最近在意或在忙什么 ③我答应过${who}、还没兑现的事 ④${who}答应过我或欠我的事 ⑤这次可以聊的 3 个话题。每条附依据，没有就写“没有”。`;
/** Quick questions when the AI is opened from one item. */
export const ITEM_QUICK = [
  "分析这件事：现在是什么情况，我接下来该做什么？",
  "这件事后来有变化吗？有没有改期、完成或取消？",
  "帮我起草一条关于这件事的消息",
  "这件事最早是什么时候、谁先提起的？",
];
/** Quick questions when the AI is opened from one day of chat (聊天记忆). */
export const DAY_QUICK = [
  "这天聊了什么？有没有约定或答应的事？",
  "这天对方的情绪怎么样，我当时回应得好吗？",
  "这天提到的事，后面需要我跟进什么？",
];
