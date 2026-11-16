// Xiaohongshu cut (Chinese, portrait): a story instead of a feature tour.
//   00:47, she: "you said you'd call at ten, I fell asleep waiting" → he panics → ReadMe → back to that evening, a reminder at 21:50
//   → he calls on time → not just her → it all lands in the calendar → quick cuts of Today / profiles / ledger / apps
//   → a lock closes: your chats stay on your computer → logo + GitHub
// Every scene is one or two bars of the music (bgm.mjs: 128 BPM, a bar starts on the logo at 4 s), so cuts land on the beat.
// Every chat line here is made up for the film; nothing comes from a real conversation.
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, Ledger, Phone } from "./Film";

const FONT = `-apple-system, "SF Pro Display", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
const WRAP = { wordBreak: "keep-all", overflowWrap: "anywhere" } as const;
const BLUE = "#2f7bf6", RED = "#ff3b6b", GREEN = "#22c55e", INK = "#111318", GREY = "#5d6370";

// the music's beat grid: 128 BPM, shifted so a bar starts on the logo (frame 120)
const BEATF = (30 * 60) / 128, BARF = BEATF * 4, GRID0F = 120 - 2 * BARF;
// scene table (frames): each scene is a whole number of bars
const T: Record<string, readonly [number, number]> = (() => {
  const s: Record<string, readonly [number, number]> = { ask: [0, 120] };
  let t = 120;
  for (const [k, n] of [["brand", 1], ["remind", 2], ["call", 1], ["more", 1], ["cal", 2], ["today", 1], ["person", 1], ["ledger", 2], ["apps", 1]] as const) {
    s[k] = [Math.round(t), Math.round(t + n * BARF)]; t += n * BARF;
  }
  s.safe = [Math.round(t), 1110];
  return s;
})();
export const SS = T;
export const STORY_TOTAL = 1110;
const len = (k: string) => T[k][1] - T[k][0];
/** local frame of the nth beat inside a scene */
const beat = (k: string, n: number) => GRID0F + (Math.ceil((T[k][0] - GRID0F) / BEATF - 1e-6) + n) * BEATF - T[k][0];

// motion: no bounce anywhere. Things ease out (fast start, long soft landing), like a well-made app's own UI.
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const ramp = (f: number, at: number, dur: number) => interpolate(f, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: OUT });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const usePop = (at: number, _stiff?: number, dur = 16) => ramp(useCurrentFrame(), at, dur);
const useEase = (at: number) => ramp(useCurrentFrame(), at, 18);

/** Every scene whips in from the right on its first frames and out to the left on its last few. */
const Cut: React.FC<{ k: string; children: React.ReactNode; pad?: boolean }> = ({ k, children, pad = true }) => {
  const f = useCurrentFrame();
  const L = len(k);
  const enter = ramp(f, 0, 14);
  const out = interpolate(f, [L - 7, L], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const drift = 1 + 0.018 * (f / L); // a slow push-in, like a camera
  return (
    <AbsoluteFill style={{ padding: pad ? "150px 60px 0" : 0, opacity: enter * (1 - out),
      transform: `translateY(${(1 - enter) * 28}px) scale(${(0.985 + 0.015 * enter) * drift})` }}>{children}</AbsoluteFill>
  );
};

const Avatar: React.FC<{ e: string; bg: string; size?: number }> = ({ e, bg, size = 92 }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, flex: "none", display: "grid", placeItems: "center", fontSize: size * 0.58, background: bg }}>{e}</div>
);
const Bubble: React.FC<{ me?: boolean; at: number; children: React.ReactNode; big?: boolean; face?: string }> = ({ me, at, children, big, face }) => {
  const s = usePop(at);
  if (s <= 0.001) return null;
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 18, opacity: s, transform: `translateY(${(1 - s) * 24}px) scale(${0.97 + s * 0.03})`, transformOrigin: me ? "right bottom" : "left bottom" }}>
      {!me && <Avatar e={face ?? "😤"} bg="#ffe1ea" />}
      <div style={{ padding: big ? "28px 38px" : "24px 34px", borderRadius: 38, borderBottomLeftRadius: me ? 38 : 10, borderBottomRightRadius: me ? 10 : 38, maxWidth: big ? 840 : 740,
        fontSize: big ? 56 : 50, fontWeight: big ? 850 : 700, lineHeight: 1.3, color: me ? "#fff" : INK, background: me ? BLUE : "#fff", boxShadow: "0 16px 36px -18px rgba(20,24,40,.35)" }}>{children}</div>
      {me && <Avatar e={face ?? "😰"} bg="#dfeaff" />}
    </div>
  );
};
const Typing: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const f = useCurrentFrame();
  if (f < from || f >= to) return null;
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 18, alignItems: "flex-end" }}>
      <div style={{ padding: "26px 34px", borderRadius: 38, borderBottomRightRadius: 10, background: "#dfe9fb", display: "flex", gap: 12 }}>
        {[0, 1, 2].map((k) => <i key={k} style={{ width: 16, height: 16, borderRadius: 8, background: BLUE, opacity: 0.35 + 0.65 * Math.abs(Math.sin((f - from) / 4 + k)), display: "block" }} />)}
      </div>
      <Avatar e="😰" bg="#dfeaff" />
    </div>
  );
};
const Title: React.FC<{ at?: number; children: React.ReactNode; tag?: string; color?: string; size?: number }> = ({ at = 0, children, tag, color, size = 76 }) => {
  const s = useEase(at);
  const t = usePop(at + 3);
  return (
    <div style={{ textAlign: "center" }}>
      {tag && <div style={{ display: "inline-block", padding: "10px 28px", borderRadius: 999, background: color ?? RED, color: "#fff", fontSize: 38, fontWeight: 800, letterSpacing: 2, marginBottom: 22, opacity: t, transform: `translateY(${(1 - t) * 12}px)` }}>{tag}</div>}
      <div style={{ fontSize: size, fontWeight: 900, lineHeight: 1.15, color: INK, letterSpacing: -1, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>{children}</div>
    </div>
  );
};
const Notif: React.FC<{ at: number; head: string; body: string; when?: string }> = ({ at, head, body, when = "现在" }) => {
  const s = usePop(at);
  if (s <= 0.001) return null;
  return (
    <div style={{ padding: "22px 24px", borderRadius: 34, background: "rgba(255,255,255,.88)", opacity: s, transform: `translateY(${(1 - s) * -36}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Img src={staticFile("icon.png")} style={{ width: 46, height: 46, borderRadius: 12 }} />
        <div style={{ fontSize: 26, fontWeight: 700, color: GREY }}>ReadMe</div>
        <div style={{ marginLeft: "auto", fontSize: 24, color: "#8a90a0" }}>{when}</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 36, fontWeight: 850, color: INK, lineHeight: 1.25 }}>{head}</div>
      <div style={{ marginTop: 6, fontSize: 27, color: GREY, lineHeight: 1.4 }}>{body}</div>
    </div>
  );
};
/** An iPhone with real proportions (the same frame as the screenshots), showing a lock screen. */
const LockPhone: React.FC<{ w: number; time: string; date: string; children?: React.ReactNode }> = ({ w, time, date, children }) => {
  const h = w * 2.06, pad = w * 0.032;
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.155, background: "#0d0d10", padding: pad, boxShadow: "0 0 0 3px #2a2a30 inset, 0 60px 120px -40px rgba(15,17,21,.45)", position: "relative" }}>
      <div style={{ position: "absolute", top: pad + w * 0.03, left: "50%", transform: "translateX(-50%)", width: w * 0.27, height: w * 0.078, borderRadius: 99, background: "#000", zIndex: 3 }} />
      <div style={{ width: "100%", height: "100%", borderRadius: w * 0.125, overflow: "hidden", position: "relative", background: "linear-gradient(170deg, #2b2f6b 0%, #5b4bd6 50%, #c06c9c 100%)" }}>
        <div style={{ textAlign: "center", color: "rgba(255,255,255,.9)", marginTop: w * 0.2, fontSize: w * 0.055, fontWeight: 600 }}>{date}</div>
        <div style={{ textAlign: "center", color: "#fff", fontSize: w * 0.27, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>{time}</div>
        <div style={{ position: "absolute", left: w * 0.04, right: w * 0.04, top: w * 0.68 }}>{children}</div>
      </div>
    </div>
  );
};

