import test from "node:test";
import assert from "node:assert/strict";
import {
  VOWELS, FORMANTS, vowelAt, vowelPosOf, vowelLabel, nearestVowel, tiltFromFilter, vowelPosFromTilt, vowelPosFromFilter, vowelPosFor,
  CONSONANTS, SYLLABLE_LIST, syllablePlan, vibratoDepthAt, VIBRATO,
} from "../src/formants.js";
import { filterFor } from "../src/gestures.js";
import { PRESET_LIST, PRESET_GROUPS, AudioEngine } from "../src/audio.js";
import { loadSettings, DEFAULT_SETTINGS } from "../src/storage.js";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const nearArr = (a, b) => a.forEach((v, i) => near(v, b[i]));

test("formant table: F1 < F2 < F3 for every vowel and consonant", () => {
  for (const v of VOWELS) { const { f } = FORMANTS[v]; assert.ok(f[0] < f[1] && f[1] < f[2], v); }
  for (const [k, c] of Object.entries(CONSONANTS)) assert.ok(c.spec.f[0] < c.spec.f[1] && c.spec.f[1] < c.spec.f[2], k);
});
test("vowel interpolation: endpoints, midpoint, and a halfway blend", () => {
  nearArr(vowelAt(0).f, FORMANTS.u.f);
  nearArr(vowelAt(1).f, FORMANTS.i.f);
  nearArr(vowelAt(0.5).f, FORMANTS.a.f); // the middle of u-o-a-e-i is "a"
  nearArr(vowelAt(-3).f, FORMANTS.u.f); nearArr(vowelAt(9).f, FORMANTS.i.f); // clamped
  nearArr(vowelAt(0.125).f, FORMANTS.u.f.map((v, i) => (v + FORMANTS.o.f[i]) / 2)); // halfway u -> o
  near(vowelAt(0.375).q[1], (FORMANTS.o.q[1] + FORMANTS.a.q[1]) / 2);
  for (const v of VOWELS) nearArr(vowelAt(vowelPosOf(v)).f, FORMANTS[v].f);
  // stays ordered everywhere along the line
  for (let p = 0; p <= 1; p += 0.01) { const f = vowelAt(p).f; assert.ok(f[0] < f[1] && f[1] < f[2]); }
});
test("tilt maps to the vowel line: outward oo, neutral ah, inward ee", () => {
  near(vowelPosFromFilter(filterFor(0)), 0.5);
  near(vowelPosFromFilter(filterFor(-1)), 0);
  near(vowelPosFromFilter(filterFor(1)), 1);
  near(tiltFromFilter(filterFor(0.4)), 0.4); near(tiltFromFilter(filterFor(-0.6)), -0.6);
  near(vowelPosFromFilter(null), 0.5);
  assert.equal(vowelLabel(vowelPosFromFilter(filterFor(0))), "ah");
  assert.equal(vowelLabel(0), "oo"); assert.equal(vowelLabel(1), "ee"); assert.equal(nearestVowel(0.3), "o");
  near(vowelPosFromTilt(0), 0.5); near(vowelPosFor(0.5, 0.5), 0.5); near(vowelPosFor(0, 1), 0.5); near(vowelPosFor(0.9, 1), 1);
});
test("syllable plans: five syllables, consonant first, short onset", () => {
  assert.deepEqual(SYLLABLE_LIST.map((s) => s.id), ["la", "doo", "na", "mm", "aah"]);
  for (const { id } of SYLLABLE_LIST) {
    const p = syllablePlan(id);
    assert.ok(p.onsetEnd >= 0 && p.onsetEnd < 0.3, id);
    assert.ok(p.startAmp > 0 && p.startAmp <= 1 && p.endAmp > 0 && p.endAmp <= 1, id);
    near(p.onsetEnd, p.consDur + p.glide);
  }
  assert.equal(syllablePlan("aah").cons, null); assert.equal(syllablePlan("aah").onsetEnd, 0);
  assert.ok(syllablePlan("doo").burst, "d has a noise burst"); assert.equal(syllablePlan("la").burst, null);
  assert.equal(syllablePlan("la").cons, CONSONANTS.l); assert.equal(syllablePlan("nonsense").id, "la");
  assert.ok(syllablePlan("mm").consDur > syllablePlan("na").consDur * 0.9);
});
test("vibrato starts about 250 ms in and fades up", () => {
  assert.equal(VIBRATO.delay, 0.25);
  assert.equal(vibratoDepthAt(0), 0); assert.equal(vibratoDepthAt(0.25), 0);
  assert.ok(vibratoDepthAt(0.4) > 0 && vibratoDepthAt(0.4) < 1);
  assert.equal(vibratoDepthAt(0.25 + VIBRATO.ramp), 1); assert.equal(vibratoDepthAt(5), 1);
});
test("instrument list: grouped as specified, ids unique, all accepted by the engine", () => {
  assert.deepEqual(PRESET_GROUPS.map((g) => g.name), ["Synths", "Keys", "Band & Orchestra", "Voices"]);
  assert.deepEqual(PRESET_GROUPS.map((g) => g.presets.map((p) => p.name)), [
    ["Warm Pad", "Bright Synth", "Retro Chip", "Supersaw", "Pluck", "Acid", "Synth Bass + Pad"],
    ["Electric Piano", "Lo-fi Keys", "Organ", "Music Box"],
    ["Strings", "Horns", "Nylon Guitar"],
    ["Choir", "Robo Singer"],
  ]);
  assert.equal(new Set(PRESET_LIST.map((p) => p.id)).size, PRESET_LIST.length);
  for (const p of PRESET_LIST) { const e = new AudioEngine(); e.setPreset(p.id); assert.equal(e.preset, p.id); assert.ok(["filter", "vowel", "cutoff"].includes(e.toneMode)); }
  const e = new AudioEngine(); e.setPreset("choir"); assert.equal(e.toneMode, "vowel");
  e.setPreset("acid"); assert.equal(e.toneMode, "cutoff");
  e.setFilter(filterFor(1)); assert.ok(e.acidBase() > 5000); e.setFilter(filterFor(-1)); assert.ok(e.acidBase() < 150);
});
test("settings: new defaults and validation", () => {
  assert.equal(DEFAULT_SETTINGS.syllable, "la");
  const s = loadSettings();
  assert.ok(["follow", "u", "o", "a", "e", "i"].includes(s.thereminVowel));
  assert.equal(s.roboTune, "glide");
});
