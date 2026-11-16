// ReadMe product video. Every screen is a real screenshot of the app with its fictional demo data.
import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import LINES from "./lines.json";
import DIMS from "./dims.json";

export const FPS = 30;
type Lang = "zh" | "en" | "ja";
type Props = { lang: Lang; portrait: boolean };

const C = {
  zh: {
    hook: "你还记得\n答应我啥不？", hook2: "不只是她。\n兄弟、老板、爸妈说过的话，\n两天就被冲没了。", brand: "ReadMe 替你记住",
    s: [["到日子，主动提醒你", "约好的时间、答应过的事，自动出现在今天"], ["每个人的画像", "喜好、忌讳、近况，每一条都能点回原话"], ["说话算数账本", "谁答应了什么、谁真的做到了，一键晒图"], ["常用的聊天软件都能接", "iMessage、WhatsApp、Telegram 自动同步"]],
    end: "聊天不离开你的电脑", end2: "开源 · 免费 · macOS / Windows / Linux",
  },
  en: {
    hook: "How much of what she told you do you remember?", hook2: "Hundreds of messages a day. The ones that matter are gone in two.", brand: "ReadMe remembers for you",
    s: [["Reminded on the day", "Plans and promises show up on Today, by themselves"], ["A profile for everyone", "Likes, dislikes, what's new. Tap any line for the exact words"], ["The promise ledger", "Who promised what, and who actually did it. Share it in one tap"], ["Works with the apps you use", "iMessage, WhatsApp and Telegram stay in sync"]],
    end: "Your chats never leave your computer", end2: "Open source · Free · macOS / Windows / Linux",
  },
  ja: {
    hook: "あの人の言葉、\nいくつ覚えてる？", hook2: "毎日何百ものメッセージ。\n大事なひと言も、二日で埋もれてしまう。", brand: "ReadMe が覚えておく",
    s: [["その日に、知らせてくれる", "約束の時間や頼まれごとが、今日の画面に自動で並ぶ"], ["一人ひとりの人物メモ", "好きなもの、苦手なもの、近況。どれも元の発言に戻れる"], ["約束帳", "誰が何を約束して、本当に守ったか。ワンタップでシェア"], ["いつものアプリとつながる", "iMessage・WhatsApp・Telegram を自動で同期"]],
    end: "トークは、あなたの\nパソコンから出ない", end2: "オープンソース・無料・macOS / Windows / Linux",
  },
} as const;

// one type scale for the whole film: title / subtitle / small, each the same size in every scene
const TY = (portrait: boolean) => (portrait ? { title: 76, sub: 38, small: 30, mark: 120 } : { title: 72, sub: 34, small: 26, mark: 116 });
// CJK lines break at punctuation, never inside a word
const WRAP = { wordBreak: "keep-all", overflowWrap: "anywhere" } as const;

// line breaks written into the copy are for the narrow portrait frame; landscape gets one line
const br = (s: string, portrait: boolean) => (portrait ? s : s.replace(/\n/g, ""));

// scene timing (frames)
const S = { hook: [0, 120], brand: [120, 75], today: [195, 210], person: [405, 195], ledger: [600, 210], apps: [810, 150], end: [960, 150] } as const;
export const TOTAL = 1110;

