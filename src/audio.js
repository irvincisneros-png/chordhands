// ChordHands WebAudio engine: presets, hold/strum/arp styles, crossfades, reverb, limiter.
// No samples, no libraries. Every gain change is ramped (setTargetAtTime) to avoid clicks.
import { mtof } from "./theory.js";
import { vowelAt, scaleSpec, vowelPosFor, vowelPosFromFilter, syllablePlan, VIBRATO } from "./formants.js";

/** Instruments, grouped for the Settings select and the stage chip. PRESET_LIST is the flat list in the same order. */
export const PRESET_GROUPS = [
  { name: "Synths", presets: [
    { id: "pad", name: "Warm Pad" }, { id: "bright", name: "Bright Synth" }, { id: "retro", name: "Retro Chip" },
    { id: "supersaw", name: "Supersaw" }, { id: "pluck", name: "Pluck" }, { id: "acid", name: "Acid" }, { id: "bassPad", name: "Synth Bass + Pad" },
  ] },
  { name: "Keys", presets: [
    { id: "ep", name: "Electric Piano" }, { id: "lofi", name: "Lo-fi Keys" }, { id: "organ", name: "Organ" }, { id: "musicbox", name: "Music Box" },
  ] },
  { name: "Band & Orchestra", presets: [
    { id: "strings", name: "Strings" }, { id: "horns", name: "Horns" }, { id: "guitar", name: "Nylon Guitar" },
  ] },
  { name: "Voices", presets: [{ id: "choir", name: "Choir" }, { id: "robo", name: "Robo Singer" }] },
];
export const PRESET_LIST = PRESET_GROUPS.flatMap((g) => g.presets);
export const STYLE_LIST = [
  { id: "hold", name: "Hold (sustain)" },
  { id: "strum", name: "Strum" },
  { id: "arp", name: "Arpeggio" },
];

const ksCache = new Map();
function ksBuffer(ctx, midi) {
  const key = midi + "@" + ctx.sampleRate;
  if (ksCache.has(key)) return ksCache.get(key);
  const sr = ctx.sampleRate, f = mtof(midi);
  const N = Math.max(2, Math.round(sr / f));
  const len = Math.floor(sr * 3);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const line = new Float32Array(N);
  let prev = 0;
  for (let i = 0; i < N; i++) { prev = prev * 0.55 + (Math.random() * 2 - 1) * 0.45; line[i] = prev; }
  const decay = 0.9985 - Math.min(0.004, (f / 880) * 0.003);
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    d[i] = cur;
    line[idx] = (cur + line[(idx + 1) % N]) * 0.5 * decay;
    idx = (idx + 1) % N;
  }
  ksCache.set(key, buf);
  return buf;
}

// Each builder creates one note. Returns {env, nodes, relTc}. env = per-note gain.
function envNode(ctx, out, t, peak, attack) {
  const e = ctx.createGain();
  e.gain.setValueAtTime(0, t);
  e.gain.setTargetAtTime(peak, t, attack / 3 + 0.001);
  e.connect(out);
  return e;
}
function osc(ctx, type, f, detune, dest, t) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  o.connect(dest); o.start(t);
  return o;
}
function lp(ctx, freq, q, dest) {
  const n = ctx.createBiquadFilter();
  n.type = "lowpass"; n.frequency.value = freq; n.Q.value = q;
  n.connect(dest);
  return n;
}

// ---- shared helpers for the new voices
const bufCache = new WeakMap();
function cached(ctx, key, make) {
  let m = bufCache.get(ctx);
  if (!m) bufCache.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}
/** 1 s of white noise (breath, consonant bursts). */
function noiseBuffer(ctx) {
  return cached(ctx, "white", () => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  });
}
/** 1 s of slow random wobble in -1..1 (the glottal jitter). */
function jitterBuffer(ctx) {
  return cached(ctx, "jitter", () => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    let y = 0, mx = 1e-9;
    for (let i = 0; i < d.length; i++) { y += (Math.random() * 2 - 1 - y) * 0.004; d[i] = y; mx = Math.max(mx, Math.abs(y)); }
    for (let i = 0; i < d.length; i++) d[i] /= mx;
    return b;
  });
}
function loopSrc(ctx, buf, dest, t) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  s.connect(dest); s.start(t, Math.random() * 0.9);
  return s;
}
let sat = null;
function satCurve() {
  if (!sat) { sat = new Float32Array(513); for (let i = 0; i < sat.length; i++) { const x = (i / 256 - 1); sat[i] = Math.tanh(2.6 * x) / Math.tanh(2.6); } }
  return sat;
}
/** Three parallel band-pass formant filters into dest. */
function formantBank(ctx, dest, spec) {
  const input = ctx.createGain(), bps = [], gs = [];
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = spec.f[i]; bp.Q.value = spec.q[i];
    const g = ctx.createGain(); g.gain.value = spec.g[i];
    input.connect(bp); bp.connect(g); g.connect(dest);
    bps.push(bp); gs.push(g);
  }
  return { input, bps, gs };
}
function bankTo(bank, spec, t, tc) {
  for (let i = 0; i < 3; i++) {
    bank.bps[i].frequency.setTargetAtTime(spec.f[i], t, tc);
    bank.bps[i].Q.setTargetAtTime(spec.q[i], t, tc);
    bank.gs[i].gain.setTargetAtTime(spec.g[i], t, tc);
  }
}
/**
 * One sung note: glottal saws (jittered) + breath noise through three formant filters.
 * cfg.plan (Robo Singer) adds the consonant onset and a gain dip; cfg.prevHz adds portamento.
 */
