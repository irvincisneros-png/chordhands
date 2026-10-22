import test from "node:test";
import assert from "node:assert/strict";
import { Recorder } from "../src/recorder.js";
import { Tutorial, STEPS } from "../src/tutorial.js";
import { makeKey, buildChord } from "../src/theory.js";

test("recorder exports chord text and skips repeats/silence", () => {
  let t = 0;
  const r = new Recorder(() => t);
  const C = makeKey("C");
  r.start();
  for (const d of [1, 1, 5, 0, 6, 4]) {
    t += 500;
    r.push(d ? buildChord(C, { degree: d }) : null);
  }
  r.stop();
  assert.equal(r.toText(), "C | G | Am | F");
  assert.ok(r.duration >= 3000);
});
test("tutorial advances through I -> IV -> iv -> V7 -> I", () => {
  const C = makeKey("C");
  const tut = new Tutorial(STEPS, { holdMs: 300 });
  const seq = [{ degree: 1 }, { degree: 4 }, { degree: 4, flip: true }, { degree: 5, ext: "seventh" }, { degree: 1 }];
  let t = 0;
  for (const s of seq) {
    const chord = buildChord(C, s);
    tut.update(t, chord);
    t += 350;
    assert.equal(tut.update(t, chord).advanced, true, chord.roman);
    t += 100;
  }
  assert.equal(tut.done, true);
});
test("tutorial ignores wrong chords", () => {
  const tut = new Tutorial(STEPS, { holdMs: 300 });
  const C = makeKey("C");
  tut.update(0, buildChord(C, { degree: 5 }));
  assert.equal(tut.update(1000, buildChord(C, { degree: 5 })).advanced, false);
  assert.equal(tut.index, 0);
});
