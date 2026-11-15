"use client";
import { t } from "@/lib/i18n";
import { Badge, Button, Group, SegmentedControl, Stack, Text, useMantineColorScheme, type MantineColorScheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDeviceMobile, IconMoon, IconShare2, IconSun } from "@tabler/icons-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useApi } from "@/lib/client";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push-client";
import type { Health } from "@/lib/health";

/** Light / dark / follow the phone. Saved on this device (no flash on launch: Mantine's head script reads it first). */
export function AppearanceControl() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedControl fullWidth radius="xl" value={colorScheme} onChange={(v) => setColorScheme(v as MantineColorScheme)}
      data={[
        { value: "auto", label: <Group gap={6} justify="center" wrap="nowrap"><IconDeviceMobile size={15} />{t("跟随系统")}</Group> },
        { value: "light", label: <Group gap={6} justify="center" wrap="nowrap"><IconSun size={15} />{t("浅色")}</Group> },
        { value: "dark", label: <Group gap={6} justify="center" wrap="nowrap"><IconMoon size={15} />{t("深色")}</Group> },
      ]} />
  );
}

type PushInfo = { devices: number; sentToday: number; recent: { kind: string; title: string; at: string; sent: number }[] };
const KIND: Record<string, string> = { due: t("到期"), snooze: t("延后到期"), overdue: t("逾期"), digest: t("每日摘要") };

