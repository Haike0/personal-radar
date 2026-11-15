// What language the AI should write in: the interface language (Settings → 外观与语言). Chinese prompts already say
// Chinese, so Simplified Chinese adds nothing; the others get one line appended to the system prompt.
const RULE = {
  "zh-Hant": "\n\n【輸出語言】所有要給用戶看的文字（標題、說明、理由、分析、回答）一律用繁體中文（台灣用語）寫。引用的聊天原話保持原文。",
  ja: "\n\n【出力言語】ユーザーに見せる文章（タイトル、説明、理由、分析、回答）はすべて自然な日本語で書く。チャットの原文の引用は原文のまま。",
  en: "\n\n[Output language] Write everything the user will read (titles, summaries, reasons, analysis, answers) in natural English. Keep quoted chat messages in their original language.",
};
export const langRule = (lang) => RULE[lang] ?? "";
