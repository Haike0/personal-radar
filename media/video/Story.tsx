// Xiaohongshu cut (Chinese, portrait): a story instead of a feature tour.
//   she asks the dreaded question → he panics → ReadMe pulls up his own words → it's not just her → ledger → reminder → logo
// Scene boundaries match the music (bgm.mjs): the drop on the logo at 4 s, the ledger chime at 22.3 s, the drums stop at 32 s.
// Every chat line here is made up for the film; nothing comes from a real conversation.
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop, Ledger, fade } from "./Film";

const FONT = `-apple-system, "SF Pro Display", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
const WRAP = { wordBreak: "keep-all", overflowWrap: "anywhere" } as const;
const BLUE = "#2f7bf6", RED = "#ff3b6b", INK = "#111318", GREY = "#5d6370";
// frames (30 fps)
export const SS = { ask: [0, 120], brand: [120, 45], proof: [165, 210], more: [375, 225], ledger: [600, 210], remind: [810, 150], end: [960, 150] } as const;
export const STORY_TOTAL = 1110;

const useIn = (at: number, damping = 16) => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return spring({ frame: f - at, fps, config: { damping, mass: 0.8 } }); };
// cards and bubbles snap in with a little overshoot, landing on the beat
const usePop = (at: number) => { const f = useCurrentFrame(); const { fps } = useVideoConfig(); return spring({ frame: f - at, fps, config: { damping: 11, stiffness: 320, mass: 0.55 } }); };
// the music's beat grid (bgm.mjs: 128 BPM, shifted so a bar starts on the logo): local frame of the nth beat in a scene
const BEATF = (30 * 60) / 128, GRID0F = 7.5;
const beat = (sceneStart: number, n: number) => GRID0F + (Math.ceil((sceneStart - GRID0F) / BEATF) + n) * BEATF - sceneStart;

const Avatar: React.FC<{ e: string; bg: string }> = ({ e, bg }) => (
  <div style={{ width: 92, height: 92, borderRadius: 46, flex: "none", display: "grid", placeItems: "center", fontSize: 54, background: bg }}>{e}</div>
);
const Bubble: React.FC<{ me?: boolean; at: number; children: React.ReactNode; big?: boolean; face?: string }> = ({ me, at, children, big, face }) => {
  const s = usePop(at);
  if (s <= 0.001) return null;
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 18, opacity: s, transform: `translateY(${(1 - s) * 40}px) scale(${0.9 + s * 0.1})`, transformOrigin: me ? "right bottom" : "left bottom" }}>
      {!me && <Avatar e={face ?? "😤"} bg="#ffe1ea" />}
      <div style={{ padding: big ? "28px 38px" : "24px 34px", borderRadius: 38, borderBottomLeftRadius: me ? 38 : 10, borderBottomRightRadius: me ? 10 : 38, maxWidth: 720,
        fontSize: big ? 56 : 48, fontWeight: big ? 800 : 650, lineHeight: 1.3, color: me ? "#fff" : INK, background: me ? BLUE : "#fff", boxShadow: "0 16px 36px -18px rgba(20,24,40,.35)" }}>{children}</div>
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
        {[0, 1, 2].map((k) => <i key={k} style={{ width: 16, height: 16, borderRadius: 8, background: BLUE, opacity: 0.35 + 0.65 * Math.abs(Math.sin((f - from) / 5 + k)), display: "block" }} />)}
      </div>
      <Avatar e="😰" bg="#dfeaff" />
    </div>
  );
};
const Title: React.FC<{ at: number; children: React.ReactNode; tag?: string; color?: string }> = ({ at, children, tag, color }) => {
  const s = useIn(at, 200);
  return (
    <div style={{ opacity: s, transform: `translateY(${(1 - s) * 24}px)`, textAlign: "center" }}>
      {tag && <div style={{ display: "inline-block", padding: "10px 28px", borderRadius: 999, background: color ?? RED, color: "#fff", fontSize: 38, fontWeight: 800, letterSpacing: 2, marginBottom: 22 }}>{tag}</div>}
      <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.15, color: INK, letterSpacing: -1 }}>{children}</div>
    </div>
  );
};
/** The ReadMe card that pops up with the receipt. */
const Receipt: React.FC<{ at: number; what: string; quote: string; when: string; tilt?: number }> = ({ at, what, quote, when, tilt = -1.5 }) => {
  const s = usePop(at);
  if (s <= 0.001) return null;
  return (
    <div style={{ padding: "32px 36px", borderRadius: 42, background: "#fff", boxShadow: `0 34px 80px -30px rgba(30,60,140,.5), 0 0 0 4px ${BLUE}`,
      transform: `translateY(${(1 - s) * -120}px) scale(${0.85 + s * 0.15}) rotate(${tilt}deg)`, opacity: Math.min(1, s * 1.4) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Img src={staticFile("icon.png")} style={{ width: 66, height: 66, borderRadius: 16 }} />
        <div style={{ fontSize: 38, fontWeight: 800, color: BLUE }}>ReadMe 提醒你</div>
        <div style={{ marginLeft: "auto", fontSize: 32, color: "#8a90a0" }}>刚刚</div>
      </div>
      <div style={{ marginTop: 18, fontSize: 50, fontWeight: 850, color: INK, lineHeight: 1.3 }}>{what}</div>
      <div style={{ marginTop: 14, fontSize: 36, color: GREY, borderLeft: `7px solid ${BLUE}`, paddingLeft: 18 }}>原话 · {when}「{quote}」</div>
    </div>
  );
};

// 1. the question
const Ask: React.FC = () => {
  const f = useCurrentFrame();
  const shake = f > 92 && f < 112 ? Math.sin(f * 2.2) * 10 : 0;
  return (
    <AbsoluteFill style={{ padding: "150px 60px 0", opacity: fade(f, SS.ask[1], 4, 6), transform: `translateX(${shake}px)` }}>
      <Title at={0} tag="女朋友突然发来">灵魂拷问</Title>
      <div style={{ marginTop: 90, display: "flex", flexDirection: "column", gap: 30 }}>
        <Bubble at={beat(0, 0)} big>你还记得答应我啥不？</Bubble>
        <Bubble at={beat(0, 2)}>想好了再回答</Bubble>
        <Typing from={beat(0, 4)} to={beat(0, 6)} />
        <Bubble me at={beat(0, 6)}>……</Bubble>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 300, textAlign: "center", fontSize: 64, fontWeight: 900, color: RED, opacity: interpolate(f, [beat(0, 7), beat(0, 7) + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>空气突然安静</div>
    </AbsoluteFill>
  );
};

// 2. the drop: logo slam
const Brand: React.FC = () => {
  const f = useCurrentFrame();
  const s = useIn(0, 10);
  const t = useIn(6, 200);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fade(f, SS.brand[1], 2, 6) }}>
      {[0, 1].map((k) => { const p = ((f + k * 14) % 28) / 28; return <div key={k} style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", border: `5px solid rgba(47,123,246,.45)`, transform: `scale(${1 + p * 2})`, opacity: 1 - p }} />; })}
      <Img src={staticFile("icon.png")} style={{ width: 300, height: 300, transform: `scale(${0.4 + s * 0.6})`, filter: "drop-shadow(0 30px 50px rgba(47,139,255,.4))" }} />
      <div style={{ marginTop: 60, fontSize: 92, fontWeight: 900, color: INK, opacity: t, transform: `scale(${0.8 + t * 0.2})` }}>AI 替我记着</div>
    </AbsoluteFill>
  );
};

// 3. the receipt, and he's saved
const Proof: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: "150px 60px 0", opacity: fade(f, SS.proof[1], 6, 8) }}>
      {f < beat(SS.proof[0], 6) ? <Title at={0}>它翻出了你当时的原话</Title> : <Title at={beat(SS.proof[0], 6)} tag="稳了" color={BLUE}>原话都在，赖不掉也忘不了</Title>}
      <div style={{ marginTop: 70 }}>
        <Receipt at={beat(SS.proof[0], 0)} what="下周三：你们在一起一周年" when="10/3 23:41" quote="一周年我来订餐厅" />
      </div>
      <div style={{ marginTop: 70, display: "flex", flexDirection: "column", gap: 30 }}>
        <Bubble me at={beat(SS.proof[0], 3)} face="😎">一周年啊，餐厅我早订好了</Bubble>
        <Bubble at={beat(SS.proof[0], 6)} face="🥰">哼，算你有良心</Bubble>
      </div>
    </AbsoluteFill>
  );
};

// 4. not just her
const MORE = [
  { e: "🧑", bg: "#e7f6ee", who: "兄弟", said: "下个月还你 2000", rem: "12/1 兄弟该还你 2000" },
  { e: "💼", bg: "#eef0f5", who: "老板", said: "周五前把材料发我", rem: "周五 18:00 前交材料" },
  { e: "👩", bg: "#fff1e3", who: "老妈", said: "下周三记得去体检", rem: "周三上午 体检" },
];
const More: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: "150px 60px 0", opacity: fade(f, SS.more[1], 6, 8) }}>
      <Title at={0} tag="还没完">不止女朋友</Title>
      <div style={{ marginTop: 70, display: "flex", flexDirection: "column", gap: 36 }}>
        {MORE.map((m, i) => <MoreCard key={m.who} at={beat(SS.more[0], i)} {...m} />)}
      </div>
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 230, textAlign: "center", fontSize: 54, fontWeight: 850, color: INK, opacity: interpolate(f, [beat(SS.more[0], 4), beat(SS.more[0], 4) + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        谁说过什么，<span style={{ color: BLUE }}>它都替你记着</span>
      </div>
    </AbsoluteFill>
  );
};
const MoreCard: React.FC<{ at: number; e: string; bg: string; who: string; said: string; rem: string }> = ({ at, e, bg, who, said, rem }) => {
  const s = usePop(at);
  if (s <= 0.001) return null;
  return (
    <div style={{ display: "flex", gap: 22, alignItems: "center", padding: "26px 30px", borderRadius: 36, background: "#fff", boxShadow: "0 18px 40px -22px rgba(20,24,40,.35)", opacity: s, transform: `translateX(${(1 - s) * 140}px)` }}>
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

// 5. the ledger: who promised what, and who kept it
const LedgerScene: React.FC = () => {
  const f = useCurrentFrame();
  const up = useIn(0, 18);
  return (
    <AbsoluteFill style={{ ["--film-font" as string]: FONT, opacity: fade(f, SS.ledger[1], 6, 8), alignItems: "center", paddingTop: 150 }}>
      <Title at={0} tag="一键晒图" color={BLUE}>说话算数账本</Title>
      <div style={{ marginTop: 60, transform: `translateY(${(1 - up) * 160}px)` }}><Ledger lang="zh" portrait f={f} /></div>
    </AbsoluteFill>
  );
};

// 6. on the day: a lock-screen notification that ties back to the story
const Remind: React.FC = () => {
  const f = useCurrentFrame();
  const n = usePop(beat(SS.remind[0], 1));
  return (
    <AbsoluteFill style={{ opacity: fade(f, SS.remind[1], 6, 8), alignItems: "center", paddingTop: 150 }}>
      <Title at={0}>到日子，提前提醒你</Title>
      <div style={{ marginTop: 70, width: 760, height: 1180, borderRadius: 110, padding: 26, background: "#0d0d10", boxShadow: "0 60px 120px -40px rgba(15,17,21,.5)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 88, overflow: "hidden", background: "linear-gradient(165deg, #ff9a8b 0%, #a18cd1 55%, #4f7cff 100%)", position: "relative", fontFamily: FONT }}>
          <div style={{ textAlign: "center", color: "#fff", marginTop: 120, fontSize: 40, fontWeight: 600, opacity: 0.9 }}>11月17日 星期二</div>
          <div style={{ textAlign: "center", color: "#fff", fontSize: 200, fontWeight: 700, lineHeight: 1, letterSpacing: -6 }}>20:30</div>
          <div style={{ position: "absolute", left: 30, right: 30, top: 480, padding: "26px 28px", borderRadius: 40, background: "rgba(255,255,255,.82)", opacity: n, transform: `translateY(${(1 - n) * 80}px) scale(${0.92 + n * 0.08})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Img src={staticFile("icon.png")} style={{ width: 54, height: 54, borderRadius: 13 }} />
              <div style={{ fontSize: 30, fontWeight: 700, color: GREY }}>ReadMe</div>
              <div style={{ marginLeft: "auto", fontSize: 28, color: "#8a90a0" }}>现在</div>
            </div>
            <div style={{ marginTop: 12, fontSize: 40, fontWeight: 850, color: INK }}>明天：你们在一起一周年</div>
            <div style={{ marginTop: 6, fontSize: 32, color: GREY }}>你 10/3 答应的，原话「一周年我来订餐厅」</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const End: React.FC = () => {
  const f = useCurrentFrame();
  const a = useIn(0, 200);
  const b = useIn(20, 14);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: 80, opacity: interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" }) }}>
      <div style={{ fontSize: 82, fontWeight: 900, lineHeight: 1.2, color: INK, opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}>再也不怕被问<br /><span style={{ color: RED }}>「你答应过我啥」</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 90, transform: `scale(${0.8 + b * 0.2})`, opacity: b }}>
        <Img src={staticFile("icon.png")} style={{ width: 150, height: 150 }} />
        <div style={{ fontSize: 120, fontWeight: 850, color: INK, letterSpacing: -3 }}>ReadMe</div>
      </div>
      <div style={{ fontSize: 40, color: GREY, marginTop: 30, opacity: b }}>聊天记录不上传 · 免费</div>
      <div style={{ fontSize: 40, color: BLUE, marginTop: 22, opacity: b, fontWeight: 700 }}>github.com/Haike0/personal-radar</div>
    </AbsoluteFill>
  );
};

export const Story: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, ...WRAP }}>
    <Audio src={staticFile("bgm.wav")} />
    <Backdrop />
    <Sequence from={SS.ask[0]} durationInFrames={SS.ask[1]}><Ask /></Sequence>
    <Sequence from={SS.brand[0]} durationInFrames={SS.brand[1]}><Brand /></Sequence>
    <Sequence from={SS.proof[0]} durationInFrames={SS.proof[1]}><Proof /></Sequence>
    <Sequence from={SS.more[0]} durationInFrames={SS.more[1]}><More /></Sequence>
    <Sequence from={SS.ledger[0]} durationInFrames={SS.ledger[1]}>
      <LedgerScene />
    </Sequence>
    <Sequence from={SS.remind[0]} durationInFrames={SS.remind[1]}><Remind /></Sequence>
    <Sequence from={SS.end[0]} durationInFrames={SS.end[1]}><End /></Sequence>
  </AbsoluteFill>
);
