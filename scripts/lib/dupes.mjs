// Which records might be the same thing written twice? Decided mechanically first, so a model can only confirm pairs,
// never lump different things together ("周四吃烤肉" and "周六吃火锅" are not a pair: different dates).
//   same kind · same facet (for profile facts) · same date or both undated · titles share enough wording

const bigrams = (t) => {
  const s = String(t).replace(/[\s，。、！？!?,.「」“”"'：:（）()·\-]/g, "").replace(/^(小|老|阿)?[一-鿿]{1,2}(说|要求|请我|让我|希望)?/, "");
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
};
export function similarity(a, b) {
  const x = bigrams(a), y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return n / Math.min(x.size, y.size);
}

/** items: [{id, kind, facet, date, title}] → [[a, b, score]] sorted by score */
export function candidatePairs(items, min = 0.34) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.kind !== b.kind) continue;
    if ((a.facet ?? null) !== (b.facet ?? null)) continue;
    if ((a.date ?? null) !== (b.date ?? null)) continue;
    const s = similarity(a.title, b.title);
    if (s >= min) pairs.push([a, b, Math.round(s * 100) / 100]);
  }
  return pairs.sort((p, q) => q[2] - p[2]);
}
