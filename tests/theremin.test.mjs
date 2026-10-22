import test from "node:test";
import assert from "node:assert/strict";
import {
  THEREMIN, pitchFromY, pitchFromUnit, volumeFromHandY, thereminGate, describePitch, snapMidi, snapHz,
  rulerTicks, thereminFromHands, thereminFromPad, thereminReading, midiToHz, hzToMidi, formatCents,
} from "../src/theremin.js";
import { assignHands, wristVolume } from "../src/gestures.js";
import { makeKey } from "../src/theory.js";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../src/storage.js";

const C = makeKey("C");
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const hand = (label, y) => ({ label, score: 1, landmarks: Array.from({ length: 21 }, () => ({ x: label === "Left" ? 0.7 : 0.3, y, z: 0 })) });

test("pitch: exponential 65 Hz (bottom) .. 1200 Hz (top)", () => {
  near(pitchFromY(0.95), 65); near(pitchFromY(1), 65);
  near(pitchFromY(0.05), 1200); near(pitchFromY(0), 1200);
  near(pitchFromY(0.5), Math.sqrt(65 * 1200)); // the middle is the geometric mean
  assert.ok(pitchFromY(0.3) > pitchFromY(0.6), "higher hand = higher pitch");
  near(pitchFromUnit(0.5) / pitchFromUnit(0.25), pitchFromUnit(0.75) / pitchFromUnit(0.5)); // equal ratios
});
test("volume uses the same linear curve as the chord volume", () => {
  for (const y of [0, 0.05, 0.3, 0.5, 0.95, 1]) near(volumeFromHandY(y), wristVolume([{ x: 0, y }]));
  near(volumeFromHandY(0.5), 0.5);
});
test("gate: both hands and volume above 0.02", () => {
  assert.equal(thereminGate(true, true, 0.5), true);
  assert.equal(thereminGate(true, true, 0.02), false);
  assert.equal(thereminGate(true, true, 0.021), true);
  assert.equal(thereminGate(false, true, 1), false);
  assert.equal(thereminGate(true, false, 1), false);
  assert.equal(THEREMIN.pitchTc, 0.03); assert.equal(THEREMIN.volumeTc, 0.04);
});
test("note name and cents", () => {
  assert.deepEqual({ ...describePitch(440), midi: undefined }, { midi: undefined, nearest: 69, name: "A4", cents: 0 });
  assert.equal(describePitch(midiToHz(60.25)).cents, 25);
  assert.equal(describePitch(midiToHz(59.75)).name, "C4");
  assert.equal(describePitch(midiToHz(59.75)).cents, -25);
  assert.equal(formatCents(12), "+12¢"); assert.equal(formatCents(-7), "−7¢");
});
test("snap to key: nearest scale note", () => {
  assert.equal(snapMidi(60.4, C), 60);
  assert.equal(snapMidi(61.2, C), 62); // C# is between C and D: D is nearer
  assert.equal(snapMidi(65.4, C), 65);
  near(snapHz(450, C), midiToHz(69)); // 450 Hz is nearest A4
  assert.equal(snapMidi(60.3, makeKey("D")), 61); // C is not in D major; C# is
  assert.equal(snapMidi(70.4, makeKey("A", "minor")), 71); 
});
test("ruler ticks: only the key's scale notes, bottom to top, roots flagged", () => {
  const ticks = rulerTicks(C);
  assert.ok(ticks.length > 20);
  assert.ok(ticks.every((t) => [0, 2, 4, 5, 7, 9, 11].includes(t.midi % 12)));
  assert.ok(ticks.every((t) => t.pos >= 0 && t.pos <= 1));
  assert.ok(ticks.every((t, i) => !i || t.pos > ticks[i - 1].pos));
  assert.ok(ticks.filter((t) => t.root).every((t) => t.midi % 12 === 0));
  assert.ok(ticks.some((t) => t.name === "C4" && t.root));
  assert.ok(!rulerTicks(C).some((t) => t.name.includes("#")));
});
test("hands: right wrist = pitch, left wrist = volume; needs both", () => {
  const hands = [hand("Left", 0.2), hand("Right", 0.5)];
  const r = thereminFromHands(assignHands(hands, {}));
  near(r.rawHz, pitchFromY(0.5)); near(r.volume, volumeFromHandY(0.2)); assert.equal(r.gate, true);
  const one = thereminFromHands(assignHands([hand("Right", 0.5)], {}));
  assert.equal(one.gate, false);
  assert.equal(thereminFromHands(assignHands([hand("Left", 0.2)], {})).gate, false);
  assert.equal(thereminFromHands(assignHands([hand("Left", 0.96), hand("Right", 0.5)], {})).gate, false, "volume hand low = silent");
});
test("swap hands exchanges the pitch and volume hands", () => {
  const hands = [hand("Left", 0.2), hand("Right", 0.5)];
  const r = thereminFromHands(assignHands(hands, { swap: true }));
  near(r.rawHz, pitchFromY(0.2)); near(r.volume, volumeFromHandY(0.5));
});
test("snap option quantises the output and uses the short glide", () => {
  const free = thereminReading(0.5, 0.2, { snap: false, key: C });
  const snap = thereminReading(0.5, 0.2, { snap: true, key: C });
  assert.equal(free.snapped, false); assert.equal(snap.snapped, true);
  assert.equal(snap.note.cents, 0);
  assert.ok(Math.abs(hzToMidi(snap.hz) - hzToMidi(free.hz)) <= 1.5);
  assert.equal(free.tc.pitch, THEREMIN.pitchTc); assert.equal(snap.tc.pitch, THEREMIN.snapTc);
});
test("pad: x = pitch, y = volume (top loud), always gated on unless silent", () => {
  near(thereminFromPad(0, 0).hz, 65); near(thereminFromPad(1, 0).hz, 1200);
  assert.equal(thereminFromPad(0.5, 0).volume, 1); assert.equal(thereminFromPad(0.5, 1).volume, 0);
  assert.equal(thereminFromPad(0.5, 0.5).gate, true); assert.equal(thereminFromPad(0.5, 1).gate, false);
});
test("settings: volumeFrom defaults to wrist, persists both values, bad values fall back", () => {
  assert.equal(DEFAULT_SETTINGS.volumeFrom, "wrist");
  assert.equal(loadSettings().volumeFrom, "wrist");
  saveSettings({ ...loadSettings(), volumeFrom: "index", thereminSnap: true });
  const s = loadSettings();
  assert.equal(s.volumeFrom, "index"); assert.equal(s.thereminSnap, true);
  saveSettings({ ...s, volumeFrom: "wrist" });
  assert.equal(loadSettings().volumeFrom, "wrist");
  saveSettings({ ...s, volumeFrom: "nonsense", thereminVoice: "x" });
  assert.equal(loadSettings().volumeFrom, "wrist"); assert.equal(loadSettings().thereminVoice, "sine");
  saveSettings({});
});
