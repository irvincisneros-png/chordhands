import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeHand, classifyLeft, classifyRight, assignHands, Debouncer, GestureTracker,
  fingerUp, thumbOut, tiltAmount, heightBand, fingertipVolume, wristVolume, handVolume, volumeFromY, filterFor, RULES,
} from "../src/gestures.js";

// Synthetic upright hand in RAW frame coordinates (y down), wrist at (ox, oy), palm length about 0.2.
//  fingers: [index, middle, ring, pinky] 0/1      thumb: 0/1 (out)       side: 'left' | 'right' (the hand's own label)
//  lean: >0 shifts the knuckles to raw-RIGHT of the wrist (fingertips lean raw-right = screen-left)
function hand({ fingers = [0, 0, 0, 0], thumb = 0, side = "left", ox = 0.5, oy = 0.8, lean = 0 }) {
  const lm = Array.from({ length: 21 }, () => ({ x: ox, y: oy, z: 0 }));
  const set = (i, x, y) => (lm[i] = { x: ox + x + lean * -y, y: oy + y, z: 0 });
  set(0, 0, 0);
  const cols = [-0.045, -0.015, 0.015, 0.045];
  const mcpY = [-0.19, -0.2, -0.19, -0.17];
  const len = [0.1, 0.11, 0.1, 0.08];
  cols.forEach((cx, f) => {
    const base = [5, 9, 13, 17][f];
    set(base, cx, mcpY[f]);
    if (fingers[f]) { set(base + 1, cx, mcpY[f] - len[f] * 0.4); set(base + 2, cx, mcpY[f] - len[f] * 0.7); set(base + 3, cx, mcpY[f] - len[f]); }
    else { set(base + 1, cx, mcpY[f] - 0.03); set(base + 2, cx, mcpY[f] + 0.0); set(base + 3, cx, mcpY[f] + 0.03); }
  });
  set(1, 0.03, -0.05); set(2, 0.06, -0.1);
  // thumb "out" points away from the palm: raw-left for a Left-labelled hand, raw-right for a Right-labelled one
  const dir = side === "right" ? 1 : -1;
  if (thumb) { set(3, dir * 0.12, -0.14); set(4, dir * 0.17, -0.18); } else { set(3, dir * 0.03, -0.14); set(4, 0, -0.17); }
  return lm;
}
const n4 = (n) => [0, 1, 2, 3].map((i) => (i < n ? 1 : 0));
const deg = (o) => classifyLeft(analyzeHand(hand({ side: "left", ...o }), "left"));
const col = (o, side = "right") => classifyRight(analyzeHand(hand({ side, ...o }), side));

test("chord hand: number of digits up = degree I..V (thumb counts)", () => {
  assert.equal(deg({ fingers: n4(1) }), 1);
  assert.equal(deg({ fingers: n4(2) }), 2);
  assert.equal(deg({ fingers: n4(3) }), 3);
  assert.equal(deg({ fingers: n4(4) }), 4);
  assert.equal(deg({ fingers: n4(4), thumb: 1 }), 5);
  assert.equal(deg({ thumb: 1 }), 1, "thumb alone is one digit");
  assert.equal(deg({ fingers: n4(2), thumb: 1 }), 3);
  assert.equal(deg({ fingers: [0, 1, 0, 0] }), 1, "any single finger is I");
});
test("chord hand: index+pinky = VI, plus thumb = VII, fist = silence", () => {
  assert.equal(deg({ fingers: [1, 0, 0, 1] }), 6);
  assert.equal(deg({ fingers: [1, 0, 0, 1], thumb: 1 }), 7);
  assert.equal(deg({}), 0);
  assert.equal(deg({ fingers: [1, 1, 0, 1] }), 3, "only the exact index+pinky shape is VI");
  assert.equal(deg({ fingers: [0, 1, 0, 1] }), 2, "middle+pinky is just two digits");
});
test("colour hand: finger count picks the chord shape, thumb ignored for the count", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => col({ fingers: n4(n) }).colour), ["mute", "triad", "inv1", "seventh", "dom7"]);
  assert.equal(col({ fingers: n4(3), thumb: 1 }).quality, 3);
});
test("thumb test follows the hand's own side; thumb out = octave down on the colour hand", () => {
  for (const side of ["left", "right"]) {
    assert.equal(thumbOut(hand({ side, thumb: 1 }), side), true, side + " out");
    assert.equal(thumbOut(hand({ side, thumb: 0 }), side), false, side + " in");
  }
  assert.equal(col({ fingers: n4(1), thumb: 1 }).octaveDown, true);
  assert.equal(col({ fingers: n4(1), thumb: 0 }).octaveDown, false);
  // the same drawn thumb is "in" for the opposite hand
  assert.equal(thumbOut(hand({ side: "right", thumb: 1 }), "left"), false);
});
test("finger-up test is tip above middle joint (not rotation tolerant, like the original)", () => {
  const lm = hand({ fingers: [1, 0, 0, 0] });
  assert.equal(fingerUp(lm, 0), true);
  assert.equal(fingerUp(lm, 1), false);
  const flipped = lm.map((p) => ({ ...p, y: 1 - p.y }));
  assert.equal(fingerUp(flipped, 0), false, "an upside-down hand counts as folded");
});

