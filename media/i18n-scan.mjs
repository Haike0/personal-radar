// Walk every page in English and Japanese with the demo data and list text that is still Chinese.
//   BASE=http://127.0.0.1:3240 node media/i18n-scan.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://127.0.0.1:3240";
const P = "demo_xiaoyu";
const PAGES = ["/", "/people", `/people/${P}`, `/people/${P}/ledger`, `/people/${P}/report`, `/people/${P}/chats`, "/timeline", "/companion", "/settings", "/settings/sources", "/settings/ai", "/welcome", "/import", "/items"];
// rough filter: mostly simplified forms Japanese does not use, but a few shared kanji slip in (恋, 来…), so read the list by eye
const ZH_ONLY = /[们这说话么时没还对过请让给发现记录关系联系认识题问页设置导数据该吗呢啊吧经开头买卖两边进远运选这样里们个为义乐习书买亲产众优传伤伦体儿兴写军农冲决况净几击创别动务区医单卖历压厅县参双变叶号后吗听启员呢响团围图场块坚坏坛处备复够头夹奋妈学宁宝实宠审宽对导将尔尝层岁岛币带帮库应庙废广开张弯录忆态总恋恶悬惊惯戏战户执扩扫扬换据掷摄无旧时显晒机杂权条来杨极构枪树样档桥检楼毕气汇汉汤沟没泪洁浅测济浓涂润涨渐温湿满滞灭灯灵炼烂烟热爱爷牵犹状犹狮献环现电画畅疗盘监盖着矿码确础离种积称稳穷窃竞笔筑签简类纠红约级纪纲纳线练组细织终经结给绝统绩维综绿缘编缩网罗罚职联聪肠肤胁胆脑脚脱腊舰艺节芦苏苹范荐荣药获莱萝蓝虑虽虾补规视览觉触誉计订认讨让训议讯记讲许论设访证评识诉诊词译试诗诚话询该详语误说请诸读谁调谈谋谓谜谢谨贝负责败货质购贴贵贷费贸资赏赔赖赛赵趋跃践踪轨转轮软轻载较辆辈辑输辞边达迁过运还这进远违连迟适选递逻遗邮邻郑释针钟钢钱钻铁铃铜铺链销锁锅锋锐错键镇长门闪闭问闲间闷闹闻阅队阳阴阶际陆陈险随隐隶难雾静顶项顺须顾顿预领频题颜额风飞饭饮饰饱馆首驾驶骑验骤鱼鲜鸡鸣鸭麦黄齐龄龙]/;
const browser = await chromium.launch();
await fetch(BASE + "/api/onboarding", { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ state: "demo", demo_set: "love" }) });
for (const lang of ["en", "ja"]) {
  await fetch(BASE + "/api/settings", { method: "PATCH", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ mode: "demo", demo_set: "love", ui_lang: lang }) });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: lang });
  await ctx.addInitScript((l) => localStorage.setItem("radar.lang", l), lang);
  const page = await ctx.newPage();
  for (const url of PAGES) {
    const r = await page.goto(BASE + url, { waitUntil: "networkidle" }).catch(() => null);
    if (!r || r.status() >= 400) continue;
    await page.waitForTimeout(700);
    const lines = (await page.evaluate(() => document.body.innerText)).split("\n").map((s) => s.trim()).filter(Boolean);
    const bad = [...new Set(lines.filter((s) => (lang === "en" ? /[一-鿿]/ : ZH_ONLY).test(s)))];
    if (bad.length) console.log(`\n[${lang}] ${url}\n  ` + bad.slice(0, 25).map((s) => s.slice(0, 90)).join("\n  "));
  }
  await ctx.close();
}
await browser.close();