// 1. 00:47, the question
const AskBody: React.FC = () => (
  <AbsoluteFill>
    <Backdrop />
    <AbsoluteFill style={{ padding: "150px 60px 0" }}>
      <Title tag="凌晨 00:47">女朋友发来…</Title>
      <div style={{ marginTop: 90, display: "flex", flexDirection: "column", gap: 30 }}>
        <Bubble at={beat("ask", 0)} big>不是说十点给我打电话吗？</Bubble>
        <Bubble at={beat("ask", 2)} face="🥲">我等到睡着了。</Bubble>
        <Typing from={beat("ask", 4)} to={beat("ask", 6)} />
        <Bubble me at={beat("ask", 6)}>……</Bubble>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

// 1. 00:47, the question. After his "……", the whole screen shakes hard.
const DOOM = Math.round(beat("ask", 7));
const Ask: React.FC = () => {
  const f = useCurrentFrame();
  const d = f - DOOM;
  const k = d >= 0 ? Math.exp(-d / 7) : 0;
  const shake = d >= 0 ? Math.sin(d * 2.7) * 38 * k : 0;
  const shakeY = d >= 0 ? Math.cos(d * 3.3) * 18 * k : 0;
  const tilt = d >= 0 ? Math.sin(d * 2.1) * 1.2 * k : 0;
  const zoom = d >= 0 ? 1 + 0.06 * Math.exp(-d / 4) : 1;
  return (
    <AbsoluteFill style={{ transform: `translate(${shake}px, ${shakeY}px) rotate(${tilt}deg) scale(${zoom})`, opacity: interpolate(f, [114, 120], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      <AskBody />
    </AbsoluteFill>
  );
};

// 2. the drop: a flash, the logo punches in with a shockwave and a light sweep, then the line, with "记着" underlined
const Brand: React.FC = () => {
  const f = useCurrentFrame();
  const flash = interpolate(f, [0, 8], [0.85, 0], { extrapolateRight: "clamp" });
  const punch = interpolate(f, [0, 4, 12], [1.35, 0.96, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const wave = interpolate(f, [0, 22], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sweep = interpolate(f, [6, 22], [-1, 1.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const t = usePop(6);
  const line = ramp(f, 16, 14);
  return (
    <Cut k="brand" pad={false}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", border: `${8 * (1 - wave) + 1}px solid ${BLUE}`, transform: `scale(${1 + wave * 2.4})`, opacity: (1 - wave) * 0.7, marginTop: -150 }} />
        <div style={{ position: "relative", width: 300, height: 300, borderRadius: 68, overflow: "hidden", transform: `scale(${punch})`, boxShadow: "0 30px 60px -20px rgba(47,139,255,.55)" }}>
          <Img src={staticFile("icon.png")} style={{ width: 300, height: 300, display: "block" }} />
          <div style={{ position: "absolute", top: -60, bottom: -60, width: 110, left: `${sweep * 100}%`, transform: "rotate(18deg)", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent)" }} />
        </div>
        <div style={{ marginTop: 60, fontSize: 100, fontWeight: 900, color: INK, opacity: t, transform: `translateY(${(1 - t) * 24}px)` }}>
          AI 替我<span style={{ position: "relative", color: BLUE }}>记着<span style={{ position: "absolute", left: 0, right: 0, bottom: 4, height: 14, borderRadius: 7, background: "rgba(47,123,246,.25)", transform: `scaleX(${line})`, transformOrigin: "left" }} /></span>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#fff", opacity: flash, pointerEvents: "none" }} />
    </Cut>
  );
};

// 3. back to that evening: the reminder at 21:50
const Remind: React.FC = () => {
  const up = usePop(1, 260);
  return (
    <Cut k="remind">
      <Title tag="有了 ReadMe" color={BLUE}>回到当晚 21:50</Title>
      <div style={{ marginTop: 50, display: "flex", justifyContent: "center", transform: `translateY(${(1 - up) * 80}px)`, opacity: up }}>
        <LockPhone w={540} time="21:50" date="11月16日 星期一">
          <Notif at={beat("remind", 2)} head="10 分钟后：给她打电话" body="你下午说的「晚上十点给你打电话」" />
        </LockPhone>
      </div>
    </Cut>
  );
};

// 4. he calls on time
const Call: React.FC = () => {
  const f = useCurrentFrame();
  const ring = (f % 40) / 40;
  return (
    <Cut k="call">
      <Title tag="稳了" color={GREEN}>十点整，电话准时打过去</Title>
      <div style={{ marginTop: 70, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 200, height: 200, display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `4px solid ${GREEN}`, transform: `scale(${1 + ring * 0.4})`, opacity: (1 - ring) * 0.6 }} />
          <div style={{ width: 170, height: 170, borderRadius: 85, background: GREEN, display: "grid", placeItems: "center", fontSize: 90 }}>📞</div>
        </div>
        <div style={{ marginTop: 26, fontSize: 52, fontWeight: 850, color: INK }}>正在呼叫 宝 ❤️</div>
        <div style={{ fontSize: 40, color: GREY, marginTop: 6 }}>22:00</div>
      </div>
      <div style={{ marginTop: 60 }}><Bubble at={beat("call", 2)} face="🥰">今天居然准时了！</Bubble></div>
    </Cut>
  );
};

// 5. not just her (one bar, three cards on three beats)
const MORE = [
  { e: "🧑", bg: "#e7f6ee", who: "兄弟", said: "月底还你 2000", rem: "11/30 兄弟该还你 2000" },
  { e: "💼", bg: "#eef0f5", who: "老板", said: "周五前把材料发我", rem: "周五 18:00 前交材料" },
  { e: "👩", bg: "#fff1e3", who: "老妈", said: "周三记得去体检", rem: "周三上午 体检" },
];
const MoreCard: React.FC<{ at: number; e: string; bg: string; who: string; said: string; rem: string }> = ({ at, e, bg, who, said, rem }) => {
  const s = usePop(at, 380);
  if (s <= 0.001) return null;
  return (
    <div style={{ display: "flex", gap: 22, alignItems: "center", padding: "24px 28px", borderRadius: 36, background: "#fff", boxShadow: "0 18px 40px -22px rgba(20,24,40,.35)", opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
      <Avatar e={e} bg={bg} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 34, color: GREY }}>{who}说：「{said}」</div>
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 18px", borderRadius: 16, background: "#eaf2ff", color: BLUE, fontSize: 38, fontWeight: 800 }}>
          <Img src={staticFile("icon.png")} style={{ width: 40, height: 40, borderRadius: 10 }} />{rem}
        </div>
      </div>
    </div>
  );
};
const More: React.FC = () => (
  <Cut k="more">
    <Title tag="还没完">不止女朋友</Title>
    <div style={{ marginTop: 70, display: "flex", flexDirection: "column", gap: 32 }}>
      {MORE.map((m, i) => <MoreCard key={m.who} at={beat("more", i)} {...m} />)}
    </div>
  </Cut>
);

// 6. everything lands in the calendar (November 2026 starts on a Sunday)
const EVENTS: { d: number; text: string; c: string }[] = [
  { d: 16, text: "22:00 打电话", c: RED },
  { d: 18, text: "体检", c: "#f59e0b" },
  { d: 20, text: "交材料", c: BLUE },
  { d: 25, text: "她生日🎂", c: "#ec4899" },
  { d: 30, text: "兄弟还钱", c: GREEN },
];
const Chip: React.FC<{ at: number; text: string; c: string }> = ({ at, text, c }) => {
  const s = usePop(at, 420);
  if (s <= 0.001) return null;
  return <div style={{ marginTop: 8, padding: "6px 4px", borderRadius: 10, background: c, color: "#fff", fontSize: 21, fontWeight: 800, lineHeight: 1.25, textAlign: "center", transform: `translateY(${(1 - s) * -14}px)`, opacity: s }}>{text}</div>;
};
const Cal: React.FC = () => {
  const cell = 136;
  return (
    <Cut k="cal">
      <Title>全部自动进日历<br /><span style={{ color: BLUE }}>一目了然</span></Title>
      <div style={{ marginTop: 50, padding: 26, borderRadius: 44, background: "#fff", boxShadow: "0 30px 70px -30px rgba(20,24,40,.35)" }}>
        <div style={{ fontSize: 44, fontWeight: 850, color: INK, marginBottom: 14 }}>2026 年 11 月</div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(7, ${cell}px)` }}>
          {["日", "一", "二", "三", "四", "五", "六"].map((w) => <div key={w} style={{ textAlign: "center", fontSize: 28, color: "#8a90a0", padding: "8px 0" }}>{w}</div>)}
          {Array.from({ length: 35 }, (_, i) => {
            const d = i + 1;
            const k = EVENTS.findIndex((e) => e.d === d);
            return (
              <div key={i} style={{ height: 150, borderTop: "1px solid #eef0f4", padding: "8px 4px" }}>
                {d <= 30 && <div style={{ width: 46, height: 46, margin: "0 auto", borderRadius: 23, display: "grid", placeItems: "center", fontSize: 28, fontWeight: d === 16 ? 800 : 500, color: d === 16 ? "#fff" : INK, background: d === 16 ? BLUE : "none" }}>{d}</div>}
                {k >= 0 && <Chip at={beat("cal", 1 + k)} text={EVENTS[k].text} c={EVENTS[k].c} />}
              </div>
            );
          })}
        </div>
      </div>
    </Cut>
  );
};

// 7–10. quick cuts of the app itself
const Shot: React.FC<{ k: string; tag: string; title: React.ReactNode; src: string; scroll?: [number, number] }> = ({ k, tag, title, src, scroll }) => {
  const f = useCurrentFrame();
  const up = usePop(2, 260);
  return (
    <Cut k={k}>
      <Title tag={tag} color={BLUE} size={70}>{title}</Title>
      <div style={{ marginTop: 50, display: "flex", justifyContent: "center", opacity: up, transform: `translateY(${(1 - up) * 80}px)` }}><Phone src={src} w={520} frame={f} scroll={scroll} /></div>
    </Cut>
  );
};
const LedgerShot: React.FC = () => {
  const f = useCurrentFrame();
  const up = usePop(2, 260);
  return (
    <Cut k="ledger">
      <Title tag="说话算数账本" color={BLUE} size={70}>谁答应了什么，谁做到了</Title>
      <div style={{ marginTop: 50, display: "flex", justifyContent: "center", opacity: up, transform: `translateY(${(1 - up) * 80}px)` }}><Ledger lang="zh" portrait f={f} popAt={Math.round(beat("ledger", 2))} smooth /></div>
    </Cut>
  );
};
const APPS: [string, string][] = [["微信", "#07c160"], ["LINE", "#06c755"], ["WhatsApp", "#25d366"], ["Telegram", "#2aabee"], ["iMessage", "#34c759"], ["QQ", "#12b7f5"], ["Discord", "#5865f2"], ["Instagram", "#e1306c"]];
const AppChip: React.FC<{ at: number; n: string; c: string }> = ({ at, n, c }) => {
  const s = usePop(at, 420);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "26px 30px", borderRadius: 32, background: "#fff", boxShadow: "0 16px 36px -20px rgba(20,24,40,.35)", transform: `translateY(${(1 - s) * 24}px)`, opacity: s }}>
      <div style={{ width: 70, height: 70, borderRadius: 20, background: c, color: "#fff", display: "grid", placeItems: "center", fontSize: 38, fontWeight: 900 }}>{n[0]}</div>
      <div style={{ fontSize: 44, fontWeight: 800, color: INK }}>{n}</div>
    </div>
  );
};
const Apps: React.FC = () => (
  <Cut k="apps">
    <Title tag="常用聊天软件都能读" color={BLUE} size={70}>你在哪聊，它就在哪记</Title>
    <div style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 28 }}>
      {APPS.map(([n, c], i) => <AppChip key={n} at={3 + i * 2.2} n={n} c={c} />)}
    </div>
  </Cut>
);

// 11. the lock closes: only you can read your chats → logo + GitHub (the drums stop as the logo lands)
const BADGES = ["本地运行", "聊天不上传", "开源可查", "AI 用你自己的密钥"];
const Badge: React.FC<{ at: number; text: string }> = ({ at, text }) => {
  const s = usePop(at, 420);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px", borderRadius: 999, background: "#fff", boxShadow: "0 14px 30px -18px rgba(20,24,40,.35)", fontSize: 40, fontWeight: 800, color: INK, transform: `translateY(${(1 - s) * 16}px)`, opacity: s }}>
      <span style={{ width: 40, height: 40, borderRadius: 20, background: GREEN, color: "#fff", display: "grid", placeItems: "center", fontSize: 26 }}>✓</span>{text}
    </div>
  );
};
const Safe: React.FC = () => {
  const f = useCurrentFrame();
  const close = ramp(f, 10, 14);
  const logoAt = 960 - T.safe[0];
  const logo = usePop(logoAt, 300);
  const glow = (Math.sin(f / 8) + 1) / 2;
  const move = interpolate(f, [logoAt - 6, logoAt + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const open = 1 - Math.min(1, close);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 200, opacity: interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ transform: `translateY(${move * -110}px) scale(${1 - move * 0.45})`, opacity: 1 - move, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ position: "relative", width: 320, height: 320, display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle, rgba(47,123,246,${0.18 + glow * 0.12}) 0%, transparent 70%)` }} />
          <svg width="230" height="260" viewBox="0 0 230 260">
            {/* the shackle drops into the body as the lock closes */}
            <path d="M60 130 V85 a55 55 0 0 1 110 0 V130" fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round" transform={`translate(0 ${open * -46})`} />
            <rect x="20" y="120" width="190" height="135" rx="34" fill={BLUE} />
            <circle cx="115" cy="178" r="17" fill="#fff" />
            <rect x="106" y="184" width="18" height="38" rx="9" fill="#fff" />
          </svg>
        </div>
        <div style={{ marginTop: 16, fontSize: 70, fontWeight: 900, color: INK, textAlign: "center", lineHeight: 1.2, opacity: 1 - move }}>你的聊天<br />只有你自己能看</div>
      </div>
      <div style={{ marginTop: 40, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 20, maxWidth: 920, opacity: 1 - move }}>
        {BADGES.map((b, i) => <Badge key={b} at={beat("safe", 2 + i)} text={b} />)}
      </div>
      {f >= logoAt - 2 && (
        <div style={{ position: "absolute", top: 640, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", opacity: logo, transform: `translateY(${(1 - logo) * 24}px)` }}>
          <div style={{ fontSize: 76, fontWeight: 900, color: INK, textAlign: "center", lineHeight: 1.2 }}>再也不怕被问<br /><span style={{ color: RED }}>「你答应过我啥」</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 26, marginTop: 60 }}>
            <Img src={staticFile("icon.png")} style={{ width: 140, height: 140 }} />
            <div style={{ fontSize: 116, fontWeight: 850, color: INK, letterSpacing: -3 }}>ReadMe</div>
          </div>
          <div style={{ marginTop: 24, fontSize: 38, color: GREY }}>聊天记录不上传 · 免费 · 开源</div>
          <div style={{ marginTop: 30, padding: "16px 30px", borderRadius: 999, background: "#0f1115", color: "#fff", fontSize: 38, fontWeight: 700, display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#fff"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" /></svg>
            github.com/Haike0/personal-radar
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

const at = (k: string, el: React.ReactNode) => <Sequence key={k} from={T[k][0]} durationInFrames={len(k)}>{el}</Sequence>;
export const Story: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, ...WRAP, ["--film-font" as string]: FONT }}>
    <Audio src={staticFile("bgm.wav")} />
    <Backdrop />
    {at("ask", <Ask />)}
    {at("brand", <Brand />)}
    {at("remind", <Remind />)}
    {at("call", <Call />)}
    {at("more", <More />)}
    {at("cal", <Cal />)}
    {at("today", <Shot k="today" tag="每天打开" title="今天该干嘛，一眼看到" src="zh-phone-today-full.png" scroll={[4, 400]} />)}
    {at("person", <Shot k="person" tag="人物画像" title="她爱吃什么、讨厌什么" src="zh-phone-person-full.png" scroll={[4, 160]} />)}
    {at("ledger", <LedgerShot />)}
    {at("apps", <Apps />)}
    {at("safe", <Safe />)}
  </AbsoluteFill>
);
