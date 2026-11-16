// Background music for the demo film, synthesized from scratch (no samples, no third-party tracks).
//   node media/video/bgm.mjs   → media/video/public/bgm.wav
// Punchy dance-pop, 128 BPM in D major: D · A · Bm · G (I–V–vi–IV). Heavy four-on-the-floor kick, clap + snare on 2 and 4,
// rolling 16th bass and wide saw chord stabs that pump under the kick, plucked arpeggios and a hook melody.
// The beat grid is shifted so the drop lands exactly on the logo (4 s); a half-second of silence before it makes it hit.
// The question at the start gets a filtered groove and a build-up (snare roll + riser) into the drop.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SR = 44100, DUR = 37.06, N = Math.round(SR * DUR);
const BPM = 128, BEAT = 60 / BPM, BAR = BEAT * 4;
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N), PAD = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

// film moments (seconds, 30 fps): the logo and ending match Film.tsx and Story.tsx; the ledger chime follows the Xiaohongshu cut (Story.tsx)
const BRAND = 120 / 30, APP = 195 / 30, CARD = (626 + 28) / 30, END = 960 / 30;
const GRID0 = BRAND - 2 * BAR; // bar 2 starts on the logo

const CHORDS = [
  [62, 66, 69, 74], // D   D F# A D
  [61, 64, 69, 73], // A   C# E A C#
  [59, 62, 66, 71], // Bm  B D F# B
  [59, 62, 67, 71], // G   B D G B
];
const ROOTS = [38, 33, 35, 31];
// hook melody, one phrase per two bars (beat offset, midi note, length in beats)
const HOOK = [
  [[0, 78, .5], [.5, 81, .5], [1, 83, .75], [2, 81, .5], [2.5, 78, .5], [3, 76, 1]],
  [[0, 76, .5], [.5, 78, .5], [1, 81, 1.5], [3, 78, .5], [3.5, 76, .5]],
  [[0, 74, .5], [.5, 78, .5], [1, 83, .75], [2, 81, .5], [2.5, 83, .5], [3, 85, 1]],
  [[0, 86, .75], [1, 85, .5], [1.5, 83, .5], [2, 81, 1.5]],
];

function add(t0, len, fn, pan = 0, send = 0.2, gain = 1, bus = null) {
  const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(N, Math.round((t0 + len) * SR));
  const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR);
    if (bus) { bus[i] += v * gain; continue; }
    L[i] += v * gl; R[i] += v * gr; SEND[i] += v * send * gain;
  }
}

// plucked synth: a saw whose upper harmonics die away first, so it starts bright and mellows
const pluck = (f, len, vel, decay = 6) => (t) => {
  const env = Math.exp(-t * decay) * Math.min(1, t * 600) * Math.min(1, (len - t) * 40);
  let v = 0;
  for (let k = 1; k <= 9; k++) v += Math.sin(TAU * f * k * t) / k * Math.exp(-t * k * 0.9);
  return vel * env * v;
};
// lead: a brighter, slightly detuned square-ish voice for the hook melody
const lead = (f, len, vel) => (t) => {
  const env = Math.min(1, t * 200) * Math.exp(-t * 2.5) * Math.min(1, (len - t) * 30);
  const vib = 1 + 0.004 * Math.sin(TAU * 5.5 * t) * Math.min(1, t * 3);
  let v = 0;
  for (const d of [1, 1.006]) for (let k = 1; k <= 7; k += 2) v += Math.sin(TAU * f * d * vib * k * t) / k * Math.exp(-t * k * 1.2);
  return vel * env * v * 0.5;
};
const pad = (f, len) => (t) => {
  const env = Math.min(1, t / 0.25) * Math.min(1, (len - t) / 0.3);
  let v = 0;
  for (const d of [0.996, 1, 1.004]) for (let k = 1; k <= 4; k++) v += Math.sin(TAU * f * d * k * t + d * 7) / (k * k);
  return env * v / 3;
};
const bass = (f, len) => (t) => Math.min(1, t * 400) * Math.exp(-t * 7) * Math.min(1, (len - t) * 60) *
  (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2 * t) + 0.12 * Math.sin(TAU * f * 3 * t));
