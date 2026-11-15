import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ph = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join(",");
test("every translation keeps the {0} {1} placeholders of its Chinese source", () => {
  for (const lang of ["zh-Hant", "ja", "en"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(Object.keys(d).length > 500, `${lang} looks empty`);
    for (const [k, v] of Object.entries(d)) {
      assert.ok(typeof v === "string" && v.trim(), `${lang}: empty translation for ${k}`);
      assert.equal(ph(v), ph(k), `${lang}: placeholders differ for ${k}`);
    }
  }
});
