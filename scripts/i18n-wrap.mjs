#!/usr/bin/env node
// One-off codemod: wrap the Chinese interface text in client code with t() so it can be translated.
//   JSX text            <Text>今天</Text>          → <Text>{t("今天")}</Text>
//   strings             label="今天" / "今天"       → label={t("今天")} / t("今天")
//   template strings    `我欠${name} ${n} 件`      → t("我欠{0} {1} 件", name, n)
// Leaves alone: imports, types, object keys, comparisons (=== "全部"), case labels, string methods'
// arguments (startsWith/replace/…), regexes, and anything already inside t(). Run tsc afterwards: places where a
// Chinese literal doubles as a type (useState<"全部" | …>) need a hand fix.
//   node scripts/i18n-wrap.mjs [files…]      (default: src/app/**/*.tsx except api, src/components/**, a few lib files)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(import.meta.url)(path.join(ROOT, "node_modules", "typescript"));
const CJK = /[一-鿿　-〿＀-￯]/;
const HAN = /[一-鿿]/;
const SKIP_CALLS = new Set(["startsWith", "endsWith", "includes", "indexOf", "lastIndexOf", "split", "replace", "replaceAll", "match", "test", "has", "get", "delete", "localeCompare", "getItem", "setItem", "removeItem", "t", "RegExp", "fetch", "post", "useApi", "querySelector"]);

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!/\/api$/.test(p)) walk(p, out); } else if (/\.tsx$/.test(f.name)) out.push(p);
  }
  return out;
}
const files = process.argv.slice(2).length ? process.argv.slice(2).map((f) => path.resolve(f)) : [
  ...walk(path.join(ROOT, "src", "app")), ...walk(path.join(ROOT, "src", "components")),
  ...["types.ts", "format.ts", "ledger-view.ts"].map((f) => path.join(ROOT, "src", "lib", f)),
].filter((f) => !/layout\.tsx$|ClientOnly\.tsx$/.test(f));

function skipped(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isTaggedTemplateExpression(p)) return true;
  if (ts.isJsxAttribute(p) && ["key", "className", "href", "id", "name"].includes(p.name.getText())) return true;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const c = p.expression;
    const name = ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : "";
    if (SKIP_CALLS.has(name) && p.expression !== node) return true;
  }
  // inside a t(...) call already
  for (let a = p; a; a = a.parent) if (ts.isCallExpression(a) && ts.isIdentifier(a.expression) && a.expression.text === "t") return true;
  return false;
}

let total = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (file.includes("/src/app/") && !/^["']use client["']/m.test(src)) { console.log(`  跳过（服务端组件）：${path.relative(ROOT, file)}`); continue; }
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = []; // { start, end, build: () => string }
  const rewrite = (start, end) => {
    // source between start and end with every edit fully inside it applied (outermost first)
    const inner = edits.filter((e) => e.start >= start && e.end <= end).sort((a, b) => a.start - b.start);
    let out = "", at = start;
    for (const e of inner) { if (e.start < at) continue; out += src.slice(at, e.start) + e.build(); at = e.end; }
    return out + src.slice(at, end);
  };
  const hasJsx = (n) => { let f = false; const go = (x) => { if (f) return; if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) f = true; else ts.forEachChild(x, go); }; go(n); return f; };
  // a JSX sentence: neighbouring text and simple {expressions} become one string, so translators see the whole thing
  const runs = (parent) => {
    const kids = parent.children;
    let i = 0;
    while (i < kids.length) {
      const ok = (k) => ts.isJsxText(k) || (ts.isJsxExpression(k) && k.expression && !hasJsx(k.expression));
      if (!ok(kids[i])) { i++; continue; }
      let j = i;
      while (j + 1 < kids.length && ok(kids[j + 1])) j++;
      const run = kids.slice(i, j + 1);
      i = j + 1;
      if (!run.some((k) => ts.isJsxText(k) && HAN.test(k.text))) continue;
      // trim whitespace-only text at both ends
      while (run.length && ts.isJsxText(run[0]) && !run[0].text.trim()) run.shift();
      while (run.length && ts.isJsxText(run[run.length - 1]) && !run[run.length - 1].text.trim()) run.pop();
      let fmt = "", args = [];
      for (const k of run) {
        if (ts.isJsxText(k)) fmt += k.text.replace(/\s*\n\s*/g, " ");
        else if (ts.isStringLiteral(k.expression) && !HAN.test(k.expression.text)) fmt += k.expression.text; // {" "}
        else { fmt += `{${args.length}}`; args.push(k.expression); }
      }
      const lead = fmt.match(/^\s*/)[0], trail = fmt.match(/\s*$/)[0];
      const core = fmt.trim();
      const first = run[0], last = run[run.length - 1];
      const start = ts.isJsxText(first) ? first.getStart(sf) + (first.getText(sf).length - first.getText(sf).trimStart().length) : first.getStart(sf);
      const end = ts.isJsxText(last) ? last.getEnd() - (last.getText(sf).length - last.getText(sf).trimEnd().length) : last.getEnd();
      const keepLead = lead && !/\n/.test(lead) ? lead : "", keepTrail = trail && !/\n/.test(trail) ? trail : "";
      const a = args;
      edits.push({ start, end, build: () => `${keepLead ? "{" + JSON.stringify(keepLead) + "}" : ""}{t(${JSON.stringify(core)}${a.map((e) => ", " + rewrite(e.getStart(sf), e.getEnd())).join("")})}${keepTrail ? "{" + JSON.stringify(keepTrail) + "}" : ""}` });
    }
  };
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) runs(node);
    if (ts.isJsxText(node)) {
      // handled by runs()
    } else if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && HAN.test(node.text) && !skipped(node)) {
      const call = `t(${JSON.stringify(node.text)})`;
      const inAttr = ts.isJsxAttribute(node.parent);
      edits.push({ start: node.getStart(sf), end: node.getEnd(), build: () => (inAttr ? `{${call}}` : call) });
    } else if (ts.isTemplateExpression(node) && (HAN.test(node.head.text) || node.templateSpans.some((s) => HAN.test(s.literal.text))) && !skipped(node)) {
      let fmt = node.head.text;
      node.templateSpans.forEach((s, i) => { fmt += `{${i}}` + s.literal.text; });
      const spans = node.templateSpans;
      edits.push({ start: node.getStart(sf), end: node.getEnd(), build: () => `t(${JSON.stringify(fmt)}, ${spans.map((s) => rewrite(s.expression.getStart(sf), s.expression.getEnd())).join(", ")})` });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let out = rewrite(0, src.length);
  if (!/import \{[^}]*\bt\b[^}]*\} from "@\/lib\/i18n"/.test(out)) {
    const m = out.match(/^(["']use client["'];?\s*\n)/);
    const imp = 'import { t } from "@/lib/i18n";\n';
    out = m ? m[1] + imp + out.slice(m[1].length) : imp + out;
  }
  fs.writeFileSync(file, out);
  total += edits.length;
  console.log(`${String(edits.length).padStart(4)}  ${path.relative(ROOT, file)}`);
}
console.log(`共 ${total} 处`);
void CJK;