function voiceNote(ctx, f, t, out, v, o, cfg) {
  const eng = o.eng;
  const e = envNode(ctx, out, t, cfg.peak * v, o.arp ? Math.min(cfg.attack, 0.03) : cfg.attack);
  const plan = cfg.plan;
  const vowel = (pos) => scaleSpec(vowelAt(vowelPosFor(cfg.base, pos)), cfg.fMul, cfg.qMul);
  const target = vowel(eng.tiltPos);
  const bank = formantBank(ctx, e, plan && plan.spec ? scaleSpec(plan.spec, cfg.fMul, cfg.qMul) : target);
  const amp = ctx.createGain(); amp.connect(bank.input);
  const fm = { bank, base: cfg.base, fMul: cfg.fMul, qMul: cfg.qMul, settleAt: t };
  if (plan && plan.cons) {
    const c = plan.cons;
    bankTo(bank, target, t + plan.consDur, Math.max(0.004, plan.glide / 3));
    amp.gain.setValueAtTime(plan.startAmp, t);
    amp.gain.setTargetAtTime(plan.endAmp, t + plan.consDur, Math.max(0.004, plan.glide / 3));
    fm.settleAt = t + plan.onsetEnd + 0.05;
    if (plan.burst) { // tiny noise burst for "d"
      const b = plan.burst;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = b.hz; bp.Q.value = b.q;
      const bg = ctx.createGain(); bg.gain.setValueAtTime(0, t); bg.gain.setTargetAtTime(b.gain, t, 0.0012); bg.gain.setTargetAtTime(0, t + 0.004, b.dur / 3);
      bp.connect(bg); bg.connect(e);
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuffer(ctx); ns.connect(bp); ns.start(t, Math.random() * 0.9); ns.stop(t + 0.1);
    }
  } else amp.gain.value = 1;
  const nodes = [];
  // vibrato (delayed) + jitter, both on the pitch of every saw copy
  const lfo = ctx.createOscillator(); lfo.frequency.value = cfg.vibRate * (0.95 + Math.random() * 0.1); lfo.start(t);
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + VIBRATO.delay); lg.gain.linearRampToValueAtTime(cfg.vibDepth, t + VIBRATO.delay + VIBRATO.ramp);
  lfo.connect(lg);
  nodes.push(lfo);
  const jg = ctx.createGain(); jg.gain.value = cfg.jitter;
  nodes.push(loopSrc(ctx, jitterBuffer(ctx), jg, t));
  const per = 1 / cfg.copies.length;
  const mix = ctx.createGain(); mix.gain.value = per; mix.connect(amp);
  for (const c of cfg.copies) {
    const s = ctx.createOscillator(); s.type = "sawtooth"; s.detune.value = c;
    if (cfg.prevHz && cfg.prevHz !== f) { s.frequency.setValueAtTime(cfg.prevHz, t); s.frequency.setTargetAtTime(f, t, 0.035); } else s.frequency.value = f;
    s.connect(mix); s.start(t);
    lg.connect(s.detune); jg.connect(s.detune);
    nodes.push(s);
  }
  const bg = ctx.createGain(); bg.gain.value = cfg.breath; bg.connect(amp);
  nodes.push(loopSrc(ctx, noiseBuffer(ctx), bg, t));
  return { env: e, relTc: cfg.relTc, nodes, live: { fm } };
}