test("tilt: inward positive for both hands; deadzone while the wrist is between the knuckles", () => {
  // lean > 0 => knuckles raw-right of wrist => fingertips lean screen-left.
  // That is OUTWARD for the left hand (which lives on the screen's left) and INWARD for the right hand.
  assert.ok(tiltAmount(hand({ lean: 0.6 }), "left") < 0, "left hand outward is negative");
  assert.ok(tiltAmount(hand({ lean: -0.6, side: "left" }), "left") > 0, "left hand inward is positive");
  assert.ok(tiltAmount(hand({ lean: 0.6, side: "right" }), "right") > 0, "right hand inward is positive");
  assert.ok(tiltAmount(hand({ lean: -0.6, side: "right" }), "right") < 0, "right hand outward is negative");
  assert.equal(tiltAmount(hand({}), "left"), 0, "upright is neutral");
  assert.equal(tiltAmount(hand({ lean: 0.04 }), "left"), 0, "a small lean keeps the wrist between the knuckles: still neutral");
});
test("tilt is clamped to -1..1 and scales over 0.12 of frame width", () => {
  assert.equal(tiltAmount(hand({ lean: 3 }), "left"), -1);
  assert.equal(tiltAmount(hand({ lean: -3 }), "left"), 1);
});
test("chord hand: minor only when tilted outward, major otherwise (incl. upright)", () => {
  const tr = new GestureTracker({ aspect: 1 });
  const run = (lean) => {
    let out;
    for (let t = 0; t <= 400; t += 33) out = tr.update(t, { left: { lm: hand({ fingers: n4(4), lean, ox: 0.7 }), side: "left" }, right: { lm: hand({ fingers: n4(1), side: "right", ox: 0.3 }), side: "right" } });
    tr.reset();
    return out;
  };
  assert.equal(run(0).flip, false, "upright = major");
  assert.equal(run(-0.6).flip, false, "inward = major");
  assert.equal(run(0.6).flip, true, "outward = minor");
});

test("pitch bands: whole hand in the top half raises, lowest point at 80% or below lowers", () => {
  assert.equal(heightBand(hand({ oy: 0.45 })), 1);
  assert.equal(heightBand(hand({ oy: 0.6 })), 0);
  assert.equal(heightBand(hand({ oy: 0.85 })), -1);
  // boundaries: max y < 0.5 raises, max y >= 0.8 lowers
  const flat = (y) => Array.from({ length: 21 }, () => ({ x: 0.5, y, z: 0 }));
  assert.equal(heightBand(flat(0.499)), 1);
  assert.equal(heightBand(flat(0.5)), 0);
  assert.equal(heightBand(flat(0.79)), 0);
  assert.equal(heightBand(flat(0.8)), -1);
});
test("pitch bands only act when their toggle is on", () => {
  const run = (opts, oy) => {
    const tr = new GestureTracker({ aspect: 1, oneHanded: true, ...opts });
    let out;
    for (let t = 0; t <= 400; t += 33) out = tr.update(t, { left: { lm: hand({ fingers: n4(1), oy }), side: "left" }, right: null });
    return out.alter;
  };
  assert.equal(run({}, 0.4), 0);
  assert.equal(run({ raiseOn: true }, 0.4), 1);
  assert.equal(run({ raiseOn: true }, 0.9), 0, "lower toggle is off");
  assert.equal(run({ lowerOn: true }, 0.9), -1);
  assert.equal(run({ raiseOn: true, lowerOn: true }, 0.65), 0);
});

