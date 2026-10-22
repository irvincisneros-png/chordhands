// Free-play recorder: chord changes with timing. Pure (injected clock).
export class Recorder {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.events = [];
    this.recording = false;
    this.t0 = 0;
    this.last = undefined;
  }
  start() { this.events = []; this.recording = true; this.t0 = this.now(); this.last = undefined; }
  stop() {
    if (this.recording) this.events.push({ t: this.now() - this.t0, chord: null, end: true });
    this.recording = false;
  }
  /** chord object or null (silence). Only records changes. */
  push(chord) {
    if (!this.recording) return;
    const sig = chord ? chord.symbol : null;
    if (sig === this.last) return;
    this.last = sig;
    this.events.push({ t: this.now() - this.t0, chord });
  }
  get duration() { return this.events.length ? this.events[this.events.length - 1].t : 0; }
  symbols() {
    const out = [];
    for (const e of this.events) if (e.chord && out[out.length - 1] !== e.chord.symbol) out.push(e.chord.symbol);
    return out;
  }
  toText() { return this.symbols().join(" | "); }
}