const BUILDERS = {
  pad(ctx, f, t, out, v) {
    const e = envNode(ctx, out, t, 0.15 * v, 0.35);
    const filt = lp(ctx, 1700, 0.4, e);
    return { env: e, relTc: 0.2, nodes: [osc(ctx, "triangle", f, -7, filt, t), osc(ctx, "triangle", f, 7, filt, t), osc(ctx, "sine", f, 0, filt, t)] };
  },
  bright(ctx, f, t, out, v) {
    const e = envNode(ctx, out, t, 0.1 * v, 0.02);
    const filt = lp(ctx, 5200, 1.2, e);
    filt.frequency.setValueAtTime(5200, t);
    filt.frequency.setTargetAtTime(1900, t, 0.25);
    return { env: e, relTc: 0.09, nodes: [osc(ctx, "sawtooth", f, -9, filt, t), osc(ctx, "sawtooth", f, 9, filt, t)] };
  },
  retro(ctx, f, t, out, v) {
    const e = envNode(ctx, out, t, 0.1 * v, 0.006);
    const g = ctx.createGain(); g.gain.value = 0.6; g.connect(e);
    const g2 = ctx.createGain(); g2.gain.value = 0.4; g2.connect(e);
    return { env: e, relTc: 0.03, nodes: [osc(ctx, "square", f, 0, g, t), osc(ctx, "triangle", f / 2, 0, g2, t)] };
  },
  strings(ctx, f, t, out, v) {
    const e = envNode(ctx, out, t, 0.085 * v, 0.5);
    const filt = lp(ctx, 2300, 0.5, e);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 0.8; lfo.start(t);
    const lg = ctx.createGain(); lg.gain.value = 5; lfo.connect(lg);
    const nodes = [lfo];
    for (const c of [-11, 0, 11]) { const o = osc(ctx, "sawtooth", f, c, filt, t); lg.connect(o.detune); nodes.push(o); }
    return { env: e, relTc: 0.28, nodes };
  },
  ep(ctx, f, t, out, v) {
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.setTargetAtTime(0.2 * v, t, 0.002);
    e.gain.setTargetAtTime(0.07 * v, t + 0.012, 0.9);
    e.connect(out);
    const car = ctx.createOscillator(); car.frequency.value = f; car.connect(e); car.start(t);
    const mod = ctx.createOscillator(); mod.frequency.value = f;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.3, t, 0.45);
    mod.connect(mg); mg.connect(car.frequency); mod.start(t);
    const bell = ctx.createOscillator(); bell.frequency.value = f * 14;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(f * 0.6, t); bg.gain.setTargetAtTime(0, t, 0.03);
    bell.connect(bg); bg.connect(car.frequency); bell.start(t);
    return { env: e, relTc: 0.12, nodes: [car, mod, bell] };
  },
  organ(ctx, f, t, out, v) {
    const e = envNode(ctx, out, t, 0.05 * v, 0.012);
    const nodes = [];
    [[0.5, 0.45], [1, 1], [1.5, 0.45], [2, 0.6], [3, 0.3], [4, 0.22]].forEach(([r, g]) => {
      const gn = ctx.createGain(); gn.gain.value = g; gn.connect(e);
      nodes.push(osc(ctx, "sine", f * r, 0, gn, t));
    });
    return { env: e, relTc: 0.03, nodes };
  },
  guitar(ctx, f, t, out, v, midi) {
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.4 * v, t);
    const filt = lp(ctx, 3600, 0.5, out);
    e.connect(filt);
    const src = ctx.createBufferSource();
    src.buffer = ksBuffer(ctx, midi);
    src.connect(e); src.start(t);
    return { env: e, relTc: 0.06, nodes: [src], noRamp: true };
  },
  // ---- new synths. All gains are ramped; every note ends in one gain node (env) that note-off ramps to 0.
  horns(ctx, f, t, out, v, midi, o) {
    const e = envNode(ctx, out, t, 0.075 * v, o.arp ? 0.02 : 0.07);
    const filt = lp(ctx, 400, 0.9, e);
    const top = Math.min(f * 6 + 1500, 5600); // the "blat": cutoff snaps open, then relaxes to the sustain
    filt.frequency.setValueAtTime(350, t);
    filt.frequency.setTargetAtTime(top, t, 0.03);
    filt.frequency.setTargetAtTime(Math.min(f * 3 + 700, 2400), t + 0.1, 0.22);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 0.4; lfo.start(t);
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.3); lg.gain.linearRampToValueAtTime(7, t + 0.8);
    lfo.connect(lg);
    const nodes = [lfo];
    for (const c of [-9, 0, 9]) {
      const s = osc(ctx, "sawtooth", f, c - 55, filt, t); // slight pitch scoop up into the note
      s.detune.setTargetAtTime(c, t, 0.045);
      lg.connect(s.detune); nodes.push(s);
    }
    return { env: e, relTc: 0.12, nodes };
  },
  supersaw(ctx, f, t, out, v, midi, o) {
    const e = envNode(ctx, out, t, 0.05 * v, o.arp ? 0.01 : 0.02);
    const filt = lp(ctx, 6500, 0.5, e);
    const nodes = [];
    for (const c of [-24, -12, 0, 12, 24]) nodes.push(osc(ctx, "sawtooth", f, c + (Math.random() - 0.5) * 4, filt, t));
    return { env: e, relTc: 0.16, nodes };
  },
  pluck(ctx, f, t, out, v, midi, o) {
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.setTargetAtTime(0.13 * v, t, 0.0025);
    e.gain.setTargetAtTime(0.01 * v, t + 0.02, 0.26);
    e.connect(out);
    const filt = lp(ctx, 1000, 3, e);
    filt.frequency.setValueAtTime(Math.min(f * 9 + 900, 8000), t);
    filt.frequency.setTargetAtTime(Math.max(f * 1.7, 450), t, 0.07);
    const sq = ctx.createGain(); sq.gain.value = 0.5; sq.connect(filt);
    return { env: e, relTc: 0.05, nodes: [osc(ctx, "sawtooth", f, 0, filt, t), osc(ctx, "square", f, 7, sq, t)] };
  },
  musicbox(ctx, f, t, out, v, midi, o) {
    const e = envNode(ctx, out, t, 0.09 * v, 0.004);
    const f0 = midi >= 72 ? f : f * 2;
    const nodes = [];
    // [ratio, level, decay time constant]: stiff-tine partials are inharmonic, so the top ones shimmer and die first
    for (const [r, g, d] of [[1, 1, 1.3], [1.003, 0.55, 1.6], [2.76, 0.32, 0.55], [5.4, 0.16, 0.22], [8.93, 0.08, 0.1]]) {
      if (f0 * r > 9500) continue;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0, t); pg.gain.setTargetAtTime(g, t, 0.002); pg.gain.setTargetAtTime(0.0001, t + 0.01, d);
      pg.connect(e);
      nodes.push(osc(ctx, "sine", f0 * r, 0, pg, t));
    }
    return { env: e, relTc: 0.18, nodes };
  },
  lofi(ctx, f, t, out, v, midi, o) {
    const filt = lp(ctx, 2300, 0.7, out);
    const ws = ctx.createWaveShaper(); ws.curve = satCurve(); ws.connect(filt); // gentle saturation
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.setTargetAtTime(0.17 * v, t, 0.003);
    e.gain.setTargetAtTime(0.085 * v, t + 0.02, 1.1);
    e.connect(ws);
    const car = ctx.createOscillator(); car.frequency.value = f; car.connect(e); car.start(t);
    const mod = ctx.createOscillator(); mod.frequency.value = f;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.5, t); mg.gain.setTargetAtTime(f * 0.22, t, 0.4);
    mod.connect(mg); mg.connect(car.frequency); mod.start(t);
    // tape wow / flutter: one slow pitch wobble for both operators
    const wow = ctx.createOscillator(); wow.frequency.value = 0.55 + Math.random() * 0.35; wow.start(t);
    const wg = ctx.createGain(); wg.gain.value = 9;
    wow.connect(wg); wg.connect(car.detune); wg.connect(mod.detune);
    return { env: e, relTc: 0.14, nodes: [car, mod, wow] };
  },
  bassPad(ctx, f, t, out, v, midi, o) { // the upper notes: a soft pad (the bass is in BASSES)
    const e = envNode(ctx, out, t, 0.12 * v, o.arp ? 0.03 : 0.3);
    const filt = lp(ctx, 1300, 0.4, e);
    return { env: e, relTc: 0.25, nodes: [osc(ctx, "triangle", f, -8, filt, t), osc(ctx, "triangle", f, 8, filt, t), osc(ctx, "sawtooth", f, 0, filt, t)] };
  },
  acid(ctx, f, t, out, v, midi, o) {
    const e = envNode(ctx, out, t, 0.075 * v, 0.004);
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = 11; filt.frequency.value = 0; filt.connect(e);
    // cutoff = tilt-driven base + a per-note decaying "squelch" envelope, summed on the frequency param
    const base = ctx.createConstantSource(); base.offset.value = o.eng.acidBase(); base.connect(filt.frequency); base.start(t);
    const sq = ctx.createConstantSource(); sq.offset.setValueAtTime(2400, t); sq.offset.setTargetAtTime(0, t, 0.16); sq.connect(filt.frequency); sq.start(t);
    const g2 = ctx.createGain(); g2.gain.value = 0.6; g2.connect(filt);
    return { env: e, relTc: 0.06, nodes: [osc(ctx, "sawtooth", f, 0, filt, t), osc(ctx, "square", f, 6, g2, t), base, sq], live: { cut: base.offset } };
  },
  choir(ctx, f, t, out, v, midi, o) {
    return voiceNote(ctx, f, t, out, v, o, {
      peak: 0.3, attack: 0.38, copies: [-13, 0, 12], vibRate: 4.8, vibDepth: 5, jitter: 5, breath: 0.35, relTc: 0.3, fMul: 1, qMul: 1, base: 0.5,
    });
  },
  robo(ctx, f, t, out, v, midi, o) {
    const eng = o.eng, plan = syllablePlan(eng.syllable);
    const prev = eng.glideFrom(o);
    return voiceNote(ctx, f, t, out, v, o, {
      peak: 0.34, attack: 0.012, copies: [-3, 4], vibRate: VIBRATO.rate, vibDepth: VIBRATO.depthCents, jitter: 0.5, breath: 0.12, relTc: 0.12,
      fMul: 1.08, qMul: 1.3, base: plan.vowelPos, plan, prevHz: prev,
    });
  },
};

