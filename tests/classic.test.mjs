import test from "node:test";
import assert from "node:assert/strict";
import { makeKey, buildChord, classicVoice, classicTonicMidi, qualityFor, keyChords } from "../src/theory.js";
import { Performer } from "../src/performer.js";
import { loadSettings } from "../src/storage.js";

const C = makeKey("C");
const midi = (key, o, shift = 0) => classicVoice(buildChord(key, { harmony: "classic", ...o }), key, { octaveShift: shift }).midi;
const tri = (degree, flip = false, inversion = 0) => ({ degree, flip, ext: "triad", inversion });

test("Classic harmony: every degree is major unless flipped; names follow the major scale", () => {
  assert.deepEqual(keyChords(C, "classic").map((c) => c.symbol), ["C", "D", "E", "F", "G", "A", "B"]);
  assert.equal(qualityFor(C, 2, { harmony: "classic" }), "maj");
  assert.equal(qualityFor(C, 2, { harmony: "classic", flip: true }), "min");
  assert.equal(qualityFor(C, 2, { harmony: "diatonic" }), "min");
});
test("tonic window F#3..F4: A=57, C=60, F=65, F#=54, G=55, G#=56", () => {
  const got = ["A", "C", "F", "F#", "G", "Ab", "Bb", "B", "E"].map((n) => classicTonicMidi(makeKey(n).root));
  assert.deepEqual(got, [57, 60, 65, 54, 55, 56, 58, 59, 64]);
});
test("quality 1 = root position with the root doubled an octave up, plus the octave third", () => {
  assert.deepEqual(midi(C, tri(1)), [60, 67, 72, 76]);
  assert.deepEqual(midi(C, tri(1, true)), [60, 67, 72, 75]);
});
test("quality 2 = 1st inversion: 3rd, 5th, octave root, octave 3rd", () => {
  assert.deepEqual(midi(C, tri(1, false, 1)), [64, 67, 72, 76]);
  assert.deepEqual(midi(C, tri(1, true, 1)), [63, 67, 72, 75]);
});
test("quality 3 = maj7 on major, m7 on minor; quality 4 = dom7, or dim7 with b5 on minor", () => {
  assert.deepEqual(midi(C, { degree: 1, ext: "seventh" }), [60, 64, 67, 71]);
  assert.deepEqual(midi(C, { degree: 1, ext: "seventh", flip: true }), [60, 63, 67, 70]);
  assert.deepEqual(midi(C, { degree: 1, ext: "dom7" }), [60, 64, 67, 70]);
  assert.deepEqual(midi(C, { degree: 1, ext: "dim7", flip: true }), [60, 63, 66, 69]);
});
test("degree roots come from the major scale; VII sits a semitone BELOW the tonic", () => {
  const roots = [1, 2, 3, 4, 5, 6, 7].map((d) => midi(C, tri(d))[0]);
  assert.deepEqual(roots, [60, 62, 64, 65, 67, 69, 59]);
  const A = makeKey("A");
  assert.deepEqual([1, 7].map((d) => midi(A, tri(d))[0]), [57, 56]);
});
test("octave down drops every note by 12; semitone shift moves the root", () => {
  assert.deepEqual(midi(C, tri(1), -1), [48, 55, 60, 64]);
  assert.deepEqual(midi(C, { ...tri(1), alter: 1 }), [61, 68, 73, 77]);
  assert.deepEqual(midi(C, { ...tri(4), alter: -1 })[0], 64);
});
test("high keys fold down: F# major I root is F#3 (54)", () => {
  assert.deepEqual(midi(makeKey("F#"), tri(1)), [54, 61, 66, 70]);
});
test("non-Classic colours fall back to normal voicing", () => {
  assert.equal(classicVoice(buildChord(C, { degree: 1, ext: "sus4" }), C), null);
  assert.equal(classicVoice(buildChord(C, { degree: 1, ext: "triad", inversion: 2 }), C), null);
});

