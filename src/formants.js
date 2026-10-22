// Formant tables and pure math for the Choir and Robo Singer voices. No DOM, no audio nodes: the audio engine reads these numbers.
// A vowel is three band-pass formants F1 < F2 < F3 (Hz), each with a Q and a relative gain.
// The right-hand tilt morphs along u -> o -> a -> e -> i (position 0..1); tilt 0 (neutral) lands on "a" (ah).

export const VOWELS = ["u", "o", "a", "e", "i"];
export const VOWEL_LABELS = { u: "oo", o: "oh", a: "ah", e: "eh", i: "ee" };
export const FORMANTS = {
  u: { f: [300, 870, 2240], q: [6, 9, 14], g: [1, 0.2, 0.06] },
  o: { f: [450, 800, 2830], q: [6, 9, 14], g: [1, 0.3, 0.08] },
  a: { f: [730, 1090, 2440], q: [6, 9, 14], g: [1, 0.5, 0.2] },
  e: { f: [530, 1840, 2480], q: [6, 9, 14], g: [1, 0.45, 0.2] },
  i: { f: [270, 2290, 3010], q: [6, 9, 14], g: [1, 0.32, 0.24] },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, x) => a + (b - a) * x;

/** Linear blend of two {f,q,g} specs. */
export function blendSpec(a, b, x) {
  const m = (k) => a[k].map((v, i) => lerp(v, b[k][i], x));
  return { f: m("f"), q: m("q"), g: m("g") };
}
/** Scale a spec's frequencies and Qs (the Robo voice sits a little brighter and tighter). */
export function scaleSpec(s, fMul = 1, qMul = 1) {
  return { f: s.f.map((v) => v * fMul), q: s.q.map((v) => v * qMul), g: s.g.slice() };
}
/** Position (0..1) of a vowel letter on the u-o-a-e-i line. */
export const vowelPosOf = (v) => VOWELS.indexOf(v) / (VOWELS.length - 1);
/** Interpolated vowel at pos 0 (u) .. 1 (i). pos 0.5 is exactly "a". */
export function vowelAt(pos) {
  const p = clamp(pos, 0, 1) * (VOWELS.length - 1);
  const i = Math.min(Math.floor(p), VOWELS.length - 2);
  return blendSpec(FORMANTS[VOWELS[i]], FORMANTS[VOWELS[i + 1]], p - i);
}
/** Nearest vowel letter for a position. */
export const nearestVowel = (pos) => VOWELS[Math.round(clamp(pos, 0, 1) * (VOWELS.length - 1))];
/** Friendly label of the nearest vowel: "ah". */
export const vowelLabel = (pos) => VOWEL_LABELS[nearestVowel(pos)];

// ---- tilt -> vowel. Tilt is -1 (outward) .. +1 (inward); the engine receives the existing Tone filter {freq}, so invert it.
const FILTER = { neutralHz: 1200, darkHz: 250, brightHz: 5000 }; // same numbers as RULES.filter in gestures.js
export function tiltFromFilter(f) {
  if (!f || f.freq == null) return 0;
  if (f.freq < FILTER.neutralHz) return -clamp((FILTER.neutralHz - f.freq) / (FILTER.neutralHz - FILTER.darkHz), 0, 1);
  return clamp((f.freq - FILTER.neutralHz) / (FILTER.brightHz - FILTER.neutralHz), 0, 1);
}
/** Tilt -1..1 -> vowel position 0..1 (0 outward = oo, 0.5 neutral = ah, 1 inward = ee). */
export const vowelPosFromTilt = (t) => clamp((t + 1) / 2, 0, 1);
export const vowelPosFromFilter = (f) => vowelPosFromTilt(tiltFromFilter(f));
/** A syllable's own vowel (base) shifted by the tilt position (0.5 = no shift). */
export const vowelPosFor = (base, tiltPos) => clamp(base + (tiltPos - 0.5), 0, 1);

// ---- Robo Singer syllables: a short consonant onset, then the vowel.
export const CONSONANTS = {
  l: { dur: 0.07, glide: 0.05, amp: 0.7, spec: { f: [360, 1250, 2700], q: [6, 9, 14], g: [1, 0.35, 0.1] } },
  d: { dur: 0.035, glide: 0.03, amp: 0.3, spec: { f: [300, 1800, 2650], q: [6, 9, 14], g: [1, 0.4, 0.15] }, burst: { hz: 3200, q: 1.4, dur: 0.012, gain: 0.5 } },
  n: { dur: 0.08, glide: 0.05, amp: 0.55, spec: { f: [260, 1150, 2400], q: [6, 9, 14], g: [1, 0.1, 0.04] } },
  m: { dur: 0.1, glide: 0.06, amp: 0.55, spec: { f: [250, 1000, 2100], q: [6, 9, 14], g: [1, 0.08, 0.03] } },
};
export const SYLLABLES = {
  la: { name: "la", cons: "l", vowel: "a" },
  doo: { name: "doo", cons: "d", vowel: "u" },
  na: { name: "na", cons: "n", vowel: "a" },
  mm: { name: "mm", cons: "m", vowel: "u", hum: true },
  aah: { name: "aah", cons: null, vowel: "a" },
};
export const SYLLABLE_LIST = [
  { id: "la", name: "la" }, { id: "doo", name: "doo" }, { id: "na", name: "na" }, { id: "mm", name: "mm" }, { id: "aah", name: "aah" },
];
/** Timing plan for one syllable: when the consonant ends, when the vowel has settled, and its starting amplitude. */
export function syllablePlan(id) {
  const s = SYLLABLES[id] || SYLLABLES.la;
  const c = s.cons ? CONSONANTS[s.cons] : null;
  const hum = !!s.hum;
  const consDur = c ? c.dur * (hum ? 1.8 : 1) : 0;
  const glide = c ? c.glide : 0;
  return {
    id: s.name in SYLLABLES ? s.name : "la",
    cons: c, spec: c ? c.spec : null,
    vowelPos: vowelPosOf(s.vowel),
    consDur, glide,
    onsetEnd: consDur + glide, // seconds after the note starts until the vowel has settled
    startAmp: c ? c.amp : 1,
    endAmp: hum ? 0.8 : 1, // "mm" stays a closed-mouth hum
    burst: c && c.burst ? c.burst : null,
  };
}

// ---- delayed vibrato (shared by Choir, Robo Singer and the singing theremin)
export const VIBRATO = { delay: 0.25, ramp: 0.3, depthCents: 8, rate: 5.4 };
/** Vibrato depth (0..1 of full) at t seconds after the note starts: nothing until `delay`, then a linear fade-in. */
export function vibratoDepthAt(t, { delay = VIBRATO.delay, ramp = VIBRATO.ramp } = {}) {
  return t <= delay ? 0 : t >= delay + ramp ? 1 : (t - delay) / ramp;
}