/** Bass-note builders for presets that own their bass line (others use the generic triangle + sine in AudioEngine._bass). */
const BASSES = {
  bassPad(ctx, f, t, out) {
    const e = ctx.createGain();
    e.gain.setValueAtTime(0, t); e.gain.setTargetAtTime(0.16, t, 0.012); e.connect(out);
    const filt = lp(ctx, 1800, 2.5, e);
    filt.frequency.setValueAtTime(1800, t); filt.frequency.setTargetAtTime(480, t, 0.13);
    const sq = ctx.createGain(); sq.gain.value = 0.55; sq.connect(filt);
    const sub = ctx.createGain(); sub.gain.value = 0.9; sub.connect(e);
    return { env: e, relTc: 0.12, nodes: [osc(ctx, "sawtooth", f, -5, filt, t), osc(ctx, "square", f, 6, sq, t), osc(ctx, "sine", f / 2, 0, sub, t)] };
  },
};

/** Per-preset release time, loudness trim (matched by tests/audio-check.html) and what the right-hand tilt does. */
const META = {
  pad: { rel: 0.2, trim: 0.75, tone: "filter" },
  bright: { rel: 0.1, trim: 1.0, tone: "filter" },
  retro: { rel: 0.04, trim: 1, tone: "filter" },
  strings: { rel: 0.28, trim: 1, tone: "filter" },
  ep: { rel: 0.15, trim: 0.86, tone: "filter" },
  organ: { rel: 0.06, trim: 1, tone: "filter" },
  guitar: { rel: 0.12, trim: 1.12, tone: "filter" },
  horns: { rel: 0.12, trim: 1, tone: "filter" },
  supersaw: { rel: 0.16, trim: 1, tone: "filter" },
  pluck: { rel: 0.08, trim: 1.07, tone: "filter" },
  musicbox: { rel: 0.18, trim: 1, tone: "filter" },
  lofi: { rel: 0.14, trim: 0.38, tone: "filter" },
  bassPad: { rel: 0.25, trim: 1.15, tone: "filter" },
  acid: { rel: 0.06, trim: 1, tone: "cutoff" },
  choir: { rel: 0.3, trim: 1.1, tone: "vowel" },
  robo: { rel: 0.12, trim: 1, tone: "vowel" },
};