/** Turn this phone's notifications on/off, send a test, see what was sent recently. */
export function PushControl() {
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, reload } = useApi<PushInfo>("/api/push");
  useEffect(() => { pushState().then(setSt).catch(() => setSt({ kind: "unsupported", reason: "browser" })); }, []);

  async function run(name: string, f: () => Promise<void>) {
    setBusy(name);
    try { await f(); } catch (e) { notifications.show({ color: "red", radius: "lg", message: (e as Error).message }); } finally { setBusy(null); reload(); }
  }
  const on = () => run("on", async () => {
    const s = await enablePush();
    setSt(s);
    if (s.kind === "on") notifications.show({ radius: "lg", message: t("这台设备的通知已开启") });
  });
  const off = () => run("off", async () => { setSt(await disablePush()); });
  const test = () => run("test", async () => {
    if (st?.kind !== "on") return;
    const r = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: st.endpoint }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    notifications.show({ radius: "lg", message: t("已发出，几秒内会收到（App 开着时也会显示在通知中心）") });
  });

  const badge = !st ? <Badge color="gray">{t("检查中")}</Badge>
    : st.kind === "on" ? <Badge color="teal">{t("已开启")}</Badge>
    : st.kind === "denied" ? <Badge color="red">{t("已拒绝")}</Badge>
    : st.kind === "unsupported" ? <Badge color="gray">{st.reason === "needs-install" ? t("需先装到主屏幕") : t("此浏览器不支持")}</Badge>
    : <Badge color="gray">{t("未开启")}</Badge>;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap" gap="md">
        <div style={{ minWidth: 0 }}>
          <Text size="sm">{t("这台设备的通知")}</Text>
          <Text size="xs" className="faint">{data ? t("已接收通知的设备 {0} 台 · 今天已推送 {1} 条", data.devices, data.sentToday) : " "}</Text>
        </div>
        {badge}
      </Group>

      {st?.kind === "unsupported" && st.reason === "needs-install" && (
        <Stack gap={6} className="hint-box">
          <Text size="sm" fw={600}>{t("iPhone 只给主屏幕上的 App 发通知")}</Text>
          <Text size="xs" className="muted" lh={1.7}>
            {" "}{t("1. 在 Safari 里点底部的")}{" "} <IconShare2 size={13} style={{ verticalAlign: -2 }} /> {" "}{t("分享按钮 → 「添加到主屏幕」")}<br />
            {" "}{t("2. 从主屏幕的 Radar 图标打开（不要再用 Safari）")}<br />
            {" "}{t("3. 回到「设置」点「开启通知」，在弹窗里选「允许」")}{" "}
          </Text>
        </Stack>
      )}
      {st?.kind === "unsupported" && st.reason === "browser" && <Text size="xs" className="faint">{t("这个浏览器不支持网页推送。iPhone 请用主屏幕上的 Radar 打开。")}</Text>}
      {st?.kind === "denied" && (
        <Text size="xs" c="orange" lh={1.7}>{t("之前选了「不允许」，网页没法再弹窗询问。请到 iPhone「设置 → 通知 → Radar」打开「允许通知」，再回来点「重新检查」。")}</Text>
      )}

      <Group gap="xs">
        {(st?.kind === "off") && <Button size="sm" onClick={on} loading={busy === "on"}>{t("开启通知")}</Button>}
        {st?.kind === "denied" && <Button size="sm" variant="light" onClick={() => pushState().then(setSt)}>{t("重新检查")}</Button>}
        {st?.kind === "on" && <>
          <Button size="sm" variant="light" onClick={test} loading={busy === "test"}>{t("发送测试通知")}</Button>
          <Button size="sm" variant="subtle" color="gray" onClick={off} loading={busy === "off"}>{t("关闭")}</Button>
        </>}
      </Group>

      {!!data?.recent.length && (
        <Stack gap={4} mt={4}>
          <Text size="xs" className="faint">{t("最近推送")}</Text>
          {data.recent.map((r, i) => (
            <Group key={i} gap={8} wrap="nowrap">
              <Text size="xs" className="faint tabular" style={{ flex: "none" }}>{r.at.slice(5, 16)}</Text>
              <Text size="xs" className="muted" truncate>{KIND[r.kind] ?? r.kind} · {r.title}</Text>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** 数据健康: import, AI organizing and your checking, per person, kept as separate kinds of progress. */
export function DataHealth() {
  const { data: h } = useApi<Health>("/api/health");
  if (!h) return <Text size="xs" className="faint">{t("检查中…")}</Text>;
  const r = h.review;
  const checked = r.accepted + r.rejected;
  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap" gap="md">
        <div><Text size="sm">{t("① 导入聊天")}</Text><Text size="xs" className="faint">{t("npm run import -- &lt;导出文件&gt;")}</Text></div>
        <Badge color={h.sync.ok ? "teal" : h.sync.ok === false ? "red" : "gray"} style={{ flex: "none" }}>{h.sync.at ? `${h.sync.at.slice(5, 16).replace("T", " ")}${h.sync.ok ? t(" 成功") : t(" 失败")}` : t("无记录")}</Badge>
      </Group>
      {h.sync.ok === false && <Text size="xs" c="red">{h.sync.error}</Text>}
      <Stack gap={6}>
        <Text size="sm">{t("② AI 整理（把聊天变成记录）")}</Text>
        {h.people.map((p) => (
          <Group key={p.key} justify="space-between" wrap="nowrap" gap="sm">
            <Text size="xs" className="muted" style={{ minWidth: 0 }}>{p.name}{p.analysisAt ? t(" · 人物分析 {0}", p.analysisAt.slice(5, 10)) : ""}</Text>
            <Badge size="sm" color={p.remaining ? "orange" : p.remaining === 0 ? "teal" : "gray"} style={{ flex: "none" }}>
              {p.remaining == null ? t("未开始") : p.remaining ? t("还差 {0} 条", p.remaining) : t("已到最新")}</Badge>
          </Group>
        ))}
        {!h.people.length && <Text size="xs" className="faint">{t("演示数据没有整理进度")}</Text>}
      </Stack>
      <Stack gap={6}>
        <Text size="sm">{t("③ 你的核对")}</Text>
        <Text size="xs" className="muted" lh={1.6}>{t("行动类还有 {0} 条没核对，关于对方的信息还有 {1} 条没看过。已核对 {2} 条{3}。", r.actionPending, r.knowledgePending, checked, checked ? t("，其中 {0} 条识别错（准确率 {1}%）", r.rejected, Math.round((100 * r.accepted) / checked)) : "")}</Text>
        {r.byKind.filter((k) => k.accepted + k.rejected >= 3).map((k) => (
          <Text key={k.kind} size="xs" className="faint">{t("{0}：核对 {1} 条，准确率 {2}%", k.label, k.accepted + k.rejected, Math.round((100 * k.accepted) / (k.accepted + k.rejected)))}</Text>
        ))}
        {checked < 20 && <Text size="xs" className="faint">{t("核对满 20 条以后，这里的准确率才有参考价值。")}</Text>}
      </Stack>
    </Stack>
  );
}

const glassSubscribe = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
/** How see-through the bottom bar and AI button are. Saved on this device. */
export function GlassControl() {
  // read from localStorage after hydration (the server always renders "适中")
  const stored = useSyncExternalStore(glassSubscribe, () => { try { return localStorage.getItem("radar-glass") || "normal"; } catch { return "normal"; } }, () => "normal");
  const [picked, setV] = useState<string | null>(null);
  const v = picked ?? stored;
  const set = (x: string) => {
    setV(x);
    try { if (x === "normal") localStorage.removeItem("radar-glass"); else localStorage.setItem("radar-glass", x); } catch {}
    if (x === "normal") delete document.documentElement.dataset.glass; else document.documentElement.dataset.glass = x;
  };
  return (
    <SegmentedControl fullWidth radius="xl" value={v} onChange={set}
      data={[{ value: "clear", label: t("通透") }, { value: "normal", label: t("适中") }, { value: "solid", label: t("不透明") }]} />
  );
}
