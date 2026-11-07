import os from "node:os";
import path from "node:path";
import { DATA_DIR, DEMO_ONLY, demoOnlyResponse } from "@/lib/config";

/**
 * The sentence to hand to your agent. It points at a command (`radar guide agent` prints the skill), not a file on
 * this disk, so everyone who installed the same way gets the same sentence.
 */
export async function GET() {
  if (DEMO_ONLY) return demoOnlyResponse();
  const root = process.cwd();
  const home = os.homedir();
  const short = (p: string) => (p.startsWith(home + path.sep) ? "~" + p.slice(home.length) : p);
  const run = root.split(path.sep).includes("node_modules") ? "npx github:Ikarishinji00/personal-radar" : `node ${short(path.join(root, "bin", "radar.mjs"))}`;
  // only people who moved their data folder need to tell the agent where it is
  const dataNote = path.resolve(DATA_DIR) === path.join(home, ".personal-radar") ? "" : `（我的数据目录是 ${short(DATA_DIR)}）`;
  const prompt = `运行 ${run} guide agent，按它说的帮我维护 Personal Radar${dataNote}：每天 21:30 导入新聊天、整理还没整理的消息，做完用一两句话告诉我新增了哪些要处理的事。`;
  return Response.json({ run, prompt });
}