test("right-hand volume follows the index fingertip: linear from y 0.05 (full) to 0.95 (silent)", () => {
  const withTip = (y, o = {}) => { const lm = hand({ fingers: [1, 0, 0, 0], side: "right", ...o }); lm[8] = { ...lm[8], y }; return lm; };
  const at = (y) => fingertipVolume(withTip(y));
  assert.equal(at(0), 1);
  assert.equal(at(0.05), 1);
  assert.ok(Math.abs(at(0.5) - 0.5) < 1e-9);
  assert.equal(at(0.95), 0);
  assert.equal(at(1), 0);
  assert.ok(at(0.2) > at(0.6), "high fingertip loud, low fingertip quiet (wrist fixed)");
  assert.ok(fingertipVolume(withTip(0.1)) > fingertipVolume(withTip(0.8)));
  // wrist moves, fingertip fixed: no change
  assert.equal(fingertipVolume(withTip(0.4, { oy: 0.5 })), fingertipVolume(withTip(0.4, { oy: 0.9 })));
  // folded index still uses its tip y
  const folded = hand({ side: "right" }); folded[8] = { ...folded[8], y: 0.5 };
  assert.ok(Math.abs(fingertipVolume(folded) - 0.5) < 1e-9);
});
test("right-hand tilt -> filter: 250 Hz..1200 Hz..5000 Hz, Q 2.2 .. 0.7 .. 5.2", () => {
  assert.deepEqual(filterFor(0), { freq: 1200, q: 0.7 });
  const dark = filterFor(-1), bright = filterFor(1);
  assert.equal(dark.freq, 250);
  assert.ok(Math.abs(dark.q - 2.2) < 1e-9);
  assert.equal(bright.freq, 5000);
  assert.ok(Math.abs(bright.q - 5.2) < 1e-9);
  assert.ok(Math.abs(filterFor(0.5).freq - 3100) < 1e-9);
  assert.ok(Math.abs(filterFor(-0.5).freq - 725) < 1e-9);
});

test("handedness: the 'Left' label is the chord hand, 'Right' the colour hand", () => {
  const h = (label, x) => ({ label, score: 0.9, landmarks: hand({ ox: x }) });
  let r = assignHands([h("Left", 0.7)]);
  assert.ok(r.left && !r.right);
  assert.equal(r.left.side, "left");
  r = assignHands([h("Right", 0.3)]);
  assert.ok(r.right && !r.left);
  r = assignHands([h("Left", 0.7), h("Right", 0.3)]);
  assert.ok(r.left.meanX > r.right.meanX);
});
test("swap hands exchanges roles but the hand keeps its own side for thumb/tilt", () => {
  const hs = [{ label: "Right", score: 0.9, landmarks: hand({ ox: 0.3, side: "right" }) }];
  const r = assignHands(hs, { swap: true });
  assert.ok(r.left && !r.right);
  assert.equal(r.left.side, "right");
});
test("duplicate labels fall back to x position (left hand on the larger raw x)", () => {
  const hs = [{ label: "Left", score: 0.9, landmarks: hand({ ox: 0.25 }) }, { label: "Left", score: 0.8, landmarks: hand({ ox: 0.75 }) }];
  const r = assignHands(hs);
  assert.ok(r.left.meanX > 0.5 && r.right.meanX < 0.5);
});
test("one-handed mode reads only the chord-role hand", () => {
  const one = (label) => assignHands([{ label, score: 1, landmarks: hand({}) }], { oneHanded: true });
  assert.ok(one("Left").left);
  assert.equal(one("Right").left, null, "a lone Right-labelled hand is ignored, like the original");
  const both = assignHands([{ label: "Left", score: 1, landmarks: hand({ ox: 0.7 }) }, { label: "Right", score: 0.9, landmarks: hand({ ox: 0.3 }) }], { oneHanded: true });
  assert.ok(both.left && !both.right);
  assert.equal(both.extra, 1);
});

test("debouncer: 100 ms hold, 50 ms dropout bridge", () => {
  const d = new Debouncer();
  assert.equal(d.update(1000, "A").stable, null);
  assert.equal(d.update(1090, "A").stable, null, "89 ms is not enough");
  assert.equal(d.update(1100, "A").stable, "A");
  // change must also hold 100 ms
  assert.equal(d.update(1120, "B").stable, "A");
  assert.equal(d.update(1210, "B").stable, "A");
  assert.equal(d.update(1220, "B").stable, "B");
  // a flicker back and forth restarts the timer
  d.update(1300, "C"); d.update(1380, "B"); d.update(1400, "C");
  assert.equal(d.update(1450, "C").stable, "B");
  assert.equal(d.update(1500, "C").stable, "C");
  // dropout shorter than 50 ms is invisible; longer drops to silence only after another 100 ms
  assert.equal(d.update(1520, null).candidate, "C");
  assert.equal(d.update(1545, null).candidate, "C");
  assert.equal(d.update(1560, "C").stable, "C");
  d.update(1600, null);
  assert.equal(d.update(1670, null).candidate, null, "bridge over after 50 ms");
  assert.equal(d.update(1750, null).stable, "C", "still held 100 ms after the candidate changed");
  assert.equal(d.update(1770, null).stable, null);
});

