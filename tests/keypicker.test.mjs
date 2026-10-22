import test from "node:test";
import assert from "node:assert/strict";
import { GRID_LABELS, rootName, keyLabel, stepKeyRoot, gridMove } from "../src/keypicker.js";

test("stepKeyRoot wraps both ways", () => {
  assert.equal(stepKeyRoot(11, 1), 0);
  assert.equal(stepKeyRoot(0, -1), 11);
  assert.equal(stepKeyRoot(3, 1), 4);
  assert.equal(stepKeyRoot(5, -12), 5);
});
test("spelling", () => {
  assert.equal(GRID_LABELS.major.length, 12);
  assert.equal(GRID_LABELS.minor.length, 12);
  assert.equal(rootName(3, "major"), "E♭");
  assert.equal(keyLabel(3, "major"), "E♭ major");
  assert.equal(keyLabel(1, "minor"), "C♯ minor");
  assert.equal(keyLabel(6, "major"), "F♯ major");
  assert.equal(keyLabel(0, "weird"), "C major");
});
test("gridMove navigates 4x3 with wrap", () => {
  assert.equal(gridMove(0, "ArrowRight"), 1);
  assert.equal(gridMove(3, "ArrowRight"), 0);
  assert.equal(gridMove(0, "ArrowLeft"), 3);
  assert.equal(gridMove(0, "ArrowDown"), 4);
  assert.equal(gridMove(9, "ArrowDown"), 1);
  assert.equal(gridMove(1, "ArrowUp"), 9);
  assert.equal(gridMove(5, "Home"), 0);
  assert.equal(gridMove(5, "End"), 11);
  assert.equal(gridMove(5, "x"), 5);
});