const kick = (t) => { const f = 50 + 110 * Math.exp(-t * 32); return Math.exp(-t * 11) * Math.sin(TAU * f * t) + 0.25 * Math.exp(-t * 90) * Math.sin(TAU * 1800 * t); };
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hp = (k) => { let prev = 0; return () => { const n = noise(); const v = n - k * prev; prev = n; return v; }; };
const hat = (decay = 60) => { const h = hp(1); return (t) => h() * Math.exp(-t * decay) * 0.8; };
const clap = () => { const h = hp(0.6); return (t) => h() * (Math.exp(-t * 28) + (t > 0.011 ? 0.7 * Math.exp(-(t - 0.011) * 30) : 0) + (t > 0.022 ? 0.5 * Math.exp(-(t - 0.022) * 22) : 0)) * 0.45; };
const crash = () => { const h = hp(1); return (t) => h() * Math.exp(-t * 2.2) * 0.35; };
const chime = (f) => (t) => Math.exp(-t * 1.8) * Math.min(1, t * 300) * (Math.sin(TAU * f * t + 2 * Math.exp(-t * 3) * Math.sin(TAU * f * 3.5 * t)) + 0.3 * Math.sin(TAU * f * 2 * t));

// wide saw chord stab (7 detuned voices), the "big room" chord sound
const stab = (f, len) => (t) => {
  const env = Math.min(1, t * 300) * Math.exp(-t * 5) * Math.min(1, (len - t) * 40);
  let v = 0;
  for (const d of [0.985, 0.992, 0.997, 1, 1.003, 1.008, 1.015]) for (let k = 1; k <= 10; k++) v += Math.sin(TAU * f * d * k * t + d * k * 3) / k * Math.exp(-t * k * 0.6);
  return env * v / 7;
};
const snare = () => { const h = hp(0.3); return (t) => 0.5 * h() * Math.exp(-t * 18) + 0.4 * Math.sin(TAU * 190 * t) * Math.exp(-t * 30); };
const kickBig = (t) => { const f = 46 + 140 * Math.exp(-t * 26); return Math.tanh(1.6 * Math.exp(-t * 7) * Math.sin(TAU * f * t)) + 0.35 * Math.exp(-t * 120) * Math.sin(TAU * 2400 * t); };

const nBars = Math.ceil((DUR - GRID0) / BAR);
for (let b = 0; b < nBars; b++) {
  const t = GRID0 + b * BAR, ch = CHORDS[((b % 4) + 4) % 4], root = ROOTS[((b % 4) + 4) % 4];
  if (t >= END - 0.01) break;
  const drop = t >= BRAND - 0.01;
  // plucked arpeggio on 16ths in the drop, 8ths in the intro
  const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12, ch[2] + 12];
  const step = drop ? 16 : 8;
  for (let k = 0; k < step; k++) add(t + k * BAR / step, BAR / step * 1.6, pluck(hz(arp[k % 8] + (drop && k % 4 === 3 ? 12 : 0)), BAR / step * 1.6, drop ? 0.08 : 0.12, 9), k % 2 ? 0.4 : -0.4, 0.3);
  if (!drop) {
    // intro: clap on 2 and 4, kick on 1 and 3, shaker
    for (const q of [1, 3]) add(t + q * BEAT, 0.25, clap(), 0, 0.25, 0.6);
    for (const q of [0, 2]) add(t + q * BEAT, 0.3, kickBig, 0, 0, 0.5);
    for (let s16 = 0; s16 < 16; s16++) add(t + s16 * BEAT / 4, 0.05, hat(90), 0.25, 0.05, s16 % 4 === 2 ? 0.14 : 0.07);
    continue;
  }
  // chord stabs: on the off-beats ("and" of each beat), pumping
  for (let q = 0; q < 4; q++) for (const m of ch) add(t + q * BEAT + BEAT / 2, BEAT * 0.45, stab(hz(m), BEAT * 0.45), 0, 0.25, 0.085, PAD);
  // long chord underneath on the first beat
  for (const m of ch) add(t, BAR, pad(hz(m), BAR), 0, 0, 0.04, PAD);
  for (let q = 0; q < 4; q++) {
    add(t + q * BEAT, 0.4, kickBig, 0, 0, 1.0);
    if (q % 2) { add(t + q * BEAT, 0.25, clap(), 0, 0.3, 0.7); add(t + q * BEAT, 0.25, snare(), 0, 0.2, 0.55); }
    add(t + q * BEAT + BEAT / 2, 0.14, hat(22), -0.2, 0.08, 0.3);   // open hat on the off-beat
    // rolling bass: three 16ths after each kick (the kick owns the first)
    for (const s16 of [1, 2, 3]) add(t + q * BEAT + s16 * BEAT / 4, BEAT / 4 * 0.9, bass(hz(root + (s16 === 2 ? 12 : 0)), BEAT / 4 * 0.9), 0, 0, 0.34);
  }
  for (let s16 = 0; s16 < 16; s16++) add(t + s16 * BEAT / 4, 0.04, hat(120), 0.3, 0.03, s16 % 2 ? 0.1 : 0.06);
  // hook melody from when the app appears
  if (t >= APP - BAR) {
    const ph = HOOK[((Math.floor(b / 2) % 4) + 4) % 4];
    for (const [beat, m, len] of ph) {
      if (b % 2 === 0) add(t + beat * BEAT, len * BEAT, lead(hz(m), len * BEAT, 0.3), 0.1, 0.35);
      else add(t + beat * BEAT, len * BEAT, lead(hz(m - 12), len * BEAT, 0.2), -0.1, 0.35);
    }
  }
}
// build-up: riser and a snare roll that doubles in speed, then half a beat of silence before the drop
add(BRAND - 2 * BAR, 2 * BAR - BEAT / 2, (() => { const h = hp(0.7); const len = 2 * BAR - BEAT / 2; return (t) => h() * (t / len) ** 2.5 * 0.35; })(), 0, 0.4);
for (let k = 0; k < 24; k++) { const tt = BRAND - BAR - BEAT / 2 + k * ((BAR) / 24); if (tt < BRAND - BEAT / 2) add(tt, 0.07, snare(), 0, 0.2, 0.15 + k * 0.03); }
{ const s0 = Math.round((BRAND - BEAT / 2) * SR), s1 = Math.round(BRAND * SR); for (let i = s0; i < s1; i++) { L[i] = 0; R[i] = 0; SEND[i] = 0; PAD[i] = 0; } }
add(BRAND, 2.5, crash(), 0, 0.5, 0.9);
// moments: logo, ledger card, and the final chord
add(BRAND + 0.05, 2.5, chime(hz(86)), -0.2, 0.6, 0.06);
add(CARD, 2.5, chime(hz(90)), 0.15, 0.6, 0.08); add(CARD + 0.08, 2.5, chime(hz(93)), -0.15, 0.6, 0.05);
add(END, 2.5, crash(), 0, 0.5, 0.6);
for (const [k, m] of [62, 69, 74, 78, 81].entries()) add(END + 0.03 * k, DUR - END, stab(hz(m), DUR - END), (k - 2) * 0.2, 0.6, 0.08);
add(END, 1.2, kickBig, 0, 0, 1.0);