// ---------------- tracker end to end ----------------
const LH = (o = {}) => ({ lm: hand({ side: "left", ox: 0.7, oy: 0.6, ...o }), side: "left" });
const RH = (o = {}) => ({ lm: hand({ side: "right", ox: 0.3, oy: 0.6, ...o }), side: "right" });
function run(tr, from, to, frame) {
  let out;
  for (let t = from; t <= to; t += 33) out = tr.update(t, frame);
  return out;
}

test("two-handed: degree, colour, octave and a debounced start", () => {
  const tr = new GestureTracker({ aspect: 1 });
  let out = tr.update(0, { left: LH({ fingers: n4(3) }), right: RH({ fingers: n4(3), thumb: 1 }) });
  assert.equal(out.degree, 0, "nothing sounds before the 100 ms hold");
  assert.ok(out.progress.left > 0 || out.progress.right >= 0);
  out = run(tr, 33, 300, { left: LH({ fingers: n4(3) }), right: RH({ fingers: n4(3), thumb: 1 }) });
  assert.equal(out.degree, 3);
  assert.equal(out.colour, "seventh");
  assert.equal(out.octaveDown, true);
  assert.equal(out.info.locked, true);
});
test("lock-in progress rises while a new shape is pending", () => {
  const tr = new GestureTracker({ aspect: 1 });
  run(tr, 0, 300, { left: LH({ fingers: n4(1) }), right: RH({ fingers: n4(1) }) });
  const a = tr.update(1000, { left: LH({ fingers: n4(2) }), right: RH({ fingers: n4(1) }) });
  assert.equal(a.degree, 1, "old chord keeps sounding while the new shape locks in");
  assert.equal(a.progress.left, 0);
  const b = tr.update(1050, { left: LH({ fingers: n4(2) }), right: RH({ fingers: n4(1) }) });
  assert.ok(b.progress.left > 0.4 && b.progress.left < 0.6, "ring " + b.progress.left);
  assert.equal(b.progress.right, 0);
  const c = tr.update(1100, { left: LH({ fingers: n4(2) }), right: RH({ fingers: n4(1) }) });
  assert.equal(c.degree, 2);
  assert.equal(c.progress.left, 0);
});
test("every right-hand shape and the volume / filter come straight from the frame", () => {
  const tr = new GestureTracker({ aspect: 1 });
  const out = run(tr, 0, 300, { left: LH({ fingers: n4(1) }), right: RH({ fingers: n4(2), oy: 0.5, lean: 0.6 }) });
  assert.equal(out.colour, "inv1");
  assert.ok(Math.abs(out.volume - wristVolume(RH({ fingers: n4(2), oy: 0.5, lean: 0.6 }).lm)) < 1e-9);
  assert.ok(out.filter.freq > 1200, "inward tilt opens the filter");
});
test("hands missing, two-handed: no right hand = silence (immediate volume 0, mute after the hold)", () => {
  const tr = new GestureTracker({ aspect: 1 });
  run(tr, 0, 300, { left: LH({ fingers: n4(3) }), right: RH({ fingers: n4(3) }) });
  let out = tr.update(333, { left: LH({ fingers: n4(3) }), right: null });
  assert.equal(out.volume, 0);
  assert.equal(out.colour, "seventh", "chord still held a moment");
  out = run(tr, 366, 600, { left: LH({ fingers: n4(3) }), right: null });
  assert.equal(out.colour, "mute");
  assert.equal(out.volume, 0);
});
test("hands missing: no chord hand = silence after the bridge + hold; fist = silence", () => {
  const tr = new GestureTracker({ aspect: 1 });
  run(tr, 0, 300, { left: LH({ fingers: n4(3) }), right: RH({ fingers: n4(1) }) });
  let out = tr.update(330, { left: null, right: RH({ fingers: n4(1) }) });
  assert.equal(out.degree, 3, "short dropout is bridged");
  out = run(tr, 363, 600, { left: null, right: RH({ fingers: n4(1) }) });
  assert.equal(out.degree, 0);
  run(tr, 700, 1000, { left: LH({ fingers: n4(2) }), right: RH({ fingers: n4(1) }) });
  out = run(tr, 1033, 1300, { left: LH({}), right: RH({ fingers: n4(1) }) });
  assert.equal(out.degree, 0, "left fist = silence");
  out = run(tr, 1333, 1600, { left: LH({ fingers: n4(2) }), right: RH({}) });
  assert.equal(out.colour, "mute", "right fist = silence");
});
test("a right hand that vanishes for under 100 ms does not cut the chord", () => {
  const tr = new GestureTracker({ aspect: 1 });
  run(tr, 0, 300, { left: LH({ fingers: n4(4) }), right: RH({ fingers: n4(4) }) });
  tr.update(333, { left: LH({ fingers: n4(4) }), right: null });
  const out = run(tr, 366, 399, { left: LH({ fingers: n4(4) }), right: RH({ fingers: n4(4) }) });
  assert.equal(out.colour, "dom7");
});
test("optional beginner help: holds the last colour, then a plain triad at medium volume", () => {
  const tr = new GestureTracker({ aspect: 1, lenientRight: true });
  run(tr, 0, 300, { left: LH({ fingers: n4(3) }), right: RH({ fingers: n4(3) }) });
  let out = run(tr, 333, 500, { left: LH({ fingers: n4(3) }), right: null });
  assert.equal(out.colour, "seventh");
  out = run(tr, 533, 1500, { left: LH({ fingers: n4(3) }), right: null });
  assert.equal(out.colour, "triad");
  assert.equal(out.volume, RULES.lenientVolume);
});
test("one-handed: right hand ignored, colour left to the keys/pad, fixed volume and filter", () => {
  const tr = new GestureTracker({ aspect: 1, oneHanded: true });
  const out = run(tr, 0, 300, { left: LH({ fingers: n4(2) }), right: RH({ fingers: n4(4), oy: 0.1, lean: 0.6 }) });
  assert.equal(out.degree, 2);
  assert.equal(out.colour, null);
  assert.equal(out.octaveDown, false);
  assert.equal(out.volume, RULES.oneHandVolume);
  assert.deepEqual(out.filter, { freq: 1200, q: 0.7 });
  const gone = run(tr, 333, 700, { left: null, right: RH() });
  assert.equal(gone.degree, 0);
});
test("pinch strum is reported once per pinch on the colour hand", () => {
  const pinched = RH({ fingers: n4(1) });
  pinched.lm[4] = { ...pinched.lm[8] }; // thumb tip on index tip
  const tr = new GestureTracker({ aspect: 1 });
  const a = tr.update(0, { left: LH({ fingers: n4(1) }), right: pinched });
  const b = tr.update(33, { left: LH({ fingers: n4(1) }), right: pinched });
  assert.equal(a.strum, true);
  assert.equal(b.strum, false);
});

