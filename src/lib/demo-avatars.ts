// LINE-style icons for the fictional 夜间接客 regulars. Middle-aged men's LINE icons are mostly a golf course,
// their dog, a grandchild, scenery, their car, or the default silhouette — so the demo uses the same kinds.
// Drawn as flat SVG: no real photos, no real people.
const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">${body}</svg>`;

const AVATARS: Record<string, string> = {
  // golf course
  "田中さん": wrap(`
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fc7f0"/><stop offset="1" stop-color="#d9eefb"/></linearGradient></defs>
    <rect width="96" height="96" fill="url(#s)"/>
    <ellipse cx="20" cy="58" rx="34" ry="12" fill="#5d9b52"/><ellipse cx="80" cy="60" rx="30" ry="11" fill="#4f8c46"/>
    <rect y="58" width="96" height="38" fill="#6fb35f"/>
    <ellipse cx="58" cy="76" rx="26" ry="8" fill="#8fd07a"/>
    <rect x="60" y="44" width="1.6" height="32" fill="#f4f4f4"/><path d="M61.6 44 L74 48 L61.6 52 Z" fill="#e2483d"/>
    <ellipse cx="61" cy="76" rx="3" ry="1.2" fill="#2f5d2a"/>
    <circle cx="30" cy="84" r="2.4" fill="#fff"/>`),
  // selfie in a baseball cap
  "山本さん": wrap(`
    <rect width="96" height="96" fill="#f2c9a0"/><rect y="62" width="96" height="34" fill="#1f2430"/>
    <circle cx="48" cy="50" r="20" fill="#f6d7b8"/>
    <path d="M26 44 Q28 22 48 22 Q68 22 70 44 Z" fill="#f26b1d"/><path d="M48 44 L86 46 Q80 52 64 50 Z" fill="#1f2430"/>
    <rect x="26" y="42" width="44" height="4" fill="#1f2430"/>
    <circle cx="41" cy="52" r="2" fill="#2b2b2b"/><circle cx="55" cy="52" r="2" fill="#2b2b2b"/>
    <path d="M42 60 Q48 64 54 60" stroke="#8a4a32" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M20 96 Q22 72 48 72 Q74 72 76 96 Z" fill="#f26b1d"/><rect x="44" y="72" width="8" height="24" fill="#1f2430"/>`),
  // toy poodle
  "鈴木さん": wrap(`
    <rect width="96" height="96" fill="#f4ece2"/>
    <g fill="#b07a4f"><circle cx="48" cy="30" r="11"/><circle cx="38" cy="33" r="9"/><circle cx="58" cy="33" r="9"/>
      <circle cx="28" cy="50" r="11"/><circle cx="68" cy="50" r="11"/><circle cx="25" cy="62" r="9"/><circle cx="71" cy="62" r="9"/>
      <circle cx="48" cy="54" r="20"/><circle cx="48" cy="82" r="22"/></g>
    <ellipse cx="48" cy="62" rx="10" ry="8" fill="#c99067"/>
    <circle cx="40" cy="50" r="3" fill="#2a1d14"/><circle cx="56" cy="50" r="3" fill="#2a1d14"/><circle cx="41" cy="49" r="1" fill="#fff"/><circle cx="57" cy="49" r="1" fill="#fff"/>
    <ellipse cx="48" cy="60" rx="3.4" ry="2.6" fill="#2a1d14"/>
    <path d="M45 66 Q48 69 51 66" stroke="#2a1d14" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M38 72 L48 76 L58 72" stroke="#e24b6b" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  // grandchild
  "高橋さん": wrap(`
    <rect width="96" height="96" fill="#fdf3d8"/>
    <circle cx="48" cy="54" r="28" fill="#fbe0c8"/>
    <path d="M22 50 Q26 18 48 18 Q70 18 74 50 Q66 36 48 36 Q30 36 22 50 Z" fill="#f7f7f7"/>
    <path d="M20 52 Q22 26 48 22 Q74 26 76 52" stroke="#9fc8e8" stroke-width="5" fill="none"/>
    <circle cx="38" cy="56" r="2.6" fill="#3a2a22"/><circle cx="58" cy="56" r="2.6" fill="#3a2a22"/>
    <ellipse cx="32" cy="64" rx="5" ry="3" fill="#f6b3a6" opacity=".7"/><ellipse cx="64" cy="64" rx="5" ry="3" fill="#f6b3a6" opacity=".7"/>
    <path d="M43 66 Q48 71 53 66" stroke="#c86a5a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <rect y="84" width="96" height="12" fill="#bfe0f3"/>`),
  // sunset over the sea
  "佐藤さん": wrap(`
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4a8c"/><stop offset=".5" stop-color="#e98b6d"/><stop offset="1" stop-color="#f7c873"/></linearGradient></defs>
    <rect width="96" height="96" fill="url(#g)"/>
    <circle cx="48" cy="58" r="14" fill="#ffe4a3"/>
    <rect y="58" width="96" height="38" fill="#2f4f7f"/>
    <g stroke="#f7c873" stroke-width="2" stroke-linecap="round" opacity=".85"><path d="M36 64 H60"/><path d="M40 70 H56"/><path d="M44 76 H52"/></g>
    <g stroke="#9fb3d6" stroke-width="1.4" stroke-linecap="round" opacity=".5"><path d="M8 84 H24"/><path d="M70 82 H88"/></g>`),
  // LINE default icon
  "伊藤さん": wrap(`
    <rect width="96" height="96" fill="#e6e9ee"/>
    <circle cx="48" cy="38" r="16" fill="#b8bec9"/>
    <path d="M16 96 Q18 62 48 62 Q78 62 80 96 Z" fill="#b8bec9"/>`),
  // his car
  "中村さん": wrap(`
    <defs><linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f2"/><stop offset="1" stop-color="#f1f5f8"/></linearGradient></defs>
    <rect width="96" height="96" fill="url(#k)"/><rect y="66" width="96" height="30" fill="#7d8590"/>
    <path d="M10 64 Q14 52 28 50 L40 42 Q48 38 60 40 L72 48 Q86 50 88 60 L88 64 Z" fill="#1d3557"/>
    <path d="M42 45 L58 43 L68 49 L40 50 Z" fill="#a9c7e0"/>
    <circle cx="28" cy="66" r="8" fill="#1b1b1b"/><circle cx="28" cy="66" r="3.4" fill="#c7ccd3"/>
    <circle cx="72" cy="66" r="8" fill="#1b1b1b"/><circle cx="72" cy="66" r="3.4" fill="#c7ccd3"/>
    <rect x="84" y="56" width="4" height="3" fill="#ffd166"/>`),
  // Mt. Fuji
  "渡辺さん": wrap(`
    <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb1e6"/><stop offset="1" stop-color="#cfe7f8"/></linearGradient></defs>
    <rect width="96" height="96" fill="url(#f)"/>
    <path d="M-4 80 L36 34 Q48 26 60 34 L100 80 Z" fill="#4e6c8f"/>
    <path d="M36 34 Q48 26 60 34 L66 42 L58 40 L52 46 L46 40 L40 44 L32 39 Z" fill="#fff"/>
    <rect y="78" width="96" height="18" fill="#5c8f4e"/>
    <g fill="#fff" opacity=".9"><ellipse cx="18" cy="22" rx="9" ry="3.5"/><ellipse cx="76" cy="16" rx="11" ry="4"/></g>`),
};

// extra icons for the newer regulars
AVATARS["小林くん"] = wrap(`<rect width="96" height="96" fill="#d9e4f2"/><circle cx="48" cy="38" r="16" fill="#9fb0c8"/><path d="M16 96 Q18 62 48 62 Q78 62 80 96 Z" fill="#9fb0c8"/>`);
AVATARS["吉田さん"] = wrap(`<rect width="96" height="96" fill="#2b2f3a"/><rect x="30" y="30" width="30" height="44" rx="4" fill="#f4b73c"/><rect x="30" y="24" width="30" height="12" rx="6" fill="#fff"/><path d="M60 40 h8 a6 6 0 0 1 6 6 v12 a6 6 0 0 1 -6 6 h-8" stroke="#f4b73c" stroke-width="5" fill="none"/>`);
AVATARS["松本さん"] = wrap(`<rect width="96" height="96" fill="#eaf3e3"/><path d="M26 30 L34 52 L22 50 Z M70 30 L62 52 L74 50 Z" fill="#c9823f"/><circle cx="48" cy="58" r="24" fill="#d9924a"/><ellipse cx="48" cy="68" rx="14" ry="11" fill="#fbeedd"/><circle cx="39" cy="54" r="3" fill="#2a1d14"/><circle cx="57" cy="54" r="3" fill="#2a1d14"/><ellipse cx="48" cy="63" rx="4" ry="3" fill="#2a1d14"/>`);
AVATARS["木村さん"] = AVATARS["伊藤さん"];

// session id (demo/night/chats.json) → icon
const BY_ID: Record<string, string> = {
  demo_tanaka: "田中さん", demo_yamamoto: "山本さん", demo_suzuki: "鈴木さん", demo_takahashi: "高橋さん", demo_sato: "佐藤さん", demo_ito: "伊藤さん",
  demo_nakamura: "中村さん", demo_watanabe: "渡辺さん", demo_kobayashi: "小林くん", demo_kimura: "木村さん", demo_yoshida: "吉田さん", demo_matsumoto: "松本さん",
};

/** SVG for a demo person key ("demo_tanaka", or the older "demo:演示·田中さん"), or null. */
export function demoAvatar(key: string): string | null {
  if (BY_ID[key]) return AVATARS[BY_ID[key]] ?? null;
  const m = key.match(/^demo:演示·(.+)$/);
  return m ? AVATARS[m[1]] ?? null : null;
}