// Chinese and Japanese share characters but draw them differently: each language lists its own font first
const FONTS = {
  zh: `-apple-system, "SF Pro Display", "PingFang SC", "Noto Sans CJK SC", sans-serif`,
  en: `-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`,
  ja: `-apple-system, "SF Pro Display", "Hiragino Sans", "Noto Sans CJK JP", sans-serif`,
} as const;
const FONT = "var(--film-font)";
const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
export const fade = (f: number, len: number, inLen = 12, outLen = 12) =>
  Math.min(interpolate(f, [0, inLen], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), interpolate(f, [len - outLen, len], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

export const Backdrop: React.FC = () => (
  <AbsoluteFill style={{ background: "#f7f8fa" }}>
    <AbsoluteFill style={{ background: "radial-gradient(45% 45% at 20% 15%, rgba(10,199,240,.20), transparent 70%), radial-gradient(45% 45% at 85% 85%, rgba(47,139,255,.18), transparent 70%)" }} />
  </AbsoluteFill>
);

/** A phone showing a screenshot; with `scroll`, it glides from top to bottom of a long screenshot. */
const Phone: React.FC<{ src: string; w: number; scroll?: [number, number]; frame: number }> = ({ src, w, scroll, frame }) => {
  const h = w * 2.06, pad = w * 0.032, sw = w - pad * 2, sh = h - pad * 2;
  const [iw, ih] = (DIMS as Record<string, number[]>)[src] ?? [1170, 2532];
  const imgH = (sw * ih) / iw;
  const bar = sw * 0.12;
  const maxY = Math.max(0, imgH - (sh - bar));
  const y = scroll ? interpolate(frame, scroll, [0, maxY], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 0;
  return (
    <div style={{ width: w, height: h, borderRadius: w * 0.155, background: "#0d0d10", padding: pad, boxShadow: "0 0 0 3px #2a2a30 inset, 0 60px 120px -40px rgba(15,17,21,.45), 0 30px 60px -30px rgba(15,17,21,.3)", position: "relative" }}>
      <div style={{ position: "absolute", top: pad + w * 0.03, left: "50%", transform: "translateX(-50%)", width: w * 0.27, height: w * 0.078, borderRadius: 99, background: "#000", zIndex: 3 }} />
      <div style={{ width: sw, height: sh, borderRadius: w * 0.125, overflow: "hidden", background: "#f5f6fa", position: "relative" }}>
        <div style={{ height: bar, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${w * 0.02}px ${w * 0.085}px 0 ${w * 0.1}px`, fontSize: w * 0.038, fontWeight: 600, color: "#111", fontFamily: FONT, ...WRAP, position: "relative", zIndex: 2, background: "#f5f6fa" }}>
          <span>9:41</span><span style={{ width: w * 0.06, height: w * 0.028, border: "2px solid #111", borderRadius: 4 }} />
        </div>
        <Img src={staticFile(src)} style={{ width: sw, display: "block", transform: `translateY(${-y}px)` }} />
      </div>
    </div>
  );
};

const Caption: React.FC<{ title: string; sub: string; frame: number; portrait: boolean; idx: number; center?: boolean }> = ({ title, sub, frame, portrait, idx, center }) => {
  const { fps } = useVideoConfig();
  const t = spring({ frame, fps, config: { damping: 200 } });
  const t2 = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  return (
    <div style={{ fontFamily: FONT, ...WRAP, width: portrait ? 900 : center ? 1300 : 760, textAlign: portrait || center ? "center" : "left" }}>
      <div style={{ fontSize: TY(portrait).small, fontWeight: 700, letterSpacing: 2, color: "#2f8bff", opacity: t, marginBottom: 18 }}>0{idx}</div>
      <div style={{ fontSize: TY(portrait).title, lineHeight: 1.18, fontWeight: 760, color: "#0f1115", letterSpacing: -1, opacity: t, transform: `translateY(${(1 - t) * 30}px)` }}>{title}</div>
      <div style={{ fontSize: TY(portrait).sub, lineHeight: 1.5, color: "#5d6370", marginTop: 22, opacity: t2, transform: `translateY(${(1 - t2) * 24}px)` }}>{sub}</div>
    </div>
  );
};

/** A product scene: caption on one side, phone on the other (stacked in portrait). */
export const Scene: React.FC<{ len: number; portrait: boolean; caption: [string, string]; idx: number; children: (f: number) => React.ReactNode }> = ({ len, portrait, caption, idx, children }) => {
  const f = useCurrentFrame();
  const o = fade(f, len);
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f, fps, config: { damping: 18, mass: 0.9 } });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AbsoluteFill style={portrait ? { alignItems: "center", paddingTop: 170 } : { justifyContent: "center", paddingLeft: 150 }}>
        <Caption title={caption[0]} sub={caption[1]} frame={f} portrait={portrait} idx={idx} />
      </AbsoluteFill>
      <AbsoluteFill style={portrait ? { alignItems: "center", justifyContent: "flex-start", paddingTop: 610 } : { alignItems: "flex-end", justifyContent: "center", paddingRight: 210 }}>
        <div style={{ transform: `translateY(${(1 - enter) * 160}px)` }}>{children(f)}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ lang: Lang; portrait: boolean }> = ({ lang, portrait }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = (LINES as unknown as Record<string, { lines: [string, string][] }>)[lang].lines;
  const o = fade(f, S.hook[1], 6, 14);
  const t = spring({ frame: f - 4, fps, config: { damping: 200 } });
  const t2 = spring({ frame: f - 34, fps, config: { damping: 200 } });
  const W = portrait ? 1080 : 1920, H = portrait ? 1920 : 1080;
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT, ...WRAP }}>
      {/* a stream of real (fictional-demo) messages rising behind the question */}
      {lines.map(([who, text], i) => {
        const start = i * 3;
        const p = (f - start) / 70;
        if (p < 0) return null;
        const me = who === "A";
        const lane = (i * 37) % 5;
        const x = me ? W * (0.52 + (lane % 3) * 0.12) : W * (0.04 + (lane % 3) * 0.12);
        const y = H + 60 - p * (H + 260);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, maxWidth: W * 0.4, padding: "14px 22px", borderRadius: 26, fontSize: TY(portrait).small, background: me ? "#1f6fd6" : "#fff", color: me ? "#fff" : "#20232b", boxShadow: "0 10px 30px -14px rgba(15,17,21,.25)", opacity: 0.18 + 0.5 * Math.sin(Math.min(1, p) * Math.PI) }}>{text}</div>
        );
      })}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80, textAlign: "center" }}>
        <div style={{ background: "rgba(247,248,250,.9)", backdropFilter: "blur(14px)", padding: "48px 64px", borderRadius: 40 }}>
          <div style={{ fontSize: TY(portrait).title, lineHeight: 1.18, fontWeight: 780, color: "#0f1115", letterSpacing: -1, opacity: t, transform: `scale(${0.94 + t * 0.06})`, maxWidth: portrait ? 900 : 1500, whiteSpace: "pre-line" }}>{br(C[lang].hook, portrait)}</div>
          <div style={{ fontSize: TY(portrait).sub, lineHeight: 1.5, color: "#5d6370", marginTop: 22, opacity: t2, maxWidth: portrait ? 860 : 1300, whiteSpace: "pre-line" }}>{br(C[lang].hook2, portrait)}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Brand: React.FC<{ lang: Lang; portrait: boolean }> = ({ lang, portrait }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 12, mass: 0.8 } });
  const t = spring({ frame: f - 10, fps, config: { damping: 200 } });
  const o = fade(f, S.brand[1], 4, 12);
  const size = portrait ? 260 : 240;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o, fontFamily: FONT, ...WRAP }}>
      {[0, 1, 2].map((k) => {
        const p = ((f + k * 18) % 54) / 54;
        return <div key={k} style={{ position: "absolute", width: size, height: size, borderRadius: "50%", border: "3px solid rgba(19,127,213,.5)", transform: `scale(${1 + p * 1.6})`, opacity: (1 - p) * s }} />;
      })}
      <Img src={staticFile("icon.png")} style={{ width: size, height: size, transform: `scale(${s})`, filter: "drop-shadow(0 30px 50px rgba(47,139,255,.35))" }} />
      <div style={{ marginTop: 56, fontSize: TY(portrait).title, fontWeight: 780, color: "#0f1115", opacity: t, transform: `translateY(${(1 - t) * 24}px)` }}>{C[lang].brand}</div>
    </AbsoluteFill>
  );
};

export const Ledger: React.FC<{ lang: Lang; portrait: boolean; f: number }> = ({ lang, portrait, f }) => {
  const { fps } = useVideoConfig();
  const pop = spring({ frame: f - 70, fps, config: { damping: 13, mass: 0.9 } });
  const pw = portrait ? 560 : 430;
  return (
    <div style={{ position: "relative", width: pw, height: pw * 2.06 }}>
      <div style={{ opacity: interpolate(pop, [0, 1], [1, 0.35]) }}><Phone src={`${lang}-phone-ledger.png`} w={pw} frame={f} /></div>
      <Img src={staticFile(`${lang}-phone-card.png`)} style={{ position: "absolute", left: "50%", top: "50%", width: pw * 1.08, borderRadius: 28, boxShadow: "0 50px 100px -30px rgba(15,17,21,.45)", transform: `translate(-50%,-50%) scale(${0.55 + pop * 0.45}) rotate(${-4 + (1 - pop) * 8}deg)`, opacity: pop }} />
    </div>
  );
};

const Apps: React.FC<{ lang: Lang; portrait: boolean }> = ({ lang, portrait }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = fade(f, S.apps[1]);
  const win = spring({ frame: f, fps, config: { damping: 20 } });
  const names = ["iMessage", "WhatsApp", "Telegram", "LINE", "WeChat", "Beeper", "Discord", "QQ"];
  const ww = portrait ? 980 : 1240;
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT, ...WRAP, alignItems: "center", paddingTop: portrait ? 170 : 90 }}>
      <Caption title={C[lang].s[3][0]} sub={C[lang].s[3][1]} frame={f} portrait={portrait} center idx={4} />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 40, maxWidth: portrait ? 900 : 1300 }}>
        {names.map((n, i) => {
          const s = spring({ frame: f - 10 - i * 3, fps, config: { damping: 14 } });
          return <div key={n} style={{ fontSize: TY(portrait).small, padding: "12px 26px", borderRadius: 999, background: "#fff", color: "#20232b", boxShadow: "0 8px 24px -12px rgba(15,17,21,.25)", transform: `scale(${s})`, opacity: s }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 6, background: i < 3 ? "#0ac7f0" : "#c5cad3", marginRight: 12, verticalAlign: 2 }} />{n}</div>;
        })}
      </div>
      <div style={{ marginTop: 50, width: ww, borderRadius: 18, overflow: "hidden", boxShadow: "0 60px 120px -40px rgba(15,17,21,.4)", transform: `translateY(${(1 - win) * 200}px)`, opacity: win }}>
        <div style={{ height: 40, background: "#ececf0", display: "flex", alignItems: "center", gap: 9, paddingLeft: 18 }}>{["#ff5f57", "#febc2e", "#28c840"].map((c) => <i key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, display: "block" }} />)}</div>
        <Img src={staticFile(`${lang}-desktop-calendar.png`)} style={{ width: ww, display: "block" }} />
      </div>
    </AbsoluteFill>
  );
};

const End: React.FC<{ lang: Lang; portrait: boolean }> = ({ lang, portrait }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = spring({ frame: f, fps, config: { damping: 200 } });
  const b = spring({ frame: f - 30, fps, config: { damping: 14 } });
  const o = interpolate(f, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT, ...WRAP, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 80 }}>
      <svg width={portrait ? 120 : 110} height={portrait ? 120 : 110} viewBox="0 0 24 24" fill="none" stroke="#0f1115" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: a, transform: `translateY(${(1 - a) * 20}px)` }}><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      <div style={{ fontSize: TY(portrait).title, lineHeight: 1.18, fontWeight: 780, color: "#0f1115", marginTop: 30, opacity: a, letterSpacing: -1, whiteSpace: "pre-line" }}>{br(C[lang].end, portrait)}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 80, transform: `scale(${0.8 + b * 0.2})`, opacity: b }}>
        <Img src={staticFile("icon.png")} style={{ width: portrait ? 150 : 140, height: portrait ? 150 : 140 }} />
        <div style={{ fontSize: TY(portrait).mark, fontWeight: 800, color: "#0f1115", letterSpacing: -3 }}>ReadMe</div>
      </div>
      <div style={{ fontSize: TY(portrait).sub, color: "#5d6370", marginTop: 30, opacity: b }}>{C[lang].end2}</div>
      <div style={{ fontSize: TY(portrait).small, color: "#2f8bff", marginTop: 18, opacity: b, fontWeight: 600 }}>github.com/Haike0/personal-radar</div>
    </AbsoluteFill>
  );
};

export const Film: React.FC<Props> = ({ lang, portrait }) => {
  const pw = portrait ? 560 : 430;
  return (
    <AbsoluteFill style={{ ["--film-font" as string]: FONTS[lang] }}>
      {/* original music, made by media/video/bgm.mjs */}
      <Audio src={staticFile("bgm.wav")} />
      <Backdrop />
      <Sequence from={S.hook[0]} durationInFrames={S.hook[1]}><Hook lang={lang} portrait={portrait} /></Sequence>
      <Sequence from={S.brand[0]} durationInFrames={S.brand[1]}><Brand lang={lang} portrait={portrait} /></Sequence>
      <Sequence from={S.today[0]} durationInFrames={S.today[1]}>
        <Scene len={S.today[1]} portrait={portrait} caption={C[lang].s[0] as unknown as [string, string]} idx={1}>{(f) => <Phone src={`${lang}-phone-today-full.png`} w={pw} frame={f} scroll={[40, 190]} />}</Scene>
      </Sequence>
      <Sequence from={S.person[0]} durationInFrames={S.person[1]}>
        <Scene len={S.person[1]} portrait={portrait} caption={C[lang].s[1] as unknown as [string, string]} idx={2}>{(f) => <Phone src={`${lang}-phone-person-full.png`} w={pw} frame={f} scroll={[30, 180]} />}</Scene>
      </Sequence>
      <Sequence from={S.ledger[0]} durationInFrames={S.ledger[1]}>
        <Scene len={S.ledger[1]} portrait={portrait} caption={C[lang].s[2] as unknown as [string, string]} idx={3}>{(f) => <Ledger lang={lang} portrait={portrait} f={f} />}</Scene>
      </Sequence>
      <Sequence from={S.apps[0]} durationInFrames={S.apps[1]}><Apps lang={lang} portrait={portrait} /></Sequence>
      <Sequence from={S.end[0]} durationInFrames={S.end[1]}><End lang={lang} portrait={portrait} /></Sequence>
    </AbsoluteFill>
  );
};
