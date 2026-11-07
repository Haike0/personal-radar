# 导出聊天记录 / Exporting your chats

> 不想每次手动导入：在「设置 → 聊天来源 → 聊天软件」打开**自动导入文件夹**，把导出工具的保存位置设成那个文件夹；或在「聚合平台」连接 Beeper / ChatLab / 支持 ChatLab Pull 协议的工具，设成每隔几小时自动同步。

Radar 只读取你自己导出的文件，不提供解密、抓取或登录别人账号的工具。导出后在 App 的「设置 → 导入聊天」里拖进去（或 `npm run import -- 文件`），会先预览再写入。

| App | 怎么导出 | 拖进 Radar 的文件 | 已验证 |
|---|---|---|---|
| **LINE** | 手机：打开聊天 → 右上「≡」→「设置 / その他」→「发送聊天记录 / トーク履歴を送信」。电脑版：聊天右上「⋮」→「保存聊天 / トークを保存」 | `.txt` | ✅ 对照公开的真实导出样本 |
| **WhatsApp** | 打开聊天 → 点对方名字（Android：右上 ⋮ → 更多）→「导出聊天」→「不含媒体」 | iPhone 得到 `.zip`，直接拖；Android 是 `.txt` | ✅ iPhone / Android 两种格式（测试样例） |
| **微信** | 微信官方不支持导出聊天记录，需要你自己解决（可以参考其他开源项目），整理成 ChatLab 格式后导入。Radar 不提供、不内置任何读取微信数据的工具 | ChatLab 格式 `.json` / `.jsonl` | ✅ ChatLab 格式 |
| **QQ** | 旧版 QQ「消息管理器 → 导出消息记录」存 `.txt`；新版 QQ 官方没有导出功能，需要你自己解决（可参考其他开源项目）。也能读常见的 QQ 导出 JSON | `.txt` / `.json` | ⚠️ 测试样例通过，未用真实文件验证 |
| **抖音** | 官方不支持导出私信，需要你自己解决（可参考其他开源项目），整理成 ChatLab 格式；支持 ChatLab Pull 协议的工具可以在「聚合平台 → 其他导出工具」里连接 | ChatLab 格式 | ⚠️ 未实测 |
| **Google Chat** | [takeout.google.com](https://takeout.google.com) 只选 Google Chat 导出，整个 `.zip` 拖进来 | `.zip` | ⚠️ 测试样例通过，未用真实文件验证 |
| **Telegram** | Telegram Desktop：聊天右上 ⋮ →「导出聊天记录」→ 格式选 **JSON**。全部聊天：设置 → 高级 → 导出 Telegram 数据 | `result.json` | ⚠️ 按公开格式实现，未用真实文件验证 |
| **Discord** | 官方数据下载不含完整私信，需要你自己导出（可参考其他开源项目），格式选 JSON | `.json` | ⚠️ 按公开格式实现，未用真实文件验证 |
| **Instagram / Messenger** | Meta 账户中心 →「下载你的信息」→ 只选「消息」、格式 **JSON** | `messages/inbox/对方/message_1.json`（分成多个时一起拖） | ⚠️ 同上 |
| **ChatLab** | ChatLab 里导出 JSON / JSONL；或在「设置 → 导入聊天 → 从 ChatLab 读取」连接 ChatLab 本地接口 | `.json` / `.jsonl` | 文件 ✅；本地接口 ⚠️ 未实测 |
| **Beeper（一键连接）** | 装 [Beeper Desktop](https://www.beeper.com) 并登录聊天账号 → 设置 → Developers 打开 Desktop API → 设置 → Integrations →「Approved connections」+ 复制令牌 → 在 Radar「导入聊天 → 一键连接 → Beeper」粘贴 | 不用文件 | ⚠️ 按官方 API 文档实现，未实测 |
| **iMessage 等** | 用 Beeper 连接（官方提供的本地接口；支持哪些平台以 Beeper 为准），或在 ChatLab 里导入后连接 ChatLab | — | — |

**注意**
- LINE 电脑版只保存窗口里已经加载出来的消息；想要完整记录，用手机导出。
- WhatsApp 日期顺序（日/月 还是 月/日）会自动判断；判断不了时，命令行加 `--date-order mdy` 或 `dmy`。
- 同一个聊天以后再导出、再导入，只会加新消息，不会重复。
- 群聊可以导入查看，但目前不会被 AI 整理。

发现某种导出读不出来？请开 issue，附上**删掉真实内容后**的几行样例（保留格式、换掉名字和文字）。
