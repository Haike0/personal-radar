# Personal Radar

**Turn your chat history into a memory of the people you care about** — what you promised, what they told you, plans that changed, and what is coming up this week. Local-first: your chats stay on your own computer.

[中文说明](#中文说明) · AGPL-3.0 · early preview, UI in Chinese for now

| Today | A person |
|---|---|
| ![Today](docs/img/today.jpg) | ![Person](docs/img/person.jpg) |

*Screenshots use the built-in fictional demo data.*

## What it does

- **Reminders from your chats.** "Saturday 7 pm at the ramen place", "I'll bring the book back", "my interview is next Friday" — found in the conversation, dated, and shown on the day they matter. If a plan changes later, the old one is replaced.
- **A sourced profile of each person.** Likes, dislikes, work, family, things they asked of you. Every line links back to the exact messages it came from, so you can check it.
- **Chat numbers at a glance.** Reply rate, how fast they answer, who writes more, how the conversation's pace changed over time — straight from the messages, right after import. No "interest score": Radar only shows facts.
- **Ask about someone.** "What did she say about her new job?" — answered from your own notes and the original messages, with citations. Five assistants: general, relationship, reply drafts, memory lookup, views.

Nothing is decided for you: anything the AI writes is marked "to check" until you accept it, and it never sends messages to anyone.

## How it works

```
chat export ──drag into Settings → Import──▶ local SQLite (~/.personal-radar)
                                                   │
          Settings → Organize ◀────────────────────┘  your own AI key, redacted before sending
                  │
                  ▼
        reminders + profiles ──▶ web app on localhost (phone: add to home screen)
```

| Supported exports | |
|---|---|
| LINE `.txt` (Japanese, Chinese, English UI) | WhatsApp `.txt` or `.zip` (iPhone and Android) |
| Telegram Desktop `result.json` (one chat or the whole account) | Discord (DiscordChatExporter JSON) |
| Instagram / Messenger `message_N.json` | ChatLab JSON / JSONL, or ChatLab's local API |

**One-tap connections (no export files):** if you already use [Beeper](https://www.beeper.com) (one app for WhatsApp, Telegram, Signal, Instagram, iMessage and more) or [ChatLab](https://chatlab.fun), connect it with a token from its local API and pick which chats to bring in. Both are read-only and stay on your computer. *These two connections are new and not yet tested against the real apps — reports welcome.*

Radar ships no decryption or scraping tools. See the [export guide](docs/export-guide.md) for each app.

## Install

Three ways, pick one:

- **Let your AI assistant do it.** Tell Claude Code, Codex or Cursor: *"Read AGENT_SETUP.md and set up Personal Radar on this computer."* It installs, makes it start at login, and opens the page. ([AGENT_SETUP.md](AGENT_SETUP.md))
- **Docker:** `docker compose up -d`, then open http://localhost:3210. Data goes to `./radar-data`. *(Not yet tested.)*
- **By hand** (Node.js 22.13+):
  ```bash
  git clone https://github.com/Ikarishinji00/personal-radar.git
  cd personal-radar
  npm install
  npm run dev            # open http://localhost:3210
  ```

The first screen asks whether you want to look at the demo (fictional data) or use your own chats.
Choosing your own chats starts four steps — no config files:

1. **Import:** drag in your exports, check the preview (who is you, how many messages), confirm.
2. **AI service:** pick DeepSeek, OpenAI, Gemini, OpenRouter, Kimi, Qwen, GLM, a local Ollama model, or any OpenAI-compatible endpoint; paste a key; *Test & save*.
3. **Privacy:** choose what is hidden before sending (keys, emails, phone numbers, card and ID numbers, links), add blocked keywords, or exclude a person entirely. *Try it* shows the result live.
4. **Organize:** see exactly what the first chunk would send, then start. Turn on the daily run if you like.

Prefer the terminal? `npm run import -- <files…>` and `npm run organize` do the same; settings can also come from `.env.local` (see `.env.example`). `examples/` has small fictional exports to try.

Something not working? See [troubleshooting](docs/troubleshooting.md).

### Phone access (optional)

The server only listens on your computer. To use it from your phone, put both devices on a private network you control (for example Tailscale) and add the page to your home screen. Push notifications need HTTPS and `RADAR_PUSH_SUBJECT` set to a `mailto:` address.

## Privacy

- Chats, notes and keys stay in `~/.personal-radar` (override with `RADAR_DATA_DIR`). The original chat files are never modified.
- Only two things send content to the AI service you chose: organizing (chunks of new messages) and questions you ask in the app. Both pass through the same redaction rules and keyword blacklist at the last step, and both have a preview that shows exactly what would be sent.
- People you mark "不发给 AI" are never organized, analyzed, summarized or included in answers.
- With a local Ollama model nothing leaves your computer.
- Settings → Data: export everything Radar wrote as JSON, or delete everything (cannot be undone).
- Group chats are imported for reading but not organized.

## Compared with

| | Personal Radar | [Monica](https://github.com/monicahq/monica) | [PingCRM](https://github.com/sneg55/pingcrm) | [ChatLab](https://github.com/ChatLab/ChatLab) |
|---|---|---|---|---|
| Main job | Reminders and per-person memory from your chats | Personal CRM you fill in by hand | Networking CRM synced from your accounts | Analyze and explore chat history |
| Gets chats from | Export files, or Beeper / ChatLab locally | — | Logs into Gmail, Telegram, WhatsApp… | Export files |
| AI extracts promises & plans with dates | ✅ with sources | — | Life events, follow-ups | Q&A and summaries |
| Phone + push reminders | ✅ (home-screen web app) | Email reminders | Web app | Desktop app |
| AI provider | Your own key, any OpenAI-compatible, or local Ollama | — | Anthropic | Your own key |
| Runs | On your computer | Self-host or paid cloud | Self-host or cloud | Desktop / CLI / Docker |

Radar reads exports instead of logging into your messaging accounts: less automatic, but no account-ban risk and nothing to hand over.

## Contributing

New importers (KakaoTalk, Signal, iMessage…) and fixes for real-world export variants are the most useful contributions; each format has fixtures and tests in `tests/`. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [CLA](CLA.md) first, and never put real chat logs in issues.

## License

Copyright © 2026 Fu Haike. Released under the [GNU AGPL-3.0](LICENSE): you can use, change and share it; if you run a modified version as a service for others, you must publish your changes under the same license.

---

## 中文说明

**把聊天记录变成你对身边人的记忆**：你答应过的事、对方说过的事、改了的约、这周要到的日子。数据只在你自己的电脑上。

### 能做什么
- **从聊天里找出要记住的事**：约了几点、答应带什么、下周五面试……按日期提醒你；安排变了，旧的会自动作废。
- **每个人的画像**：喜好、忌讳、工作、家人、对你提过的要求，每一条都能点回原话核对。
- **问 AI**：「她换工作的事是怎么说的？」——从你自己的记录和原话里回答，并标出处。

AI 整理出的内容在你确认之前都标着「待核对」；它不会替你给任何人发消息。

### 四步用起来
需要 **Node.js 22.13 以上**。

```bash
npm install
npm run dev        # 打开 http://localhost:3210，先看演示数据
```

点首页的「开始设置」：① 拖入导出的聊天文件，预览后确认；② 选 AI 服务、粘贴密钥、点「测试并保存」；③ 设置发出去前要隐藏什么；④ 先看「会发什么」，再开始整理。全程不用改配置文件。

支持 LINE、WhatsApp（.txt / .zip）、Telegram、Discord、Instagram / Messenger、ChatLab。也可以一键连接 Beeper 或 ChatLab，不用导出文件（这两项还没用真实软件测过）。不会装的话，把 [AGENT_SETUP.md](AGENT_SETUP.md) 交给你的 AI 编程助手，让它帮你装。各 App 怎么导出见 [导出指南](docs/export-guide.md)，遇到问题看 [常见问题](docs/troubleshooting.md)。

### 隐私
- 聊天、整理结果、密钥都在 `~/.personal-radar`，App 只在本机监听。
- 只有两种时候会把内容发出去：整理聊天时，和你在 App 里提问时。发出前都会按你的规则脱敏（密钥、邮箱、电话、卡号、证件号、链接），黑名单关键词所在的消息整条不发；两处都能先预览具体发什么。
- 可以把某个人设成「不发给 AI」；用本机 Ollama 模型则完全不联网。
- 默认用 DeepSeek（服务器在中国），可以换成任何兼容 OpenAI 接口的服务。

### 许可
AGPL-3.0。提交代码前请先看 [CLA](CLA.md)。
