# 常见问题 / Troubleshooting

**`npm install` 或启动时报 `node:sqlite` 找不到**
需要 Node.js 22.13 或更新版本：`node -v` 查看。macOS 可以用 `brew install node`，或从 nodejs.org 下载。

**导入时说「认不出这个文件的格式」**
看 [导出指南](export-guide.md) 确认导出方式（Telegram / Instagram 要选 JSON）。WhatsApp 的 `.zip` 可以直接拖，不用解压。

**导入时说「分不出哪个是你」**
群聊，或者文件里看不出对方名字时会这样。在预览里的「哪个是你」选一下；命令行加 `--me "你的名字"`。

**「测试并保存」失败**
- `HTTP 401`：密钥不对，或复制时多了空格。
- `HTTP 402`：账户余额不足（DeepSeek 需要先充值）。
- `HTTP 404`：模型名或服务地址不对。点「读取模型列表」选一个。
- 连不上：检查网络 / 代理；用 Ollama 时先确认 `ollama serve` 在运行。

**整理一直没有新记录**
「设置 → 整理」里看每个人「待整理」的条数和下面的运行记录。聊天很长时一次只整理一部分（每人 6 段），再点一次或打开「每天自动整理」会接着做。被设成「不发给 AI」的人不会被整理。

**界面没有更新到新版本（开发时）**
`npm run dev` 下离线缓存已关闭。如果你之前用过旧版本，在浏览器开发者工具 → Application → Service Workers 里点 Unregister，再刷新。

**数据在哪里，怎么删干净**
全部在 `~/.personal-radar`（或你设置的 `RADAR_DATA_DIR`）：`chats/` 是导入的聊天，`radar.db` 是整理结果和设置（含 API 密钥）。删除这个文件夹就清空了。
