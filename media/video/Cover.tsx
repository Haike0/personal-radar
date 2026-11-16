import { AbsoluteFill, Img, staticFile } from "remotion";

// Xiaohongshu cover (3:4): she asks the dreaded question, he panics, ReadMe pops up with the receipt.
// All chat text is made up for the cover; nothing comes from a real conversation.
const FONT = `-apple-system, "SF Pro Display", "PingFang SC", "Noto Sans CJK SC", sans-serif`;

const Bubble: React.FC<{ me?: boolean; children: React.ReactNode; big?: boolean }> = ({ me, children, big }) => (
  <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 18 }}>
    {!me && <div style={{ width: 84, height: 84, borderRadius: 42, flex: "none", display: "grid", placeItems: "center", fontSize: 50, background: "#ffe1ea" }}>😤</div>}
    <div style={{ padding: big ? "26px 36px" : "22px 32px", borderRadius: 36, borderBottomLeftRadius: me ? 36 : 10, borderBottomRightRadius: me ? 10 : 36,
      fontSize: big ? 50 : 44, fontWeight: big ? 800 : 600, lineHeight: 1.3, color: me ? "#fff" : "#1b1d24",
      background: me ? "#2f7bf6" : "#fff", boxShadow: "0 14px 34px -18px rgba(20,24,40,.35)" }}>{children}</div>
    {me && <div style={{ width: 84, height: 84, borderRadius: 42, flex: "none", display: "grid", placeItems: "center", fontSize: 50, background: "#dfeaff" }}>😰</div>}
  </div>
);

export const Cover: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT, background: "linear-gradient(170deg, #fff1f4 0%, #f6f4ff 48%, #e9f3ff 100%)", padding: "70px 64px", wordBreak: "keep-all" }}>
    <div style={{ display: "inline-flex", alignSelf: "flex-start", padding: "10px 26px", borderRadius: 999, background: "#ff3b6b", color: "#fff", fontSize: 38, fontWeight: 800, letterSpacing: 2 }}>男生灵魂拷问</div>
    <div style={{ marginTop: 26, fontSize: 118, fontWeight: 900, lineHeight: 1.08, color: "#111318", letterSpacing: -3 }}>
      你还记得<br /><span style={{ color: "#ff3b6b" }}>答应我啥不？</span>
    </div>

    <div style={{ marginTop: 52, display: "flex", flexDirection: "column", gap: 24 }}>
      <Bubble big>上周答应我的事呢？</Bubble>
      <Bubble>想好了再回答</Bubble>
      <Bubble me>……我想想</Bubble>
    </div>

    {/* the save */}
    <div style={{ marginTop: 40, padding: "30px 34px", borderRadius: 40, background: "rgba(255,255,255,.96)", boxShadow: "0 30px 70px -28px rgba(30,60,140,.45), 0 0 0 3px #2f7bf6",
      transform: "rotate(-1.5deg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Img src={staticFile("icon.png")} style={{ width: 64, height: 64, borderRadius: 16 }} />
        <div style={{ fontSize: 36, fontWeight: 800, color: "#2f7bf6" }}>ReadMe 提醒你</div>
        <div style={{ marginLeft: "auto", fontSize: 30, color: "#8a90a0" }}>刚刚</div>
      </div>
      <div style={{ marginTop: 16, fontSize: 46, fontWeight: 800, color: "#111318", lineHeight: 1.3 }}>你答应过：周六陪她去看展</div>
      <div style={{ marginTop: 12, fontSize: 32, color: "#5d6370", borderLeft: "6px solid #2f7bf6", paddingLeft: 16 }}>原话 · 11/12 23:41「行 周六陪你去」</div>
    </div>

    <div style={{ marginTop: "auto", marginBottom: 20, alignSelf: "center", fontSize: 72, fontWeight: 900, color: "#111318" }}>
      AI 替我记着，<span style={{ color: "#2f7bf6" }}>稳了</span>
    </div>
  </AbsoluteFill>
);
