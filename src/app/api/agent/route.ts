import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR, DEMO_ONLY, demoOnlyResponse } from "@/lib/config";

/**
 * The agent skill, copied into the data folder so its path stays put (an npx install lives in a cache that can be
 * cleared), plus the sentence to hand to your agent.
 */
export async function GET() {
  if (DEMO_ONLY) return demoOnlyResponse();
  const root = process.cwd();
  const skill = path.join(DATA_DIR, "agent", "SKILL.md");
  try {
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.copyFileSync(path.join(root, "agent", "SKILL.md"), skill);
  } catch (e) {
    return Response.json({ error: `没能准备技能文件：${(e as Error).message}` }, { status: 500 });
  }
  const short = (p: string) => (p.startsWith(os.homedir() + path.sep) ? "~" + p.slice(os.homedir().length) : p);
  const run = root.split(path.sep).includes("node_modules") ? "npx github:Ikarishinji00/personal-radar" : `node ${short(path.join(root, "bin", "radar.mjs"))}`;
  const prompt = `读 ${short(skill)}，按里面的方法帮我维护 Personal Radar（运行命令用：${run}）：每天 21:30 导入新聊天、整理还没整理的消息，做完用一两句话告诉我新增了哪些要处理的事。`;
  return Response.json({ skill, run, prompt });
}