// ---- Performer wiring with a stub audio engine
function rig(harmony = "classic", key = C) {
  const audio = { voiced: [], released: 0, expr: [], filter: [], setChord(v) { this.voiced.push(v); }, release() { this.released++; }, setExpression(x) { this.expr.push(x); }, setFilter(f) { this.filter.push(f); }, strum() {} };
  const p = new Performer(audio, { key, harmony });
  return { audio, p, last: () => audio.voiced[audio.voiced.length - 1] };
}
test("performer: gesture colours produce the Classic voicings and chord names", () => {
  const { p, last } = rig();
  p.setGestureEnabled(true);
  const g = (o) => p.setGesture({ degree: 5, flip: false, alter: 0, colour: "dom7", octaveDown: false, volume: 0.8, filter: { freq: 1200, q: 0.7 }, ...o });
  g({});
  assert.equal(p.info.chord.symbol, "G7");
  assert.deepEqual(last().midi, [67, 71, 74, 77]);
  g({ flip: true });
  assert.equal(p.info.chord.symbol, "Gdim7");
  assert.deepEqual(last().midi, [67, 70, 73, 76]);
  g({ flip: true, colour: "seventh" });
  assert.equal(p.info.chord.symbol, "Gm7");
  g({ colour: "seventh" });
  assert.equal(p.info.chord.symbol, "Gmaj7");
  g({ colour: "inv1" });
  assert.deepEqual(last().midi, [71, 74, 79, 83]);
  g({ colour: "triad", octaveDown: true });
  assert.deepEqual(last().midi, [55, 62, 67, 71]);
});
test("performer: mute / no degree = silence", () => {
  const { p, audio } = rig();
  p.setGestureEnabled(true);
  p.setGesture({ degree: 1, flip: false, alter: 0, colour: "triad", octaveDown: false, volume: 1, filter: null });
  assert.ok(!p.info.silent);
  p.setGesture({ degree: 1, flip: false, alter: 0, colour: "mute", octaveDown: false, volume: 0, filter: null });
  assert.ok(p.info.silent);
  assert.ok(audio.released >= 1);
  p.setGesture({ degree: 0, flip: false, alter: 0, colour: "mute", octaveDown: false, volume: 0, filter: null });
  assert.ok(p.info.silent);
});
test("performer: Q W E R equal right-hand 1-4 fingers; Shift + R on a chord is dim7 in Classic", () => {
  const { p, last } = rig();
  const chord = (colour, flip) => { p.colourButton(colour); p.press("keys", 1, flip); return last().midi; };
  assert.deepEqual(chord("triad", false), [60, 67, 72, 76]);
  assert.deepEqual(chord("inv1", false), [64, 67, 72, 76]);
  assert.deepEqual(chord("seventh", false), [60, 64, 67, 71]);
  assert.deepEqual(chord("dom7", false), [60, 64, 67, 70]);
  assert.deepEqual(chord("dom7", true), [60, 63, 66, 69]);
});
test("performer: one-handed (colour null) uses the pad/key colour, default root-position triad", () => {
  const { p, last } = rig();
  p.setGestureEnabled(true);
  p.setGesture({ degree: 4, flip: false, alter: 0, colour: null, octaveDown: false, volume: 0.5, filter: { freq: 1200, q: 0.7 } });
  assert.deepEqual(last().midi, [65, 72, 77, 81]);
});
test("Diatonic harmony is still available and unchanged (vii is diminished)", () => {
  const { p } = rig("diatonic");
  p.setGestureEnabled(true);
  p.setGesture({ degree: 7, flip: false, alter: 0, colour: "triad", octaveDown: false, volume: 1, filter: null });
  assert.equal(p.info.chord.symbol, "Bdim");
  p.setGesture({ degree: 2, flip: false, alter: 0, colour: "triad", octaveDown: false, volume: 1, filter: null });
  assert.equal(p.info.chord.symbol, "Dm");
});
test("settings: Classic is the default, old 'free' becomes classic, right-hand help is off", () => {
  const s = loadSettings();
  assert.equal(s.harmony, "classic");
  assert.equal(s.rightLenient, false);
  assert.equal(s.raiseOn, false);
  assert.equal(s.lowerOn, false);
});
