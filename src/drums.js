// Synth drum loop + metronome, scheduled on the audio clock with a lookahead timer.
export const PATTERNS = {
  pop: { name: "Pop", kick: "x.......x.x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
  rock: { name: "Rock", kick: "x.x.....x.x.....", snare: "....x.......x...", hat: "xoxoxoxoxoxoxoxo" },
  ballad: { name: "Ballad", kick: "x.......x.......", snare: "........x.......", hat: "o...x...o...x..." },
  reggaeton: { name: "Reggaeton", kick: "x...x...x...x...", snare: "...x..x....x..x.", hat: "x.x.x.x.x.x.x.x." },
};
export const PATTERN_LIST = Object.entries(PATTERNS).map(([id, p]) => ({ id, name: p.name }));

export class Drums {
  constructor(audio) {
    this.audio = audio;
    this.pattern = "pop";
    this.metronome = false;
    this.drumsOn = true;
    this.bpm = 100;
    this.beatsPerBar = 4;
    this.timer = null;
    this.anchor = 0;
    this.nextTime = 0;
    this.step = 0;
    this.noise = null;
  }
  get running() { return this.timer != null; }

  /** Start at audio time `when` (default now). Step 0 = downbeat. */
  start(when, { drums = this.drumsOn, metronome = this.metronome } = {}) {
    const a = this.audio;
    a.ensure();
    this.stop();
    this.drumsOn = drums;
    this.metronome = metronome;
    this.anchor = this.nextTime = when ?? a.now + 0.08;
    a.gridAnchor = this.anchor;
    this.step = 0;
    this._tick();
    this.timer = setInterval(() => this._tick(), 25);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.audio) this.audio.gridAnchor = null;
  }
  setBpm(b) { this.bpm = b; }

  _tick() {
    const a = this.audio;
    while (this.nextTime < a.now + 0.12) {
      this._playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step++;
    }
  }
  _playStep(i, t) {
    const per = this.beatsPerBar === 4 ? 16 : this.beatsPerBar * 4;
    const s = i % per;
    if (this.drumsOn && this.beatsPerBar === 4) {
      const p = PATTERNS[this.pattern] || PATTERNS.pop;
      const c = (row) => row[s];
      if (c(p.kick) === "x") this._kick(t);
      if (c(p.snare) === "x") this._snare(t);
      if (c(p.hat) !== ".") this._hat(t, c(p.hat) === "o" ? 0.35 : 1);
    } else if (this.drumsOn) {
      if (s % 4 === 0) { if (s === 0) this._kick(t); else this._hat(t, 1); }
      if (s === (per / 2 | 0) && this.beatsPerBar % 2 === 0) this._snare(t);
    }
    if (this.metronome && s % 4 === 0) this._click(t, s === 0);
  }

  _out() { return this.audio.drumBus; }
  _kick(t) {
    const c = this.audio.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(this._out()); o.start(t); o.stop(t + 0.4);
  }
  _noiseBuf() {
    const c = this.audio.ctx;
    if (!this.noise) {
      this.noise = c.createBuffer(1, c.sampleRate * 0.4, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
  _snare(t) {
    const c = this.audio.ctx;
    const n = c.createBufferSource(); n.buffer = this._noiseBuf();
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(bp); bp.connect(g); g.connect(this._out()); n.start(t); n.stop(t + 0.22);
    const o = c.createOscillator(), og = c.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(130, t + 0.08);
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.35, t + 0.002); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(this._out()); o.start(t); o.stop(t + 0.12);
  }
  _hat(t, v) {
    const c = this.audio.ctx;
    const n = c.createBufferSource(); n.buffer = this._noiseBuf();
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.001); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(hp); hp.connect(g); g.connect(this._out()); n.start(t); n.stop(t + 0.07);
  }
  _click(t, accent) {
    const c = this.audio.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = "square"; o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.001); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    o.connect(g); g.connect(this._out()); o.start(t); o.stop(t + 0.06);
  }
}
