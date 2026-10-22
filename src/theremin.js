// Theremin mode: pure mapping functions (no DOM, no audio). Own code.
// Right-hand wrist height -> pitch (exponential, so equal heights are equal musical intervals).
// Left-hand wrist height -> volume (the same linear curve the chord volume uses).
// Landmarks are the raw camera frame, y grows DOWNWARD, so a HIGHER hand has a SMALLER y.
import { LM, volumeFromY, RULES } from "./gestures.js";
import { SCALES, mod, midiToName } from "./theory.js";

export const THEREMIN = {
  minHz: 65, // bottom of the pitch range (about C2)
  maxHz: 1200, // top of the pitch range (about D6)
  gateVolume: 0.02, // sound only while the volume is above this
  pitchTc: 0.03, // pitch glide, seconds (time constant)
  volumeTc: 0.04, // volume smoothing, seconds
  snapTc: 0.045, // short glide used when "Snap to key" is on
  gain: 0.4, // output scaling of the single voice
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** 0..1 position in the pitch range from a wrist height: top of the frame = 1, bottom = 0 (same band as volume). */
export function unitFromY(y) { return volumeFromY(y); }
/** 0..1 (bottom..top) -> Hz, exponential from minHz to maxHz. */
export function pitchFromUnit(t, { minHz = THEREMIN.minHz, maxHz = THEREMIN.maxHz } = {}) {
  return minHz * Math.pow(maxHz / minHz, clamp(t, 0, 1));
}
/** Right-hand wrist y -> Hz. */
export function pitchFromY(y, range) { return pitchFromUnit(unitFromY(y), range); }
/** Left-hand wrist y -> volume 0..1 (same linear curve as the chord volume: y <= 0.05 full, y >= 0.95 silent). */
export function volumeFromHandY(y) { return volumeFromY(y); }
/** Inverse of pitchFromUnit: Hz -> 0..1 position in the range. */
export function unitFromHz(hz, { minHz = THEREMIN.minHz, maxHz = THEREMIN.maxHz } = {}) {
  return clamp(Math.log(hz / minHz) / Math.log(maxHz / minHz), 0, 1);
}

/** Sound is on only with both hands present and a volume above the gate. */
export function thereminGate(hasPitchHand, hasVolumeHand, volume) {
  return !!(hasPitchHand && hasVolumeHand && volume > THEREMIN.gateVolume);
}

/** Note name + cents for a frequency: {midi (float), nearest (int), name ("A4"), cents (-50..50)}. */
export function describePitch(hz) {
  const midi = hzToMidi(hz);
  const nearest = Math.round(midi);
  return { midi, nearest, name: midiToName(nearest), cents: Math.round((midi - nearest) * 100) };
}
/** "+12¢" style text. */
export function formatCents(c) { return (c > 0 ? "+" : c < 0 ? "−" : "±") + Math.abs(c) + "¢"; }

/** Pitch classes (0..11) of the key's scale. */
export function scalePcs(key) { return SCALES[key.mode].map((s) => mod(key.root + s, 12)); }
/** Nearest scale note (as an integer MIDI number) to a fractional MIDI pitch. */
export function snapMidi(midi, key) {
  const pcs = scalePcs(key);
  const base = Math.round(midi);
  let best = base, bestD = Infinity;
  for (let m = base - 7; m <= base + 7; m++) {
    if (!pcs.includes(mod(m, 12))) continue;
    const d = Math.abs(m - midi);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}
/** Hz of the nearest note of the key's scale. */
export function snapHz(hz, key) { return midiToHz(snapMidi(hzToMidi(hz), key)); }

/**
 * Marks for the vertical pitch ruler: every scale note of the key inside the range.
 * pos = 0 (bottom, minHz) .. 1 (top, maxHz) on the same exponential scale as the pitch map.
 */
export function rulerTicks(key, range = {}) {
  const { minHz = THEREMIN.minHz, maxHz = THEREMIN.maxHz } = range;
  const pcs = scalePcs(key);
  const lo = Math.ceil(hzToMidi(minHz) - 1e-9), hi = Math.floor(hzToMidi(maxHz) + 1e-9);
  const out = [];
  for (let m = lo; m <= hi; m++) {
    if (!pcs.includes(mod(m, 12))) continue;
    out.push({ midi: m, name: midiToName(m), root: mod(m, 12) === key.root, pos: unitFromHz(midiToHz(m), { minHz, maxHz }) });
  }
  return out;
}

/**
 * One theremin reading from the two role hands (assignHands output; swap-hands is already applied there).
 * roles.right = pitch hand (the user's right), roles.left = volume hand (the user's left).
 */
export function thereminFromHands(roles, opts = {}) {
  const P = roles && roles.right, V = roles && roles.left;
  return thereminReading(P ? P.lm[LM.WRIST].y : null, V ? V.lm[LM.WRIST].y : null, opts);
}
/** From two wrist heights (null = hand missing). */
export function thereminReading(pitchY, volY, { snap = false, key = null } = {}) {
  const volume = volY == null ? 0 : volumeFromHandY(volY);
  const rawHz = pitchY == null ? null : pitchFromY(pitchY);
  return finish(rawHz, volume, pitchY != null && volY != null, snap, key);
}
/** Pad reading: x (0 left .. 1 right) = pitch, y (0 top .. 1 bottom) = volume, using the same volume band as the camera. */
export function thereminFromPad(x, y, { snap = false, key = null } = {}) {
  const volume = volumeFromY(RULES.volTop + clamp(y, 0, 1) * (RULES.volBottom - RULES.volTop));
  return finish(pitchFromUnit(x), volume, true, snap, key);
}
function finish(rawHz, volume, both, snap, key) {
  const snapped = !!(snap && key && rawHz != null);
  const hz = rawHz == null ? null : snapped ? snapHz(rawHz, key) : rawHz;
  return {
    gate: thereminGate(both, both, volume),
    hz, rawHz, volume, snapped,
    note: hz == null ? null : describePitch(hz),
    tc: { pitch: snapped ? THEREMIN.snapTc : THEREMIN.pitchTc, volume: THEREMIN.volumeTc },
  };
}