const near2 = (a, b) => assert.ok(Math.abs(a - b) < 1e-9);
test("volume follows the WRIST by default, linear 0.05 full .. 0.95 silent", () => {
  const w = (y) => wristVolume(hand({ side: "right", oy: y }));
  assert.equal(w(0), 1); assert.equal(w(0.05), 1); assert.equal(w(0.95), 0); assert.equal(w(1), 0);
  assert.ok(Math.abs(w(0.5) - 0.5) < 1e-9);
  const lm = hand({ fingers: [1, 0, 0, 0], side: "right", oy: 0.4 }); // fingertip is far above the wrist
  assert.equal(handVolume(lm), wristVolume(lm), "default source is the wrist");
  assert.equal(handVolume(lm, "bogus"), wristVolume(lm), "unknown source falls back to the wrist");
  assert.ok(Math.abs(handVolume(lm, "index") - fingertipVolume(lm)) < 1e-9);
  assert.notEqual(handVolume(lm, "index"), handVolume(lm, "wrist"));
  near2(volumeFromY(0.5), 0.5);
});
test("tracker: volumeFrom wrist (default) vs index (pointer fingertip)", () => {
  const rh = RH({ fingers: n4(1), oy: 0.8 });
  const lh = LH({ fingers: n4(1) });
  const a = new GestureTracker({ aspect: 1 });
  assert.equal(run(a, 0, 300, { left: lh, right: rh }).volume, wristVolume(rh.lm));
  const b = new GestureTracker({ aspect: 1, volumeFrom: "index" });
  assert.equal(run(b, 0, 300, { left: lh, right: rh }).volume, fingertipVolume(rh.lm));
  assert.notEqual(wristVolume(rh.lm), fingertipVolume(rh.lm));
});
