# 导出聊天记录 / Exporting your chats

> 不想每次手动导入：在「设置 → 聊天来源 → 聊天软件」打开**自动导入文件夹**，把导出工具的保存位置设成那个文件夹；或在「聚合平台」连接 Beeper / ChatLab / 支持 ChatLab Pull 协议的工具，设成每隔几小时自动同步。

Radar 只读取你自己导出的文件，不提供解密、抓取或登录别人账号的工具。导出后在 App 的「设置 → 导入聊天」里拖进去（或 `npm run import -- 文件`），会先预览再写入。

| App | 怎么导出 | 拖进 Radar 的文件 | 已验证 |
|---|---|---|---|
| **LINE** | 手机：打开聊天 → 右上「≡」→「设置 / その他」→「发送聊天记录 / トーク履歴を送信」。电脑版：聊天右上「⋮」→「保存聊天 / トークを保存」 | `.txt` | ✅ 对照公开的真实导出样本 |
| **WhatsApp** | 打开聊天 → 点对方名字（Android：右上 ⋮ → 更多）→「导出聊天」→「不含媒体」 | iPhone 得到 `.zip`，直接拖；Android 是 `.txt` | ✅ iPhone / Android 两种格式（测试样例） |
| **微信** | 微信本身不能导出。在你自己的电脑上用开源工具 [WeFlow](https://github.com/hicccc77/WeFlow) 导出，格式选「ChatLab」。第三方工具，Radar 不内置，风险自己判断 | ChatLab 格式 `.json` | ✅ ChatLab 格式（WeFlow 本身未实测） |
| **QQ** | 开源工具 [QQ Chat Exporter](https://github.com/shuakami/qq-chat-exporter) 导出 JSON（能定时导出到自动导入文件夹）；或旧版 QQ「消息管理器 → 导出消息记录」存 `.txt` | `.json` / `.txt` | ⚠️ 按公开字段实现，测试样例通过，未用真实文件验证 |
| **抖音** | 开源工具 [douyin-chat-export](https://github.com/TeamBreakerr/douyin-chat-export) 导出 ChatLab 格式，或用它的「ChatLab 远程数据源」在「聚合平台 → 其他导出工具」里连接 | ChatLab 格式 | ⚠️ 未实测 |
| **Google Chat** | [takeout.google.com](https://takeout.google.com) 只选 Google Chat 导出，整个 `.zip` 拖进来 | `.zip` | ⚠️ 测试样例通过，未用真实文件验证 |
| **Telegram** | Telegram Desktop：聊天右上 ⋮ →「导出聊天记录」→ 格式选 **JSON**。全部聊天：设置 → 高级 → 导出 Telegram 数据 | `result.json` | ⚠️ 按公开格式实现，未用真实文件验证 |
| **Discord** | 第三方开源工具 [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter)，格式选 **JSON**（使用前自行判断安全性） | `.json` | ⚠️ 同上 |
| **Instagram / Messenger** | Meta 账户中心 →「下载你的信息」→ 只选「消息」、格式 **JSON** | `messages/inbox/对方/message_1.json`（分成多个时一起拖） | ⚠️ 同上 |
| **ChatLab** | ChatLab 里导出 JSON / JSONL；或在「设置 → 导入聊天 → 从 ChatLab 读取」连接 ChatLab 本地接口 | `.json` / `.jsonl` | 文件 ✅；本地接口 ⚠️ 未实测 |
| **Beeper（一键连接）** | 装 [Beeper Desktop](https://www.beeper.com) 并登录聊天账号 → 设置 → Developers 打开 Desktop API → 设置 → Integrations →「Approved connections」+ 复制令牌 → 在 Radar「导入聊天 → 一键连接 → Beeper」粘贴 | 不用文件 | ⚠️ 按官方 API 文档实现，未实测 |
| **微信 / QQ / iMessage 等** | 用 Beeper 连接（它的官网列出支持 iMessage、LINE、WeChat 等，实际可用范围以 Beeper 为准），或在 ChatLab 里导入后连接 ChatLab | — | — |

**注意**
- LINE 电脑版只保存窗口里已经加载出来的消息；想要完整记录，用手机导出。
- WhatsApp 日期顺序（日/月 还是 月/日）会自动判断；判断不了时，命令行加 `--date-order mdy` 或 `dmy`。
- 同一个聊天以后再导出、再导入，只会加新消息，不会重复。
- 群聊可以导入查看，但目前不会被 AI 整理。

发现某种导出读不出来？请开 issue，附上**删掉真实内容后**的几行样例（保留格式、换掉名字和文字）。
