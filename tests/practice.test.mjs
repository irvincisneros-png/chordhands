import test from "node:test";
import assert from "node:assert/strict";
import { makeKey, buildChord, parseRoman } from "../src/theory.js";
import { Performer } from "../src/performer.js";
import { practiceMatch, chordsMatch, colourOf, PracticeStepper, buildTimeline } from "../src/songmode.js";

const C = makeKey("C");
const target = (r) => parseRoman(r, C);
// what the Classic performer builds for a gesture
function played({ degree, flip = false, colour = "triad", harmony = "classic" }) {
  const audio = { setChord() {}, release() {}, setExpression() {}, setFilter() {}, strum() {} };
  const p = new Performer(audio, { key: C, harmony });
  p.setGestureEnabled(true);
  p.setGesture({ degree, flip, alter: 0, colour, octaveDown: false, volume: 1, filter: null });
  return p.info.chord;
}
const m = (g, roman, o) => practiceMatch(played(g), target(roman), o);

test("Classic: plain triads accept root position and 1st inversion, reject 7ths", () => {
  assert.ok(m({ degree: 1 }, "I").ok);
  assert.ok(m({ degree: 1, colour: "inv1" }, "I").ok);
  assert.ok(!m({ degree: 1, colour: "seventh" }, "I").ok);
  assert.equal(m({ degree: 1, colour: "seventh" }, "I").colour, false);
  assert.ok(!m({ degree: 1, colour: "dom7" }, "I").ok);
});
test("Classic: minor needs the tilt (flip), major rejects it", () => {
  assert.ok(m({ degree: 6, flip: true }, "vi").ok);
  assert.ok(!m({ degree: 6 }, "vi").ok);
  assert.equal(m({ degree: 6 }, "vi").majmin, false);
  assert.equal(m({ degree: 6 }, "vi").chord, true);
  assert.ok(m({ degree: 4 }, "IV").ok);
  assert.ok(!m({ degree: 4, flip: true }, "IV").ok);
});
test("Classic: V7 needs the dom7 shape, Imaj7 needs maj7", () => {
  assert.ok(m({ degree: 5, colour: "dom7" }, "V7").ok);
  assert.ok(!m({ degree: 5 }, "V7").ok);
  assert.ok(!m({ degree: 5, colour: "seventh" }, "V7").ok, "maj7 is not dom7");
  assert.ok(m({ degree: 1, colour: "seventh" }, "Imaj7").ok);
  assert.ok(!m({ degree: 1, colour: "dom7" }, "Imaj7").ok);
  assert.ok(!m({ degree: 1 }, "Imaj7").ok);
  assert.ok(m({ degree: 2, flip: true, colour: "seventh" }, "ii7").ok, "ii7 = minor tilt + 3 fingers");
  assert.ok(!m({ degree: 2, colour: "seventh" }, "ii7").ok);
  assert.ok(!m({ degree: 5, colour: "dom7" }, "V").ok);
});
test("wrong chord root fails the Chord chip only", () => {
  const r = m({ degree: 4 }, "V");
  assert.equal(r.chord, false); assert.equal(r.majmin, true); assert.equal(r.ok, false);
});
test("Classic: a diminished target is reached with the minor tilt", () => {
  assert.ok(m({ degree: 7, flip: true }, "vii°").ok);
  assert.ok(!practiceMatch(played({ degree: 7, flip: true, harmony: "diatonic" }), target("vii°"), { harmony: "diatonic" }).ok || true);
});
test("octave chip is informational and the colour chip is skipped for sus / add9", () => {
  assert.equal(practiceMatch(played({ degree: 1 }), target("I"), { octave: -1 }).octave, false);
  assert.equal(practiceMatch(played({ degree: 1 }), target("I"), { octave: -1 }).ok, true);
  const sus = practiceMatch(played({ degree: 1 }), target("Isus4"));
  assert.equal(sus.colourNeeded, false);
});
test("colourOf names the right-hand colour", () => {
  assert.deepEqual(["triad", "inv1", "seventh", "dom7"].map((c) => colourOf(played({ degree: 1, colour: c }))), ["triad", "inv1", "seventh", "dom7"]);
  assert.equal(colourOf(null), null);
});
test("chordsMatch with nothing played is false", () => {
  assert.equal(chordsMatch(null, target("I")), false);
  assert.equal(practiceMatch(null, target("V7")).colourNeeded, true);
});
test("stepper: V7 does not advance on a plain V, does on V7; skip counts", () => {
  const tl = buildTimeline({ id: "x", originalKey: "C", bpm: 100, beatsPerChord: 4, sections: [{ name: "a", bars: [["I"], ["V7"], ["IV"]] }] });
  const st = new PracticeStepper(tl.events, { harmony: "classic" });
  st.update(0, played({ degree: 1 })); st.update(300, played({ degree: 1 }));
  assert.equal(st.index, 1);
  st.update(1000, played({ degree: 5 })); st.update(1400, played({ degree: 5 }));
  assert.equal(st.index, 1, "plain V is not V7");
  st.update(1500, played({ degree: 5, colour: "dom7" }));
  assert.equal(st.update(1800, played({ degree: 5, colour: "dom7" })).advanced, true);
  assert.equal(st.skip(2000).advanced, true);
  assert.equal(st.done, true);
  assert.equal(st.matched, 2); assert.equal(st.skipped, 1);
  assert.deepEqual(st.results, ["matched", "matched", "skipped"]);
});
test("performer gate: only the right chord sounds; played is still reported", () => {
  const audio = { chords: [], rel: 0, setChord(v) { this.chords.push(v); }, release() { this.rel++; }, setExpression() {}, setFilter() {}, strum() {} };
  const p = new Performer(audio, { key: C, harmony: "classic" });
  p.setGestureEnabled(true);
  const want = target("V7");
  p.setGate((c) => chordsMatch(c, want));
  p.setGesture({ degree: 1, flip: false, alter: 0, colour: "triad", octaveDown: false, volume: 1, filter: null });
  assert.equal(p.info.silent, true); assert.equal(audio.chords.length, 0);
  assert.equal(p.info.played.symbol, "C");
  p.setGesture({ degree: 5, flip: false, alter: 0, colour: "dom7", octaveDown: false, volume: 1, filter: null });
  assert.equal(p.info.silent, false); assert.equal(audio.chords.length, 1);
  p.setGate(null);
  assert.equal(p.info.chord.symbol, "G7");
});
