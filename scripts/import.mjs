#!/usr/bin/env node
// Personal Radar — import chat exports from the command line (the app's 设置 → 导入聊天 does the same in the browser).
//
//   npm run import -- <file> [more files…] [--me "your name in the chat"] [--name "display name"] [--date-order dmy|mdy] [--dry-run]
//
// Formats: LINE .txt · WhatsApp .txt/.zip · Telegram result.json · Discord (DiscordChatExporter) JSON ·
//          Instagram / Messenger message_N.json · ChatLab JSON / JSONL. Re-importing only adds new messages.
import fs from "node:fs";
import path from "node:path";
import { CHATS_DIR, DATA_DIR } from "./lib/env.mjs";
import { FORMATS, plan, read, write, writeState } from "./lib/import-core.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const valued = new Set(["--me", "--name", "--date-order"]);
const files = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const dry = args.includes("--dry-run");
const fmt = (s) => new Date(s * 1000).toLocaleString("sv-SE").slice(0, 16);

if (!files.length) {
  console.log(`用法 / usage:  npm run import -- <导出文件…> [--me "你在聊天里的名字"] [--name "显示名"] [--date-order dmy|mdy] [--dry-run]\n\n支持：\n${FORMATS.map((f) => `  · ${f.label}：${f.hint}`).join("\n")}\n\n怎么导出：docs/export-guide.md`);
  process.exit(0);
}

const results = [];
let failed = false;
for (const file of files) {
  try {
    if (!fs.existsSync(file)) throw new Error(`找不到文件：${file}`);
    const { format, chats } = read(fs.readFileSync(file), path.basename(file), { dateOrder: opt("date-order") });
    for (const chat of chats) {
      const p = plan(chat, { me: opt("me"), name: chats.length === 1 ? opt("name") : undefined }, CHATS_DIR);
      if (!p.ok) {
        failed = true;
        console.log(`✗ ${path.basename(file)}${chat.name ? `（${chat.name}）` : ""}：${p.error}${p.people ? `\n  出现过的名字：${p.people.slice(0, 12).map((x) => x.name).join("、")}\n  加上 --me "你的名字" 再试一次` : ""}`);
        continue;
      }
      const line = `${p.name}（${format}${p.isGroup ? "，群聊" : ""}）：${p.total} 条，其中新消息 ${p.fresh} 条 · ${fmt(p.first)} → ${fmt(p.last)} · 你 =「${p.meName}」`;
      if (dry) { console.log(`· [预览] ${line}`); continue; }
      const r = write(chat, p, CHATS_DIR);
      results.push({ id: p.id, name: p.name, new: r.added });
      console.log(`✓ ${line}\n  新增 ${r.added} 条，已存在 ${r.dup} 条，现在共 ${r.total} 条${p.isGroup ? "\n  群聊目前不会被 AI 整理，只能在 App 里查看。" : ""}`);
    }
  } catch (e) {
    failed = true;
    console.log(`✗ ${path.basename(file)}：${e.message}`);
  }
}
if (!dry) writeState(DATA_DIR, { ok: !failed || results.length > 0, error: failed && !results.length ? "导入失败" : null, file: files.map((f) => path.basename(f)).join(", "), sessions: results });
if (results.length) console.log("下一步：npm run organize（或在 App 的「设置 → 整理」里点开始）");
process.exit(failed && !results.length ? 1 : 0);
