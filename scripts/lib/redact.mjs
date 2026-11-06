// What leaves the computer goes through here first: everything sent to the AI provider (organizing, person analysis,
// questions, day summaries) is redacted at the last step before the request, and the preview shows the same result.
// The chat databases themselves are never changed.

/** Redaction rule groups. `on` = default for new installs. */
export const RULE_GROUPS = [
  { id: "secrets", label: "密码与密钥", hint: "API Key、Bearer Token、私钥", on: true },
  { id: "contact", label: "邮箱与电话", hint: "邮箱、手机号、座机", on: true },
  { id: "finance", label: "银行卡与信用卡", hint: "13–19 位卡号（通过校验位判断）", on: true },
  { id: "ids", label: "证件号", hint: "中国大陆身份证、护照号", on: true },
  { id: "network", label: "链接与 IP", hint: "链接只保留网站域名，IP 地址整段替换", on: true },
];

const luhn = (digits) => {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
};

const RULES = {
  secrets: [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[私钥]"],
    [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, "[密钥]"],
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [令牌]"],
    [/\b(?:ghp|gho|github_pat|xox[abpr])_[A-Za-z0-9_]{16,}\b/g, "[令牌]"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "[密钥]"],
  ],
  contact: [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[邮箱]"],
    [/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g, "[手机号]"], // mainland China mobile
    [/(?<!\d)(?:\+81[-\s]?|0)[789]0[-\s]?\d{4}[-\s]?\d{4}(?!\d)/g, "[手机号]"],   // Japan mobile
    [/(?<!\d)0\d{1,4}-\d{1,4}-\d{4}(?!\d)/g, "[电话]"],                           // Japan / China landline with dashes
    [/(?<![\w])\+\d{1,3}[-\s]?\d{2,4}[-\s]?\d{3,4}[-\s]?\d{3,4}(?!\d)/g, "[电话]"], // international
  ],
  finance: [
    [/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g, (m) => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d) ? "[卡号]" : m; }],
  ],
  ids: [
    [/(?<![\dA-Za-z])[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![\dA-Za-z])/g, "[身份证号]"],
    [/(?<![A-Za-z0-9])[EeGgDdSsPpHh][A-Za-z]?\d{7,8}(?![A-Za-z0-9])/g, "[护照号]"],
  ],
  network: [
    [/\bhttps?:\/\/([^\s/?#:]+)[^\s]*/gi, (_m, host) => `[链接 ${host.replace(/^www\./i, "")}]`],
    [/(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g, "[IP]"],
  ],
};

/** Parse the stored settings (JSON strings) into a redactor config. */
export function privacyConfig(get) {
  const parse = (k, fallback) => { try { const v = JSON.parse(get(k) ?? ""); return Array.isArray(v) ? v : fallback; } catch { return fallback; } };
  return {
    groups: new Set(parse("privacy_rules", RULE_GROUPS.filter((g) => g.on).map((g) => g.id))),
    keywords: parse("privacy_keywords", []).map((k) => String(k).trim()).filter(Boolean),
    custom: parse("privacy_custom", []).filter((r) => r && r.pattern),
    excluded: new Set(parse("ai_excluded", []).map(String)),
  };
}

/** Replace sensitive values in one piece of text. */
export function redactText(text, cfg) {
  let out = String(text ?? "");
  for (const g of cfg.groups) for (const [re, rep] of RULES[g] ?? []) out = out.replace(re, rep);
  for (const r of cfg.custom) {
    try { out = out.replace(new RegExp(r.pattern, "g"), r.replace || "[已隐藏]"); } catch { /* invalid user regex: skip */ }
  }
  return out;
}

/** Drop every line that contains a blacklisted keyword, then redact the rest. Returns the text and how many lines were dropped. */
export function outbound(text, cfg) {
  if (!cfg.keywords.length) return { text: redactText(text, cfg), dropped: 0 };
  let dropped = 0;
  const kept = String(text ?? "").split("\n").filter((line) => {
    const hit = cfg.keywords.some((k) => line.includes(k));
    if (hit) dropped++;
    return !hit;
  });
  return { text: redactText(kept.join("\n"), cfg), dropped };
}
