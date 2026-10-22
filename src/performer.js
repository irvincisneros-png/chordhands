// Performer: merges keyboard / pad / hand-gesture inputs into one chord and drives the audio engine.
// No DOM here. UI subscribes with onChange(info).
import { buildChord, voiceChord, qualityFor, classicVoice, isClassic } from "./theory.js";

const INVERSIONS = ["auto", 0, 1, 2];

export class Performer {
  constructor(audio, { key, harmony = "classic" }) {
    this.audio = audio;
    this.key = key;
    this.harmony = harmony;
    this.manual = { ext: "triad", inversion: "auto", octave: 0 };
    this.layers = { keys: { degree: 0, flip: false }, pad: { degree: 0, flip: false }, gesture: null };
    this.flipToggle = false;
    this.alterToggle = 0;
    this.hold = false;
    this.external = null; // a chord object played by song Listen mode / recorder playback
    this.prevBase = null;
    this.gate = null; // optional (chord) => bool: chords it rejects are made but not sounded (Practice "only the right chord")
    this.info = { chord: null, played: null, octave: 0, voiced: null, silent: true, source: null };
    this.listeners = new Set();
    this.sig = "";
    this.gestureEnabled = false;
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setKey(key) { this.key = key; this.sig = ""; this.prevBase = null; this.recompute(); }
  setHarmony(h) { this.harmony = h; this.sig = ""; this.recompute(); }
  setHold(h) {
    this.hold = h;
    if (!h) { this.layers.keys.degree = 0; this.layers.pad.degree = 0; }
    this.recompute();
  }

  press(layer, degree, flip = false) {
    const l = this.layers[layer];
    l.degree = degree; l.flip = flip;
    this.recompute();
  }
  release(layer) {
    if (!this.hold) this.layers[layer].degree = 0;
    this.recompute();
  }
  setLayerFlip(layer, flip) { this.layers[layer].flip = flip; this.recompute(); }
  stopAll() {
    this.layers.keys.degree = 0; this.layers.pad.degree = 0; this.external = null;
    this.recompute();
  }
  setGesture(g) { this.layers.gesture = g; this.recompute(); }
  setGestureEnabled(on) { this.gestureEnabled = on; if (!on) this.layers.gesture = null; this.recompute(); }
  /** fn(chord) -> true if it may sound; null removes the gate. The chord is still reported as info.played. */
  setGate(fn) { this.gate = fn || null; this.recompute(); }
  setExternal(chord) { this.external = chord; this.recompute(); }
  setFlipToggle(v) { this.flipToggle = v; this.recompute(); }
  setAlterToggle(v) { this.alterToggle = v; this.recompute(); }

  setExt(ext) { this.manual.ext = ext; this.sig = ""; this.recompute(); }
  setInversion(inv) { this.manual.inversion = inv; this.sig = ""; this.recompute(); }
  stepInversion(d) {
    const i = Math.min(INVERSIONS.length - 1, Math.max(0, INVERSIONS.indexOf(this.manual.inversion) + d));
    this.setInversion(INVERSIONS[i]);
  }
  setOctave(o) { this.manual.octave = Math.max(-2, Math.min(2, o)); this.sig = ""; this.recompute(); }
  colourButton(c) {
    if (c === "triad") { this.manual.ext = "triad"; this.manual.inversion = "auto"; }
    else if (c === "inv1") { this.manual.ext = "triad"; this.manual.inversion = 1; }
    else { this.manual.ext = c; if (this.manual.inversion === 1) this.manual.inversion = "auto"; }
    this.sig = ""; this.recompute();
  }
  strum() { this.audio.strum(); }

  /** Which colour button is active (for UI). */
  get colourName() {
    const m = this.manual;
    if (m.ext === "triad") return m.inversion === 1 ? "inv1" : "triad";
    return m.ext;
  }

  /** Colour for the manual (keys / pad) path. In Classic harmony "dom7" on a minor chord is dim7, like the right hand. */
  _manualColour(base) {
    let { ext, inversion } = this.manual;
    if (isClassic(this.harmony) && ext === "dom7") {
      const q = qualityFor(this.key, base.degree, { flip: base.flip, harmony: this.harmony, alter: base.alter });
      ext = q === "maj" || q === "aug" ? "dom7" : "dim7";
    }
    return { ...base, ext, inversion };
  }

  _resolve() {
    if (this.external) return { src: "external", chord: this.external, octave: this.manual.octave };
    const k = this.layers.keys, p = this.layers.pad, g = this.gestureEnabled ? this.layers.gesture : null;
    let spec = null, source = null;
    if (k.degree) { spec = this._manualColour({ degree: k.degree, flip: k.flip || this.flipToggle, alter: this.alterToggle }); source = "keys"; }
    else if (p.degree) { spec = this._manualColour({ degree: p.degree, flip: p.flip || this.flipToggle, alter: this.alterToggle }); source = "pad"; }
    else if (g && g.degree) {
      source = "gesture";
      const base = { degree: g.degree, flip: g.flip, alter: g.alter || 0 };
      let octave = this.manual.octave;
      if (g.colour) {
        if (g.colour === "mute") return { src: source, chord: null, volume: g.volume, filter: g.filter };
        const q = qualityFor(this.key, g.degree, { flip: g.flip, harmony: this.harmony, alter: g.alter || 0 });
        spec = { ...base, ext: "triad", inversion: 0 };
        if (g.colour === "inv1") spec.inversion = 1;
        else if (g.colour === "seventh") spec.ext = "seventh";
        else if (g.colour === "dom7") spec.ext = q === "maj" || q === "aug" ? "dom7" : "dim7";
        if (g.octaveDown) octave -= 1;
      } else {
        spec = this._manualColour(base); // one-handed: colour comes from the pad chips / keys
      }
      return { src: source, chord: buildChord(this.key, { ...spec, harmony: this.harmony }), octave, volume: g.volume, filter: g.filter };
    }
    if (!spec) return { src: null, chord: null };
    return { src: source, chord: buildChord(this.key, { ...spec, harmony: this.harmony }), octave: this.manual.octave };
  }

  recompute() {
    const r = this._resolve();
    const a = this.audio;
    const played = r.chord || null;
    const octave = r.octave || 0;
    const blocked = !!(played && this.gate && !this.gate(played));
    const chord = blocked ? null : played;
    if (r.volume != null && !blocked) a.setExpression(r.volume); else a.setExpression(blocked ? 0 : 1);
    a.setFilter(r.filter ?? null);
    const sig = chord ? `${chord.symbol}|${chord.inversion}|${r.octave}|${r.src}` : "silent";
    const playedSig = played ? `${played.symbol}|${played.inversion}|${octave}` : "none";
    const full = sig + "#" + playedSig;
    if (full === this.fullSig && sig === this.sig) return;
    this.fullSig = full;
    const changed = sig !== this.sig;
    this.sig = sig;
    if (changed) {
      if (!chord) {
        a.release();
        this.info = { chord: null, played, octave, voiced: null, silent: true, source: r.src };
      } else {
        const classic = r.src !== "external" && isClassic(this.harmony) ? classicVoice(chord, this.key, { octaveShift: r.octave }) : null;
        const voiced = classic || voiceChord(chord, this.prevBase, { inversion: chord.inversion, octaveShift: r.octave });
        this.prevBase = voiced.base;
        a.setChord(voiced);
        this.info = { chord, played, octave, voiced, silent: false, source: r.src };
      }
    } else this.info = { ...this.info, played, octave };
    for (const fn of this.listeners) fn(this.info);
  }
}
