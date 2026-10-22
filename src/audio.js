// ChordHands WebAudio engine: presets, hold/strum/arp styles, crossfades, reverb, limiter.
// No samples, no libraries. Every gain change is ramped (setTargetAtTime) to avoid clicks.
import { mtof } from "./theory.js";

export const PRESET_LIST = [
  { id: "pad", name: "Warm Pad" },
  { id: "bright", name: "Bright Synth" },
  { id: "retro", name: "Retro Chip" },
  { id: "strings", name: "Strings" },
  { id: "ep", name: "Electric Piano" },
  { id: "organ", name: "Organ" },
  { id: "guitar", name: "Nylon Guitar" },
];
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
};

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
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get running() { return !!this.ctx && this.ctx.state === "running"; }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("Web Audio is not supported in this browser");
    const ctx = (this.ctx = new AC({ latencyHint: "interactive" }));
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
    this._arpTimer = setInterval(() => this._arpTick(), 25);
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
    if (!this.ctx) return;
    const freq = f ? f.freq : 12000, q = f ? f.q : 0.5;
    this.tone.frequency.setTargetAtTime(freq, this.now, 0.04);
    this.tone.Q.setTargetAtTime(q, this.now, 0.04);
  }

  // ---- theremin voice: one continuous oscillator, glided by setTargetAtTime (no re-triggering)
  /**
   * hz target, level 0..1, on = gate. tc = {pitch, volume} time constants in seconds.
   * The pitch jumps straight to the target when the voice starts (no glide up from an old note).
   */
  thereminSet({ hz, level, on, tc, type = "sine" }) {
    if (!this.ctx) return;
    if (!on && !this.th) return;
    const t = this.now;
    if (!this.th) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = hz || 220;
      const env = this.ctx.createGain(); env.gain.value = 0;
      o.connect(env); env.connect(this.musicBus); o.start();
      this.th = { o, env, on: false, type };
    }
    const th = this.th;
    if (th.type !== type) { th.o.type = type; th.type = type; }
    if (hz != null) {
      if (on && !th.on) { th.o.frequency.cancelScheduledValues(t); th.o.frequency.setValueAtTime(hz, t); }
      else th.o.frequency.setTargetAtTime(hz, t, tc.pitch);
    }
    th.env.gain.setTargetAtTime(on ? level : 0, t, tc.volume);
    th.on = on;
  }
  /** Fade the theremin out and free its nodes. */
  thereminStop() {
    const th = this.th;
    if (!th) return;
    this.th = null;
    const t = this.now;
    th.env.gain.cancelScheduledValues(t);
    th.env.gain.setTargetAtTime(0, t, 0.03);
    try { th.o.stop(t + 0.4); } catch {}
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
    for (const n of group.notes) for (const node of n.nodes) { try { node.stop(stopAt); } catch {} }
    setTimeout(() => { try { group.g.disconnect(); } catch {} }, (tc * 8 + 0.3) * 1000);
  }
  _noteOn(midi, t, vel, dest, group) {
    const b = BUILDERS[this.preset];
    const n = b(this.ctx, mtof(midi), t, dest, vel, midi);
    if (group) group.notes.push(n);
    return n;
  }
  _noteOff(n, t, tc) {
    const tcc = tc ?? n.relTc;
    n.env.gain.cancelScheduledValues(t);
    n.env.gain.setTargetAtTime(0, t, tcc);
    for (const node of n.nodes) { try { node.stop(t + tcc * 8 + 0.05); } catch {} }
  }
  _relTc() { return Math.max(0.05, ({ pad: 0.2, strings: 0.28, ep: 0.15, organ: 0.06, bright: 0.1, retro: 0.04, guitar: 0.12 })[this.preset] || 0.1); }

  _bass(group, t, midi) {
    if (!this.bassOn) return;
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
    if (this.style === "arp") { this.arpIdx = 0; return; }
    this._playChordNotes(g, voiced.midi, t, this.style === "strum" || this.preset === "guitar" ? 0.025 : 0, 1);
  }
  _playChordNotes(group, midis, t, stagger, dir) {
    const list = dir > 0 ? midis : [...midis].reverse();
    list.forEach((m, i) => this._noteOn(m, t + i * stagger, 0.9, group.g, group));
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
      const n = this._noteOn(seq[idx], this.arpNext, 0.9, this.musicBus, null);
      this._noteOff(n, this.arpNext + step * 0.85, Math.min(n.relTc, 0.08));
      this.arpNext += step;
    }
  }
}
