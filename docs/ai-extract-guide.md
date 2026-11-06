# AI 整理规则（每次整理前必读）

你在帮用户（下文"我"）从 TA 和某个人的私聊里，整理出**值得记住的事**和**这个人的画像**。
聊天原文只能从 `radar-ai next` 读，只能通过 `radar-ai submit` 写回。每条结果都必须用 `refs` 指向聊天里的消息编号作为证据。

## 要提取的
| kind | 是什么 | 例子 |
|---|---|---|
| plan | 有日期或接近确定的安排（含已过去的） | 周六 7 点吃拉面；下周三下午去新开的咖啡店 |
| change | 安排变了。填 `supersedes_item_id` 指向被改掉的那条 | 周日的约改到下周 |
| promise | 某人明确答应要做的事 | 对方说周末把借的书带来 |
| pending | 还在等回复或确认的事 | 店家说明天回复 |
| need | 对方**明确说出**的需要或不满 | 忙的时候希望提前说一声 |
| preference | 明确表达过的喜好或讨厌 | 不吃香菜 |
| fact | 关于这个人的稳定事实或近况 | 在设计公司上班；周六常上班；有驾照 |
| concern | 值得关心的事，但只能基于对方自己说的话 | 对方说这周压力很大 |

`milestone`（kind 为 fact 时必填，true / false）：true = 对方生活里真正发生的一件事，以后回看时间线会想看到（换工作或辞职、搬家、生病住院、考试和录取结果、出远门旅行、恋爱分手、家里出事、做了重大决定）；false = 小事或稳定的细节（有驾照、会做饭、周六常上班、今天有点累）。拿不准就填 false——小事照样留在人物画像里，只是不进时间线。

`facet`（画像分组，kind 为 fact/preference/need 时必填）：作息与工作 / 情况 / 近况 / 喜好 / 明确需求 / 相处约定 / 观点与判断 / 家人与朋友 / 健康 / 其他

`subject`：them = 关于对方；self = 关于我自己；both = 我们共同的安排或约定

`certainty`：confirmed = 说定了；tentative = 提过但没定；changed = 改过；cancelled = 取消了；uncertain = 说法模糊，需要用户判断

## 不要提取的
- 玩笑、斗嘴、反话。判断方法：一句话是在接对方的调侃、气话、夸张说法时说的，就不是真实意愿或事实。例：我开玩笑说"你干脆辞职去环游世界吧"，对方回"好啊明天就走"——这是接话，不能记成对方打算辞职；吵架时说的气话同理。拿不准是不是玩笑，就不记
- 表情、寒暄、晚安、日常闲聊
- 你自己的推测，比如"对方可能生气了""关系变好了"。情绪只记对方**自己说出来**的，用 concern，并原样引用
- 聊天里出现的第三方隐私细节，除非直接关系到对方的安排（比如"同事离职导致对方更忙"可以记）
- 和【已有记录】重复的内容：用 `attach` 给那条补证据，不要新建

## 日期
- 相对日期（明天、下周三、29 号）一律按**那条消息的发送时间**换算成 YYYY-MM-DD
- 换算不出来就把 event_date 设为 null，certainty 设为 uncertain，不要猜
- 时间点写进 event_time（HH:mm）

## 写法
- title：一句话，20 字左右，写清是什么。不要写"可能""似乎"
- summary：补充细节，可以省略
- why：一句话说明为什么值得记，可以省略
- 宁缺毋滥：一段 1500 条的聊天，通常整理出 5–25 条就够了

## 提交格式（写到文件，再执行 `radar-ai submit --file 文件`）
```json
{
  "session": "<会话 id，照抄给你的值>",
  "items": [
    {"title": "...", "kind": "plan", "facet": null, "subject": "both", "certainty": "confirmed",
     "event_date": "2026-07-19", "event_time": null, "summary": "...", "why": "...", "refs": [82, 101], "supersedes_item_id": null},
    {"title": "...", "kind": "fact", "facet": "作息与工作", "subject": "them", "certainty": "confirmed", "milestone": false,
     "event_date": null, "event_time": null, "summary": "...", "why": "...", "refs": [120], "supersedes_item_id": null}
  ],
  "attach": [{"item_id": 12, "refs": [340]}]
}
```
`submit` 会校验每个字段，并检查每个编号都对得上真实消息。整理没成功就不会推进进度，下次会重新处理同一段，所以不用担心漏掉或重复。