const TH_VOICE_TRIM = 13; // the sung theremin voice is quieter than a plain oscillator at the same level

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.preset = "pad";
    this.style = "hold";
    this.arpPattern = "up";
    this.arpDiv = 2; // 2 = 8ths, 4 = 16ths
    this.bpm = 100;
    this.bassOn = true;
    this.volume = 0.8;
    this.reverbAmt = 0.25;
    this.group = null;
    this.current = null;
    this.curSig = "";
    this.gridAnchor = null;
    this.arpIdx = 0;
    this.arpNext = 0;
    this.strumDir = 1;
    this.syllable = "la"; // Robo Singer: la / doo / na / mm / aah
    this.roboTune = "glide"; // Robo Singer pitch: "glide" (slight portamento) or "snap" (instant, auto-tune style)
    this.tiltPos = 0.5; // right-hand tilt as a 0..1 position (0.5 = neutral); drives the vowel (voices) or the cutoff (Acid)
    this.lastFilter = null;
    this.liveNotes = new Set(); // notes whose formants / cutoff follow the tilt while they sound
    this.prevVoice = []; // MIDI notes of the previous chord (Robo Singer portamento)
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get running() { return !!this.ctx && this.ctx.state === "running"; }

  /** Builds the audio graph. Pass an OfflineAudioContext as `ctxOverride` to render without a speaker (tests/audio-check.html). */
  ensure(ctxOverride = null) {
    if (this.ctx) return this.ctx;
    let ctx = ctxOverride;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("Web Audio is not supported in this browser");
      ctx = new AC({ latencyHint: "interactive" });
    }
    this.ctx = ctx;
    // master chain: bus -> compressor -> limiter -> out
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    Object.entries({ threshold: -20, knee: 24, ratio: 3, attack: 0.012, release: 0.25 }).forEach(([k, v]) => (this.comp[k].value = v));
    this.limiter = ctx.createDynamicsCompressor();
    Object.entries({ threshold: -3, knee: 0, ratio: 20, attack: 0.002, release: 0.08 }).forEach(([k, v]) => (this.limiter[k].value = v));
    this.master.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(ctx.destination);
    // music path: musicBus -> expression -> volume -> tone -> master (+ reverb send)
    this.musicBus = ctx.createGain();
    this.expr = ctx.createGain(); this.expr.gain.value = 1;
    this.vol = ctx.createGain(); this.vol.gain.value = this.volume;
    this.tone = ctx.createBiquadFilter(); this.tone.type = "lowpass"; this.tone.frequency.value = 12000; this.tone.Q.value = 0.5;
    this.musicBus.connect(this.expr); this.expr.connect(this.vol); this.vol.connect(this.tone); this.tone.connect(this.master);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this._impulse(2.4);
    this.send = ctx.createGain(); this.send.gain.value = this.reverbAmt;
    this.tone.connect(this.send); this.send.connect(this.reverb);
    const rg = ctx.createGain(); rg.gain.value = 0.7; this.reverb.connect(rg); rg.connect(this.master);
    this.drumBus = ctx.createGain(); this.drumBus.gain.value = 0.8; this.drumBus.connect(this.master);
    if (!ctxOverride) this._arpTimer = setInterval(() => this._arpTick(), 25);
    return ctx;
  }

  /** Call from a user gesture (pointerdown/keydown/click). Safe to call repeatedly. */
  async unlock() {
    try {
      this.ensure();
      if (this.ctx.state !== "running") await this.ctx.resume();
    } catch (e) { return false; }
    return this.running;
  }

  _impulse(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lpState = 0;
      for (let i = 0; i < len; i++) {
        const x = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
        lpState += (x - lpState) * (0.25 + 0.6 * (1 - i / len)); // darker tail
        d[i] = lpState;
      }
    }
    return b;
  }

  // ---- settings
  setPreset(id) {
    if (!BUILDERS[id]) return;
    this.preset = id;
    this.setFilter(this.lastFilter); // the tilt means filter, vowel or cutoff depending on the instrument
    if (this.ctx && this.current) { const c = this.current; this.curSig = ""; this.setChord(c); }
  }
  setStyle(id) {
    this.style = id;
    if (!this.ctx) return;
    const cur = this.current;
    this.curSig = "";
    if (cur) this.setChord(cur);
  }
  setBpm(b) { this.bpm = b; }
  setVolume(v) {
    this.volume = v;
    if (this.ctx) this.vol.gain.setTargetAtTime(v * v * 1.1, this.now, 0.04);
  }
  setReverb(a) {
    this.reverbAmt = a;
    if (this.ctx) this.send.gain.setTargetAtTime(a, this.now, 0.05);
  }
  /** Live expression 0..1 from the right-hand volume height (wrist or index fingertip) (a short ramp, about 50 ms). */
  setExpression(x) { if (this.ctx) this.expr.gain.setTargetAtTime(Math.max(0, x), this.now, 0.02); }
  /** Tone filter from the colour-hand tilt: {freq, q}, or null for fully open. Smoothed with a 40 ms time constant. */
  setFilter(f) {
    this.lastFilter = f || null;
    this.tiltPos = f ? vowelPosFromFilter(f) : 0.5;
    if (!this.ctx) return;
    const mode = META[this.preset].tone;
    // voices and Acid use the tilt for the vowel / their own cutoff, so the shared Tone filter stays open
    const freq = f && mode === "filter" ? f.freq : 12000, q = f && mode === "filter" ? f.q : 0.5;
    this.tone.frequency.setTargetAtTime(freq, this.now, 0.04);
    this.tone.Q.setTargetAtTime(q, this.now, 0.04);
    if (mode !== "filter") this._followTilt();
  }
  /** What the tilt controls for the current instrument: "filter" (Tone), "vowel" (Choir / Robo Singer) or "cutoff" (Acid). */
  get toneMode() { return META[this.preset].tone; }
  setSyllable(id) { this.syllable = id; }
  setRoboTune(m) { this.roboTune = m === "snap" ? "snap" : "glide"; }
  acidBase() { return 110 * Math.pow(7000 / 110, this.tiltPos); }
  glideFrom(o) {
    if (this.roboTune === "snap" || o.arp || o.idx == null) return null;
    const m = this.prevVoice[o.idx];
    return m == null ? null : mtof(m);
  }
  _followTilt() {
    const now = this.now;
    for (const n of this.liveNotes) {
      const L = n.live;
      if (L.dieAt < now) { this.liveNotes.delete(n); continue; }
      if (L.cut) L.cut.setTargetAtTime(this.acidBase(), now, 0.04);
      if (L.fm && now >= L.fm.settleAt) bankTo(L.fm.bank, scaleSpec(vowelAt(vowelPosFor(L.fm.base, this.tiltPos)), L.fm.fMul, L.fm.qMul), now, 0.04);
    }
  }

  // ---- theremin voice: one continuous oscillator, glided by setTargetAtTime (no re-triggering)
  /**
   * hz target, level 0..1, on = gate. tc = {pitch, volume} time constants in seconds.
   * The pitch jumps straight to the target when the voice starts (no glide up from an old note).
   */
  thereminSet({ hz, level, on, tc, type = "sine", vowelPos = 0.5 }) {
    if (!this.ctx) return;
    if (!on && !this.th) return;
    const t = this.now;
    const voice = type === "voice"; // a sustained Robo Singer vowel instead of a plain oscillator
    if (this.th && this.th.voice !== voice) this.thereminStop();
    if (!this.th) this.th = this._makeThereminVoice(hz || 220, type, voice);
    const th = this.th;
    if (!voice && th.type !== type) { th.o.type = type; th.type = type; }
    if (hz != null) {
      if (on && !th.on) { th.o.frequency.cancelScheduledValues(t); th.o.frequency.setValueAtTime(hz, t); if (th.o2) { th.o2.frequency.cancelScheduledValues(t); th.o2.frequency.setValueAtTime(hz, t); } }
      else { th.o.frequency.setTargetAtTime(hz, t, tc.pitch); if (th.o2) th.o2.frequency.setTargetAtTime(hz, t, tc.pitch); }
    }
    if (voice) {
      bankTo(th.bank, scaleSpec(vowelAt(vowelPos), 1.08, 1.3), t, 0.05);
      if (on && !th.on) { // delayed vibrato restarts with each new gate
        th.lg.gain.cancelScheduledValues(t);
        th.lg.gain.setValueAtTime(0, t); th.lg.gain.setValueAtTime(0, t + VIBRATO.delay);
        th.lg.gain.linearRampToValueAtTime(VIBRATO.depthCents, t + VIBRATO.delay + VIBRATO.ramp);
      }
    }
    th.env.gain.setTargetAtTime(on ? level * (voice ? TH_VOICE_TRIM : 1) : 0, t, tc.volume);
    th.on = on;
  }
  _makeThereminVoice(hz, type, voice) {
    const ctx = this.ctx;
    const env = ctx.createGain(); env.gain.value = 0; env.connect(this.musicBus);
    if (!voice) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = hz;
      o.connect(env); o.start();
      return { o, env, on: false, type, voice: false, extra: [] };
    }
    const t = this.now;
    const bank = formantBank(ctx, env, scaleSpec(vowelAt(0.5), 1.08, 1.3));
    const mix = ctx.createGain(); mix.gain.value = 0.5; mix.connect(bank.input);
    const lg = ctx.createGain(); lg.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = VIBRATO.rate; lfo.connect(lg); lfo.start(t);
    const jg = ctx.createGain(); jg.gain.value = 0.5;
    const jit = loopSrc(ctx, jitterBuffer(ctx), jg, t);
    const saws = [-3, 4].map((c) => {
      const s = ctx.createOscillator(); s.type = "sawtooth"; s.frequency.value = hz; s.detune.value = c;
      s.connect(mix); lg.connect(s.detune); jg.connect(s.detune); s.start(t);
      return s;
    });
    const bg = ctx.createGain(); bg.gain.value = 0.1; bg.connect(bank.input);
    const br = loopSrc(ctx, noiseBuffer(ctx), bg, t);
    return { o: saws[0], o2: saws[1], env, on: false, type, voice: true, bank, lg, extra: [saws[1], lfo, jit, br] };
  }
  /** Fade the theremin out and free its nodes. */
  thereminStop() {
    const th = this.th;
    if (!th) return;
    this.th = null;
    const t = this.now;
    th.env.gain.cancelScheduledValues(t);
    th.env.gain.setTargetAtTime(0, t, 0.03);
    for (const n of [th.o, ...th.extra]) { try { n.stop(t + 0.4); } catch {} }
    setTimeout(() => { try { th.env.disconnect(); } catch {} }, 600);
  }

  // ---- chords
  _newGroup(t) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.setTargetAtTime(1, t, 0.012);
    g.connect(this.musicBus);
    return { g, notes: [] };
  }
  _releaseGroup(group, tc) {
    if (!group) return;
    const now = this.now;
    group.g.gain.cancelScheduledValues(now);
    group.g.gain.setTargetAtTime(0, now, tc);
    const stopAt = now + tc * 8 + 0.05;
    for (const n of group.notes) { if (n.live) n.live.dieAt = stopAt; for (const node of n.nodes) { try { node.stop(stopAt); } catch {} } }
    setTimeout(() => { try { group.g.disconnect(); } catch {} }, (tc * 8 + 0.3) * 1000);
  }
  _noteOn(midi, t, vel, dest, group, opts = {}) {
    const b = BUILDERS[this.preset];
    const n = b(this.ctx, mtof(midi), t, dest, vel * META[this.preset].trim, midi, { eng: this, ...opts });
    if (n.live) { n.live.dieAt = Infinity; this.liveNotes.add(n); }
    if (this.liveNotes.size > 24) { const now = this.now; for (const x of this.liveNotes) if (x.live.dieAt < now) this.liveNotes.delete(x); }
    if (group) group.notes.push(n);
    return n;
  }
  _noteOff(n, t, tc) {
    const tcc = tc ?? n.relTc;
    if (n.live) n.live.dieAt = t + tcc * 8 + 0.05;
    n.env.gain.cancelScheduledValues(t);
    n.env.gain.setTargetAtTime(0, t, tcc);
    for (const node of n.nodes) { try { node.stop(t + tcc * 8 + 0.05); } catch {} }
  }
  _relTc() { return Math.max(0.05, META[this.preset].rel); }

  _bass(group, t, midi) {
    if (!this.bassOn) return;
    const own = BASSES[this.preset];
    if (own) { group.notes.push(own(this.ctx, mtof(midi), t, group.g)); return; }
    const e = this.ctx.createGain();
    e.gain.setValueAtTime(0, t); e.gain.setTargetAtTime(0.2, t, 0.03); e.connect(group.g);
    const f = lp(this.ctx, 500, 0.5, e);
    const n = { env: e, nodes: [osc(this.ctx, "triangle", mtof(midi), 0, f, t), osc(this.ctx, "sine", mtof(midi), 0, f, t)], relTc: 0.1 };
    group.notes.push(n);
  }

  /** voiced = {midi:[...], bass}. Crossfades from the previous chord. */
  setChord(voiced) {
    if (!this.ctx) { this.current = voiced; return; }
    const sig = voiced.midi.join(",") + ":" + voiced.bass + ":" + this.style + ":" + this.preset;
    if (sig === this.curSig && this.group) return;
    this.curSig = sig;
    this.current = voiced;
    const t = this.now + 0.005;
    const old = this.group;
    this._releaseGroup(old, this._relTc());
    const g = (this.group = this._newGroup(t));
    this._bass(g, t, voiced.bass);
    if (this.style === "arp") { this.arpIdx = 0; this.prevVoice = []; return; }
    this._playChordNotes(g, voiced.midi, t, this.style === "strum" || this.preset === "guitar" ? 0.025 : 0, 1, true);
    this.prevVoice = voiced.midi.slice();
  }
  _playChordNotes(group, midis, t, stagger, dir, glide = false) {
    const list = dir > 0 ? midis : [...midis].reverse();
    list.forEach((m, i) => this._noteOn(m, t + i * stagger, 0.9, group.g, group, glide ? { idx: i } : {}));
  }
  /** Re-trigger the current chord (pinch / space). */
  strum() {
    if (!this.ctx || !this.current || this.style === "arp") return;
    const t = this.now + 0.005;
    this._releaseGroup(this.group, 0.04);
    const g = (this.group = this._newGroup(t));
    this._bass(g, t, this.current.bass);
    this._playChordNotes(g, this.current.midi, t, 0.025, this.strumDir);
    this.strumDir *= -1;
  }
  /** Fade out (fist / key up). */
  release() {
    this.current = null;
    this.curSig = "";
    this.prevVoice = [];
    if (!this.ctx || !this.group) return;
    this._releaseGroup(this.group, Math.max(0.08, this._relTc()));
    this.group = null;
  }

  // ---- arpeggio
  _arpTick() {
    if (!this.ctx || this.style !== "arp" || !this.current || !this.running) return;
    const spb = 60 / this.bpm, step = spb / this.arpDiv;
    const now = this.now;
    if (this.arpNext < now) {
      if (this.gridAnchor != null) this.arpNext = this.gridAnchor + Math.ceil((now - this.gridAnchor) / step - 1e-6) * step;
      else this.arpNext = now + 0.03;
    }
    while (this.arpNext < now + 0.12) {
      const m = this.current.midi;
      const seq = [...m, m[0] + 12];
      const len = seq.length;
      let idx;
      if (this.arpPattern === "random") idx = Math.floor(Math.random() * len);
      else if (this.arpPattern === "updown") { const per = 2 * (len - 1); const p = this.arpIdx % per; idx = p < len ? p : per - p; }
      else idx = this.arpIdx % len;
      this.arpIdx++;
      const n = this._noteOn(seq[idx], this.arpNext, 0.9, this.musicBus, null, { arp: true });
      this._noteOff(n, this.arpNext + step * 0.85, Math.min(n.relTc, 0.08));
      this.arpNext += step;
    }
  }
}
