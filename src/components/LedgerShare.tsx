"use client";
import { Button, Group, Loader, Modal, Stack, Text, TextInput } from "@mantine/core";
import { IconDownload, IconShare2 } from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { daysAgo, punchline, shortTitle, tally, type LedgerData, type LedgerState } from "@/lib/ledger-view";

const W = 1080, H = 1440, PAD = 72;
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

/** Draw the card. Rows that weren't kept go first: that's what people want to see. */
function draw(cv: HTMLCanvasElement, data: LedgerData, name: string) {
  const ctx = cv.getContext("2d")!;
  cv.width = W; cv.height = H;
  const t = tally(data.rows);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  // soft color blobs, top right and bottom left
  const g1 = ctx.createRadialGradient(W - 80, 60, 10, W - 80, 60, 420); g1.addColorStop(0, "rgba(255,106,61,.28)"); g1.addColorStop(1, "rgba(255,106,61,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(60, H - 120, 10, 60, H - 120, 460); g2.addColorStop(0, "rgba(255,79,134,.18)"); g2.addColorStop(1, "rgba(255,79,134,0)");
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.orange; ctx.font = `700 34px ${FONT}`; ctx.fillText("说话算数账本", PAD, 120);
  ctx.fillStyle = C.ink; ctx.font = `600 34px ${FONT}`; ctx.textAlign = "right"; ctx.fillText(fit(ctx, `我 × ${name}`, 520), W - PAD, 120); ctx.textAlign = "left";

  // the score
  const bw = (W - PAD * 2 - 28) / 2, by = 168, bh = 236;
  [[`我欠${name}`, t.me.owed, C.orange], [`${name}欠我`, t.them.owed, C.pink]].forEach(([label, n, color], i) => {
    const x = PAD + i * (bw + 28);
    round(ctx, x, by, bw, bh, 36, C.card);
    ctx.fillStyle = C.muted; ctx.font = `600 32px ${FONT}`; ctx.fillText(fit(ctx, String(label), bw - 80), x + 40, by + 66);
    ctx.fillStyle = String(color); ctx.font = `800 120px ${FONT}`; ctx.fillText(String(n), x + 36, by + 194);
    const nw = ctx.measureText(String(n)).width;
    ctx.fillStyle = C.ink; ctx.font = `700 40px ${FONT}`; ctx.fillText("件", x + 48 + nw, by + 190);
  });
  ctx.fillStyle = C.ink; ctx.font = `800 46px ${FONT}`; ctx.fillText(fit(ctx, punchline(t.me.owed, t.them.owed, name), W - PAD * 2), PAD, 482);

  // the two lists
  const order: LedgerState[] = ["not", "silent", "done", "waiting"];
  const section = (y: number, title: string, s: typeof t.me, rows: number) => {
    ctx.fillStyle = C.ink; ctx.font = `700 36px ${FONT}`; ctx.fillText(title, PAD, y);
    ctx.fillStyle = C.muted; ctx.font = `500 26px ${FONT}`; ctx.textAlign = "right";
    ctx.fillText(`做到 ${s.kept} · 欠着 ${s.owed}`, W - PAD, y); ctx.textAlign = "left";
    const list = [...s.list].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)).slice(0, rows);
    round(ctx, PAD, y + 24, W - PAD * 2, Math.max(1, list.length) * 72 + 16, 28, C.card);
    if (!list.length) { ctx.fillStyle = C.muted; ctx.font = `500 28px ${FONT}`; ctx.fillText("一件都没有", PAD + 36, y + 86); }
    list.forEach((r, i) => {
      const ry = y + 24 + 8 + i * 72;
      if (i) { ctx.fillStyle = C.line; ctx.fillRect(PAD + 32, ry, W - PAD * 2 - 64, 2); }
      const [mark, color] = MARK[r.state];
      ctx.beginPath(); ctx.arc(PAD + 52, ry + 36, 20, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `800 24px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(mark, PAD + 52, ry + 45); ctx.textAlign = "left";
      const when = r.state === "silent" ? `没下文 · ${daysAgo(r.saidAt) ?? ""}` : daysAgo(r.saidAt) ?? "";
      ctx.font = `500 24px ${FONT}`; const ww = ctx.measureText(when).width;
      ctx.fillStyle = r.state === "done" ? C.muted : color; ctx.textAlign = "right"; ctx.fillText(when, W - PAD - 32, ry + 45); ctx.textAlign = "left";
      ctx.fillStyle = C.ink; ctx.font = `500 31px ${FONT}`;
      ctx.fillText(fit(ctx, shortTitle(r.title, name), W - PAD * 2 - 140 - ww), PAD + 92, ry + 47);
    });
    return y + 24 + Math.max(1, list.length) * 72 + 16;
  };
  const per = 4;
  const end1 = section(568, `${name}答应我的`, t.them, per);
  section(end1 + 70, `我答应${name}的`, t.me, per);

  ctx.fillStyle = C.muted; ctx.font = `500 24px ${FONT}`;
  ctx.fillText("从聊天记录里翻出来的 · Personal Radar", PAD, H - 64);
  ctx.textAlign = "right"; ctx.fillText("github.com/Ikarishinji00/personal-radar", W - PAD, H - 64); ctx.textAlign = "left";
}

/** One tap: let the AI go through the promises it hasn't seen, then show the card to share or save. */
export function LedgerShare({ personKey, personName, opened, onClose }: { personKey: string; personName: string; opened: boolean; onClose: () => void }) {
  const [data, setData] = useState<LedgerData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [edited, setName] = useState<string | null>(null);
  const name = edited ?? personName;
  const [url, setUrl] = useState<string | null>(null);
  const cv = useRef<HTMLCanvasElement | null>(null);
  const api = `/api/people/${encodeURIComponent(personKey)}/ledger`;

  const load = useCallback(async () => {
    try {
      let d = (await (await fetch(api, { cache: "no-store" })).json()) as LedgerData;
      const total = d.rows.length;
      while (d.aiReady && d.unchecked > 0) {
        setBusy(`AI 正在翻旧账… 已看 ${total - d.unchecked}/${total} 件`);
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
    void document.fonts?.ready.then(() => { draw(c, data, name.trim() || "TA"); setUrl(c.toDataURL("image/png")); });
  }, [data, name]);

  async function blob() { return new Promise<Blob | null>((r) => cv.current?.toBlob(r, "image/png")); }
  async function share() {
    const b = await blob(); if (!b) return;
    const file = new File([b], "说话算数账本.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "说话算数账本" }); return; } catch { return; } }
    save();
  }
  function save() {
    if (!url) return;
    const a = document.createElement("a"); a.href = url; a.download = `说话算数账本-${name || "TA"}.png`; a.click();
  }

  return (
    <Modal opened={opened} onClose={() => { setName(null); onClose(); }} title="说话算数账本" radius="xl" size="md" centered>
      {busy || !data ? (
        <Stack align="center" py="xl" gap="sm"><Loader size="sm" /><Text size="sm" className="muted">{busy ?? "正在翻你们的聊天…"}</Text></Stack>
      ) : !data.rows.length ? (
        <Text size="sm" className="muted" py="md">还没从你们的聊天里找到谁答应过谁的事。先用 AI 整理一下聊天再来。</Text>
      ) : (
        <Stack gap="sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- a canvas data URL, nothing to optimize */}
          {url && <img src={url} alt="说话算数账本卡片" style={{ width: "100%", borderRadius: 16, display: "block" }} />}
          <TextInput size="xs" radius="md" label="卡片上怎么称呼 TA" value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={10} />
          <Group grow gap="xs">
            <Button radius="xl" color="orange" leftSection={<IconShare2 size={16} />} onClick={share}>分享</Button>
            <Button radius="xl" variant="light" color="orange" leftSection={<IconDownload size={16} />} onClick={save}>保存图片</Button>
          </Group>
          {!data.aiReady && data.unchecked > 0 && <Text size="xs" className="faint">没设置 AI 服务，没再提起的事都先算「没下文」。</Text>}
          <Text component={Link} href={`/people/${encodeURIComponent(personKey)}/ledger`} size="xs" c="radar" ta="center" onClick={onClose}>看完整账本，改判错的 ›</Text>
        </Stack>
      )}
    </Modal>
  );
}
