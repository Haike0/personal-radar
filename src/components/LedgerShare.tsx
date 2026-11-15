"use client";
import { t } from "@/lib/i18n";
import { Button, Group, Loader, Modal, Stack, Switch, Text, TextInput } from "@mantine/core";
import { IconDownload, IconShare2 } from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { daysAgo, punchline, shortTitle, tally, type LedgerData, type LedgerState } from "@/lib/ledger-view";

const W = 1080, PAD = 72;
const FONT = `"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
const C = { bg: "#FFF7EF", ink: "#1E1B26", muted: "#8C8596", line: "#F0E3D6", orange: "#FF6A3D", pink: "#FF4F86", green: "#1FA971", card: "#FFFFFF" };
const MARK: Record<LedgerState, [string, string]> = { done: ["✓", C.green], not: ["✗", C.orange], silent: ["…", C.pink], waiting: ["⏳", C.muted], skip: ["", C.muted] };

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}

/** Draw the card. Rows that weren't kept go first: that's what people want to see. The first rows carry the original words. */
function draw(cv: HTMLCanvasElement, data: LedgerData, name: string, quotes: number) {
  const ctx = cv.getContext("2d")!;
  const tl = tally(data.rows);
  const order: LedgerState[] = ["not", "silent", "done", "waiting"];
  const pick = (s: typeof tl.me) => [...s.list].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)).slice(0, 4)
    .map((r, i) => ({ ...r, said: i < quotes && r.quote ? r.quote.text.replace(/\s+/g, " ") : null }));
  const lists = [pick(tl.them), pick(tl.me)];
  const rowH = (r: { said: string | null }) => (r.said ? 116 : 72);
  const boxH = (l: { said: string | null }[]) => (l.length ? l.reduce((a, r) => a + rowH(r), 0) : 72) + 16;
  const H = Math.max(1440, 568 + 24 + boxH(lists[0]) + 70 + 24 + boxH(lists[1]) + 150);
  cv.width = W; cv.height = H;
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // soft color blobs, top right and bottom left
  const g1 = ctx.createRadialGradient(W - 80, 60, 10, W - 80, 60, 420); g1.addColorStop(0, "rgba(255,106,61,.28)"); g1.addColorStop(1, "rgba(255,106,61,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(60, H - 120, 10, 60, H - 120, 460); g2.addColorStop(0, "rgba(255,79,134,.18)"); g2.addColorStop(1, "rgba(255,79,134,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.orange; ctx.font = `700 34px ${FONT}`; ctx.fillText(t("说话算数账本"), PAD, 120);
  ctx.fillStyle = C.ink; ctx.font = `600 34px ${FONT}`; ctx.textAlign = "right"; ctx.fillText(fit(ctx, t("我 × {0}", name), 520), W - PAD, 120); ctx.textAlign = "left";

  // the score
  const bw = (W - PAD * 2 - 28) / 2, by = 168, bh = 236;
  [[t("我欠{0}", name), tl.me.owed, C.orange], [t("{0}欠我", name), tl.them.owed, C.pink]].forEach(([label, n, color], i) => {
    const x = PAD + i * (bw + 28);
    round(ctx, x, by, bw, bh, 36, C.card);
    ctx.fillStyle = C.muted; ctx.font = `600 32px ${FONT}`; ctx.fillText(fit(ctx, String(label), bw - 80), x + 40, by + 66);
    ctx.fillStyle = String(color); ctx.font = `800 120px ${FONT}`; ctx.fillText(String(n), x + 36, by + 194);
    const nw = ctx.measureText(String(n)).width;
    ctx.fillStyle = C.ink; ctx.font = `700 40px ${FONT}`; ctx.fillText(t("件"), x + 48 + nw, by + 190);
  });
  ctx.fillStyle = C.ink; ctx.font = `800 46px ${FONT}`; ctx.fillText(fit(ctx, punchline(tl.me.owed, tl.them.owed, name, tl.me.proven, tl.them.proven), W - PAD * 2), PAD, 482);

  // the two lists
  const section = (y: number, title: string, s: typeof tl.me, list: ReturnType<typeof pick>) => {
    ctx.fillStyle = C.ink; ctx.font = `700 36px ${FONT}`; ctx.fillText(title, PAD, y);
    ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(t("做到 {0} · 欠着 {1}", s.kept, s.owed), W - PAD, y); ctx.textAlign = "left";
    round(ctx, PAD, y + 24, W - PAD * 2, boxH(list), 28, C.card);
    if (!list.length) { ctx.fillStyle = C.muted; ctx.font = `500 28px ${FONT}`; ctx.fillText(t("一件都没有"), PAD + 36, y + 86); }
    let ry = y + 24 + 8;
    list.forEach((r, i) => {
      if (i) { ctx.fillStyle = C.line; ctx.fillRect(PAD + 32, ry, W - PAD * 2 - 64, 2); }
      const [mark, color] = MARK[r.state];
      ctx.beginPath(); ctx.arc(PAD + 52, ry + 36, 20, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `800 24px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(mark, PAD + 52, ry + 45); ctx.textAlign = "left";
      const when = r.state === "silent" ? t("没下文 · {0}", daysAgo(r.saidAt) ?? "") : daysAgo(r.saidAt) ?? "";
      ctx.font = `500 24px ${FONT}`; const ww = ctx.measureText(when).width;
      ctx.fillStyle = r.state === "done" ? C.muted : color; ctx.textAlign = "right"; ctx.fillText(when, W - PAD - 32, ry + 45); ctx.textAlign = "left";
      ctx.fillStyle = C.ink; ctx.font = `500 31px ${FONT}`;
      ctx.fillText(fit(ctx, shortTitle(r.title, name), W - PAD * 2 - 140 - ww), PAD + 92, ry + 47);
      if (r.said) {
        ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`;
        ctx.fillText(fit(ctx, `「${r.said}」`, W - PAD * 2 - 130), PAD + 86, ry + 90);
      }
      ry += rowH(r);
    });
    return y + 24 + boxH(list);
  };
  const end1 = section(568, t("{0}答应我的", name), tl.them, lists[0]);
  section(end1 + 70, t("我答应{0}的", name), tl.me, lists[1]);

  ctx.fillStyle = C.muted; ctx.font = `500 24px ${FONT}`;
  ctx.fillText(t("从聊天记录里翻出来的 · ReadMe"), PAD, H - 64);
  ctx.textAlign = "right"; ctx.fillText("github.com/Ikarishinji00/personal-radar", W - PAD, H - 64); ctx.textAlign = "left";
}

/** One tap: let the AI go through the promises it hasn't seen, then show the card to share or save. */
export function LedgerShare({ personKey, personName, opened, onClose }: { personKey: string; personName: string; opened: boolean; onClose: () => void }) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edited, setName] = useState<string | null>(null);
  const name = edited ?? personName;
  const [withQuotes, setWithQuotes] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const api = `/api/people/${encodeURIComponent(personKey)}/ledger`;

  const load = useCallback(async () => {
    try {
      let d = (await (await fetch(api, { cache: "no-store" })).json()) as LedgerData;
      const total = d.rows.length;
      while (d.aiReady && d.unchecked > 0) {
        setBusy(t("AI 正在翻旧账… 已看 {0}/{1} 件", total - d.unchecked, total));
        const r = (await (await fetch(api, { method: "POST" })).json()) as { checked?: number; error?: string };
        if (r.error || !r.checked) break;
        d = (await (await fetch(api, { cache: "no-store" })).json()) as LedgerData;
      }
      setData(d);
    } finally { setBusy(null); }
  }, [api]);

  useEffect(() => { if (opened) void load(); }, [opened, load]);
  useEffect(() => {
    if (!data) return;
    const c = cv.current ?? document.createElement("canvas");
    cv.current = c;
    void document.fonts?.ready.then(() => { draw(c, data, name.trim() || "TA", withQuotes ? 2 : 0); setUrl(c.toDataURL("image/png")); });
  }, [data, name, withQuotes]);

  async function blob() { return new Promise<Blob | null>((r) => cv.current?.toBlob(r, "image/png")); }
  async function share() {
    const b = await blob(); if (!b) return;
    const file = new File([b], t("说话算数账本.png"), { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: t("说话算数账本") }); return; } catch { return; } }
    save();
  }
  function save() {
    if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = t("说话算数账本-{0}.png", name || "TA"); a.click();
  }

  return (
    <Modal opened={opened} onClose={() => { setName(null); onClose(); }} title={t("说话算数账本")} radius="xl" size="md" centered>
      {busy || !data ? (
        <Stack align="center" py="xl" gap="sm"><Loader size="sm" /><Text size="sm" className="muted">{busy ?? t("正在翻你们的聊天…")}</Text></Stack>
      ) : !data.rows.length ? (
        <Text size="sm" className="muted" py="md">{t("还没从你们的聊天里找到谁答应过谁的事。先用 AI 整理一下聊天再来。")}</Text>
      ) : (
        <Stack gap="sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- a canvas data URL, nothing to optimize */}
          {url && <img src={url} alt={t("说话算数账本卡片")} style={{ width: "100%", borderRadius: 16, display: "block" }} />}
          <Group gap="sm" align="flex-end" wrap="nowrap">
            <TextInput size="xs" radius="md" label={t("卡片上怎么称呼 TA")} value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={10} style={{ flex: 1 }} />
            <Switch size="sm" color="orange" label={t("带上原话")} checked={withQuotes} onChange={(e) => setWithQuotes(e.currentTarget.checked)} mb={4} />
          </Group>
          <Group grow gap="xs">
            <Button radius="xl" color="orange" leftSection={<IconShare2 size={16} />} onClick={share}>{t("分享")}</Button>
            <Button radius="xl" variant="light" color="orange" leftSection={<IconDownload size={16} />} onClick={save}>{t("保存图片")}</Button>
          </Group>
          {!data.aiReady && data.unchecked > 0 && <Text size="xs" className="faint">{t("没设置 AI 服务，没再提起的事都先算「没下文」。")}</Text>}
          <Text component={Link} href={`/people/${encodeURIComponent(personKey)}/ledger`} size="xs" c="radar" ta="center" onClick={onClose}>{t("看完整账本，改判错的 ›")}</Text>
        </Stack>
      )}
    </Modal>
  );
}
