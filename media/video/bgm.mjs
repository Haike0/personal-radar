// Background music for the demo film, synthesized from scratch (no samples, no third-party tracks).
//   node media/video/bgm.mjs   → media/video/public/bgm.wav
// 100 BPM, F major: Fmaj7 · Am7 · B♭maj7 · Csus2, soft electric piano, pad, sub bass, light drums.
// The drums come in when the app appears and leave for the ending; two chimes mark the logo and the ledger card.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SR = 44100, DUR = 37.06, N = Math.round(SR * DUR);
const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4;
const L = new Float32Array(N), R = new Float32Array(N), SEND = new Float32Array(N);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

// film moments (seconds), from the scene table in Film.tsx (30 fps)
const BRAND = 120 / 30, APP = 195 / 30, CARD = (600 + 70) / 30, END = 960 / 30;

const CHORDS = [
  [53, 57, 60, 64], // Fmaj7  F A C E
  [57, 60, 64, 67], // Am7    A C E G
  [58, 62, 65, 69], // B♭maj7 B♭ D F A
  [48, 55, 60, 62], // Csus2  C G C D
];
const ROOTS = [41, 45, 46, 36];

function add(t0, len, fn, pan = 0, send = 0.25, gain = 1) {
  const s0 = Math.max(0, Math.round(t0 * SR)), s1 = Math.min(N, Math.round((t0 + len) * SR));
  const gl = Math.cos((pan + 1) * Math.PI / 4) * gain, gr = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let i = s0; i < s1; i++) {
    const v = fn((i - s0) / SR);
    L[i] += v * gl; R[i] += v * gr; SEND[i] += v * send * gain;
  }
}

// electric piano: two-operator FM, the bell-like edge fades faster than the body
const epiano = (f, len, vel) => (t) => {
  const idx = 1.6 * Math.exp(-t * 6);
  const env = Math.exp(-t * 2.2) * Math.min(1, t * 400) * Math.min(1, (len - t) * 20);
  return vel * env * Math.sin(TAU * f * t + idx * Math.sin(TAU * f * t));
};
// pad: detuned sines with a slow swell
const pad = (f, len) => (t) => {
  const env = Math.min(1, t / 0.9) * Math.min(1, (len - t) / 0.7);
  return env * (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 1.004 * t + 1) + 0.25 * Math.sin(TAU * f * 2.001 * t)) / 1.85;
};
const bass = (f, len) => (t) => Math.exp(-t * 2.5) * Math.min(1, t * 200) * Math.min(1, (len - t) * 30) * (Math.sin(TAU * f * t) + 0.15 * Math.sin(TAU * f * 2 * t));
const kick = (t) => { const f = 45 + 80 * Math.exp(-t * 28); return Math.exp(-t * 9) * Math.sin(TAU * f * t * (1 + 0.0)); };
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const hat = () => { let prev = 0; return (t) => { const n = noise(); const hp = n - prev; prev = n; return hp * Math.exp(-t * 70) * 0.5; }; };
const chime = (f) => (t) => Math.exp(-t * 1.6) * Math.min(1, t * 300) * (Math.sin(TAU * f * t + 2.2 * Math.exp(-t * 3) * Math.sin(TAU * f * 3.5 * t)) + 0.3 * Math.sin(TAU * f * 2 * t));

const bars = Math.ceil(DUR / BAR);
for (let b = 0; b < bars; b++) {
  const t = b * BAR, ch = CHORDS[b % 4];
  if (t >= DUR) break;
  // pad all the way, a little louder before the drums come in
  for (const m of ch) add(t, BAR + 0.6, pad(hz(m), BAR + 0.6), 0, 0.5, t < APP ? 0.05 : 0.035);
  // electric piano: chord on 1, broken chord on the off-beats
  for (const [k, m] of ch.entries()) add(t + k * 0.012, BAR, epiano(hz(m + 12), BAR, 0.11), (k - 1.5) * 0.25, 0.35);
  const arp = [ch[1] + 12, ch[2] + 12, ch[3] + 12, ch[2] + 12, ch[1] + 24, ch[3] + 12];
  [1.5, 2, 2.5, 3, 3.5, 3.75].forEach((beat, k) => add(t + beat * BEAT, BEAT * 1.5, epiano(hz(arp[k]), BEAT * 1.5, 0.05), k % 2 ? 0.45 : -0.45, 0.45));
  // rhythm section only while the app is on screen
  if (t + BAR > APP && t < END) {
    for (let q = 0; q < 4; q++) {
      const tb = t + q * BEAT;
      if (tb < APP - 0.01 || tb >= END) continue;
      if (q === 0 || q === 2) add(tb, 0.4, kick, 0, 0.05, 0.55);
      add(tb + BEAT / 2, 0.08, hat(), 0.3, 0.1, 0.12);
      if (q === 1 || q === 3) add(tb, 0.06, hat(), -0.2, 0.1, 0.06);
    }
    add(t, BEAT * 1.8, bass(hz(ROOTS[b % 4]), BEAT * 1.8), 0, 0.02, 0.32);
    add(t + BEAT * 2.5, BEAT * 1.4, bass(hz(ROOTS[b % 4]), BEAT * 1.4), 0, 0.02, 0.22);
  }
}
// moments: logo, ledger card, and the final chord
add(BRAND, 3, chime(hz(84)), -0.2, 0.6, 0.09); add(BRAND + 0.09, 3, chime(hz(91)), 0.2, 0.6, 0.06);
add(CARD, 2.5, chime(hz(88)), 0.15, 0.6, 0.08); add(CARD + 0.08, 2.5, chime(hz(93)), -0.15, 0.6, 0.05);
for (const [k, m] of [53, 60, 64, 69, 72].entries()) add(END + 0.02 * k, DUR - END, epiano(hz(m + 12), DUR - END, 0.09), (k - 2) * 0.2, 0.6);

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
// web-video loudness (-16 LUFS), with a true-peak ceiling so the kick never clips
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", String(SR), out]);
fs.rmSync(raw);
console.log("bgm.wav", (fs.statSync(out).size / 1e6).toFixed(1), "MB");
