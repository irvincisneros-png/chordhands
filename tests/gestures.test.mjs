import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHand, classifyLeft, classifyRight, assignHands, Stabilizer, GestureTracker, nextFlip, outwardTilt, heightToVolume } from "../src/gestures.js";

// Synthetic upright hand (image coords, y down). Wrist at (ox,oy), palm length ~0.2.
function hand({ fingers = [0, 0, 0, 0], thumb = 0, ox = 0.5, oy = 0.8, lean = 0 }) {
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
  if (thumb) { set(3, 0.12, -0.14); set(4, 0.17, -0.18); } else { set(3, 0.03, -0.14); set(4, 0.0, -0.17); }
  return lm;
}
const n4 = (n) => [0, 1, 2, 3].map((i) => (i < n ? 1 : 0));
const left = (n, thumb = 0) => classifyLeft(analyzeHand(hand({ fingers: n4(n), thumb })));

test("count fingers 1-4 and open palm = degrees I-V", () => {
  assert.equal(left(1), 1);
  assert.equal(left(2), 2);
  assert.equal(left(3), 3);
  assert.equal(left(4), 4);
  assert.equal(left(4, 1), 5);
});
test("index+pinky = VI, plus thumb = VII, fist = silence", () => {
  assert.equal(classifyLeft(analyzeHand(hand({ fingers: [1, 0, 0, 1] }))), 6);
  assert.equal(classifyLeft(analyzeHand(hand({ fingers: [1, 0, 0, 1], thumb: 1 }))), 7);
  assert.equal(classifyLeft(analyzeHand(hand({}))), 0);
  assert.equal(classifyLeft(analyzeHand(hand({ fingers: [0, 1, 0, 0] }))), null);
});
test("right hand colours and thumb octave", () => {
  const r = (n, t = 0) => classifyRight(analyzeHand(hand({ fingers: n4(n), thumb: t })));
  assert.equal(r(0).colour, "mute");
  assert.equal(r(1).colour, "triad");
  assert.equal(r(2).colour, "inv1");
  assert.equal(r(3).colour, "seventh");
  assert.equal(r(4).colour, "dom7");
  assert.equal(r(1, 1).octaveDown, true);
  assert.equal(r(1, 0).octaveDown, false);
});
test("works when hand is rotated (distance based)", () => {
  const lm = hand({ fingers: [1, 1, 0, 0] });
  const a = 1.2;
  const rot = lm.map((p) => { const dx = p.x - 0.5, dy = p.y - 0.8; return { x: 0.5 + dx * Math.cos(a) - dy * Math.sin(a), y: 0.8 + dx * Math.sin(a) + dy * Math.cos(a), z: 0 }; });
  assert.equal(classifyLeft(analyzeHand(rot)), 2);
});
test("handedness: raw-frame 'Right' label is the user's LEFT hand", () => {
  const h = (label, x) => ({ label, score: 0.9, landmarks: hand({ ox: x }) });
  let r = assignHands([h("Right", 0.7)]);
  assert.ok(r.left && !r.right, "label Right on a raw frame = user's left");
  assert.equal(r.left.physical, "left");
  r = assignHands([h("Left", 0.3)]);
  assert.ok(r.right && !r.left);
  r = assignHands([h("Right", 0.7), h("Left", 0.3)]);
  assert.ok(r.left.meanX > r.right.meanX, "user's left hand appears on the image's right in a raw frame");
});
test("swap hands setting exchanges roles", () => {
  const hs = [{ label: "Right", score: 0.9, landmarks: hand({ ox: 0.7 }) }];
  assert.ok(assignHands(hs, { swap: true }).right);
  assert.equal(assignHands(hs, { swap: true }).left, null);
});
test("duplicate labels fall back to x position", () => {
  const hs = [{ label: "Left", score: 0.9, landmarks: hand({ ox: 0.25 }) }, { label: "Left", score: 0.8, landmarks: hand({ ox: 0.75 }) }];
  const r = assignHands(hs);
  assert.ok(r.left.meanX > 0.5 && r.right.meanX < 0.5);
});
test("one-handed mode uses the only hand as chord hand", () => {
  const r = assignHands([{ label: "Left", score: 1, landmarks: hand({}) }], { oneHanded: true });
  assert.ok(r.left && !r.right);
});
test("tilt direction depends on physical hand; flip has hysteresis", () => {
  assert.equal(outwardTilt(30, "left"), 30);
  assert.equal(outwardTilt(30, "right"), -30);
  assert.equal(nextFlip(false, 20), false);
  assert.equal(nextFlip(false, 30), true);
  assert.equal(nextFlip(true, 20), true);
  assert.equal(nextFlip(true, 10), false);
  const upright = analyzeHand(hand({ fingers: [1, 0, 0, 0] }));
  assert.ok(Math.abs(upright.tilt) < 5);
  const leaning = analyzeHand(hand({ fingers: [1, 0, 0, 0], lean: 0.6 }));
  assert.ok(leaning.tilt > 20, "tilt " + leaning.tilt);
});
test("height maps to volume (top = loud)", () => {
  assert.ok(heightToVolume(0.1) > heightToVolume(0.5));
  assert.ok(heightToVolume(0.5) > heightToVolume(0.9));
});
test("stabilizer: needs a hold, bridges dropouts", () => {
  const s = new Stabilizer({ holdMs: 110, dropMs: 150 });
  assert.equal(s.update(0, "3").stable, "none");
  assert.equal(s.update(60, "3").stable, "none");
  assert.equal(s.update(120, "3").stable, "3");
  assert.equal(s.update(140, "4").stable, "3");
  assert.equal(s.update(170, "3").stable, "3");
  assert.equal(s.update(200, null).stable, "3");
  assert.equal(s.update(300, null).stable, "3");
  assert.equal(s.update(500, null).candidate, "none");
  assert.equal(s.update(620, null).stable, "none");
  assert.equal(s.update(700, "2").stable, "none");
  assert.equal(s.update(820, "2").stable, "2");
  assert.equal(s.update(900, "unknown").stable, "2");
});
test("tracker end-to-end: degree, colour, absent right hand fallback", () => {
  const tr = new GestureTracker({ aspect: 1 });
  const L = (n, t = 0) => ({ lm: hand({ fingers: n4(n), thumb: t, ox: 0.7, oy: 0.6 }), physical: "left" });
  const R = (n) => ({ lm: hand({ fingers: n4(n), ox: 0.3, oy: 0.6 }), physical: "right" });
  let out;
  for (let t = 0; t <= 300; t += 33) out = tr.update(t, { left: L(3), right: R(3) });
  assert.equal(out.degree, 3);
  assert.equal(out.colour, "seventh");
  for (let t = 333; t <= 600; t += 33) out = tr.update(t, { left: L(3), right: null });
  assert.equal(out.colour, "seventh", "last colour is held briefly");
  for (let t = 633; t <= 1200; t += 33) out = tr.update(t, { left: L(3), right: null });
  assert.equal(out.colour, "triad");
  assert.equal(out.volume, 0.6);
  const tr2 = new GestureTracker({ aspect: 1, rightSilent: true });
  for (let t = 0; t <= 400; t += 33) out = tr2.update(t, { left: L(1), right: null });
  assert.equal(out.colour, "mute");
  for (let t = 0; t <= 300; t += 33) out = tr.update(2000 + t, { left: L(0), right: R(1) });
  assert.equal(out.degree, 0, "fist = silence");
  const tr3 = new GestureTracker({ aspect: 1, oneHanded: true });
  for (let t = 0; t <= 300; t += 33) out = tr3.update(t, { left: L(2), right: null });
  assert.equal(out.degree, 2);
  assert.equal(out.colour, null);
});