// sidechain: the pad dips on every kick and swells back, the "pumping" feel of dance pop
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (!PAD[i]) continue;
  const ph = (((t - GRID0) % BEAT) + BEAT) % BEAT / BEAT;
  const duck = t >= BRAND && t < END ? 0.2 + 0.8 * Math.min(1, ph * 2.5) : 1;
  L[i] += PAD[i] * duck * 1.1; R[i] += PAD[i] * duck * 1.1; SEND[i] += PAD[i] * duck * 0.3;
}

// room: four combs and two all-passes (Schroeder), fed by the send
function reverb(input) {
  const out = new Float32Array(N);
  for (const [d, g] of [[1557, 0.82], [1617, 0.81], [1491, 0.83], [1422, 0.84]]) {
    const buf = new Float32Array(d); let p = 0, lp = 0;
    for (let i = 0; i < N; i++) { const y = buf[p]; lp = y * 0.6 + lp * 0.4; buf[p] = input[i] + lp * g; p = (p + 1) % d; out[i] += y / 4; }
  }
  for (const [d, g] of [[225, 0.5], [556, 0.5]]) {
    const buf = new Float32Array(d); let p = 0;
    for (let i = 0; i < N; i++) { const b = buf[p]; const y = -out[i] * g + b; buf[p] = out[i] + b * g; p = (p + 1) % d; out[i] = y; }
  }
  return out;
}
const wet = reverb(SEND);
const shift = Math.round(SR * 0.011); // a little width: right channel reverb slightly later
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (SR * 0.4)) * Math.min(1, (N - i) / (SR * 2.6));
  L[i] = (L[i] + wet[i] * 0.55) * fade;
  R[i] = (R[i] + (i >= shift ? wet[i - shift] : 0) * 0.55) * fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
// soft-clip then normalize to -1.5 dBFS
const norm = 0.84 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  pcm.writeInt16LE(Math.round(Math.tanh(L[i] * norm) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.tanh(R[i] * norm) * 32767), 46 + i * 4);
}
const out = path.join(import.meta.dirname, "public", "bgm.wav");
fs.mkdirSync(path.dirname(out), { recursive: true });
const raw = out.replace(/\.wav$/, ".raw.wav");
fs.writeFileSync(raw, pcm);
// a brighter top and a little less low end (dance-pop mixes sit bright), then web-video loudness (-16 LUFS) with a true-peak ceiling
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-af", "highpass=f=28,bass=g=-2:f=110,treble=g=3:f=5000,loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", String(SR), out]);
fs.rmSync(raw);
console.log("bgm.wav", (fs.statSync(out).size / 1e6).toFixed(1), "MB");
