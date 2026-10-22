import test from "node:test";
import assert from "node:assert/strict";
import { makeKey, buildChord, parseRoman, parseKey, voiceChord, scaleNotes, keyFromPc, gestureFor, keyChords, qualityFor } from "../src/theory.js";

const C = makeKey("C");
const Am = makeKey("A", "minor");

test("diatonic triads in C major", () => {
  assert.deepEqual(keyChords(C).map((c) => c.symbol), ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]);
  assert.deepEqual(keyChords(C).map((c) => c.roman), ["I", "ii", "iii", "IV", "V", "vi", "vii°"]);
});
test("diatonic triads in A minor", () => {
  assert.deepEqual(keyChords(Am).map((c) => c.symbol), ["Am", "Bdim", "C", "Dm", "Em", "F", "G"]);
});
test("free harmony makes every degree major", () => {
  assert.deepEqual(keyChords(C, "free").map((c) => c.symbol), ["C", "D", "E", "F", "G", "A", "B"]);
});
test("flip toggles major/minor, dim -> min", () => {
  assert.equal(buildChord(C, { degree: 4, flip: true }).symbol, "Fm");
  assert.equal(buildChord(C, { degree: 2, flip: true }).symbol, "D");
  assert.equal(buildChord(C, { degree: 7, flip: true }).symbol, "Bm");
  assert.equal(buildChord(C, { degree: 4, flip: true }).roman, "iv");
  assert.equal(qualityFor(C, 6, { flip: true }), "maj");
});
test("extensions: sus, 7ths, add9", () => {
  const n = (o) => buildChord(C, o).noteNames.join(" ");
  assert.equal(n({ degree: 1, ext: "sus2" }), "C D G");
  assert.equal(n({ degree: 1, ext: "sus4" }), "C F G");
  assert.equal(buildChord(C, { degree: 1, ext: "seventh" }).symbol, "Cmaj7");
  assert.equal(buildChord(C, { degree: 4, ext: "seventh" }).symbol, "Fmaj7");
  assert.equal(buildChord(C, { degree: 5, ext: "seventh" }).symbol, "G7");
  assert.equal(buildChord(C, { degree: 2, ext: "seventh" }).symbol, "Dm7");
  assert.equal(buildChord(C, { degree: 7, ext: "seventh" }).symbol, "Bm7b5");
  assert.equal(buildChord(C, { degree: 1, ext: "dom7" }).symbol, "C7");
  assert.equal(buildChord(C, { degree: 2, ext: "dim7" }).symbol, "Ddim7");
  assert.equal(n({ degree: 1, ext: "add9" }), "C E G D");
  assert.equal(buildChord(C, { degree: 4, flip: true, ext: "seventh" }).symbol, "Fm7");
});
test("note spelling uses correct accidentals per key", () => {
  assert.deepEqual(scaleNotes(makeKey("F#")).map((x) => x.name), ["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
  assert.deepEqual(scaleNotes(makeKey("Bb")).map((x) => x.name), ["Bb", "C", "D", "Eb", "F", "G", "A"]);
  assert.equal(buildChord(makeKey("F"), { degree: 7 }).symbol, "Edim");
  assert.equal(buildChord(makeKey("Db"), { degree: 4 }).symbol, "Gb");
  assert.deepEqual(buildChord(makeKey("D"), { degree: 5 }).noteNames, ["A", "C#", "E"]);
});
test("parseRoman", () => {
  const p = (r, k = C) => parseRoman(r, k);
  assert.equal(p("V7").symbol, "G7");
  assert.equal(p("bVII").symbol, "Bb");
  assert.equal(p("bVII").roman, "bVII");
  assert.equal(p("vi").symbol, "Am");
  assert.equal(p("vii°").symbol, "Bdim");
  assert.equal(p("viidim").symbol, "Bdim");
  assert.equal(p("Imaj7").symbol, "Cmaj7");
  assert.equal(p("ii7").symbol, "Dm7");
  assert.equal(p("I7").symbol, "C7");
  assert.equal(p("IV7").symbol, "F7");
  assert.equal(p("Vsus4").symbol, "Gsus4");
  assert.equal(p("Iadd9").symbol, "Cadd9");
  assert.equal(p("#iv°").symbol, "F#dim");
  assert.equal(p("V", makeKey("D")).symbol, "A");
  assert.equal(p("iv", Am).symbol, "Dm");
  assert.equal(p("nonsense"), null);
});
test("roman <-> symbol round trip", () => {
  for (const r of ["I", "ii", "iii", "IV", "V", "vi", "vii°", "V7", "ii7", "Imaj7", "bVII", "IVsus2", "Iadd9", "I7"]) {
    assert.equal(parseRoman(r, C).roman, r, r);
  }
});
test("parseKey", () => {
  assert.equal(parseKey("Am").mode, "minor");
  assert.equal(parseKey("Db").root, 1);
  assert.equal(parseKey("F#m").name, "F#m");
  assert.equal(keyFromPc(3).rootName, "Eb");
  assert.equal(parseKey("H"), null);
});
test("voice leading keeps notes in range and moves little", () => {
  let prev = null, total = 0, count = 0;
  for (const d of [1, 5, 6, 4, 1, 5, 6, 4]) {
    const c = buildChord(C, { degree: d });
    const v = voiceChord(c, prev, { inversion: "auto" });
    assert.ok(v.midi.every((m) => m >= 48 && m <= 76), v.midi.join());
    assert.equal(v.bass, 36 + c.rootPc);
    if (prev) { const p = [...prev].sort((a, b) => a - b); total += v.base.reduce((s, m, i) => s + Math.abs(m - p[i]), 0); count++; }
    prev = v.base;
  }
  assert.ok(total / count <= 6, "avg movement " + total / count);
});
test("voicing respects inversion and octave shift", () => {
  const c = buildChord(C, { degree: 1 });
  const root = voiceChord(c, null, { inversion: 0 });
  const first = voiceChord(c, null, { inversion: 1 });
  assert.equal(root.base[0] % 12, 0);
  assert.equal(first.base[0] % 12, 4);
  const down = voiceChord(c, null, { inversion: 0, octaveShift: -1 });
  assert.deepEqual(down.midi, root.midi.map((m) => m - 12));
  assert.ok(root.notes.find((n) => n.isRoot));
});
test("gestureFor tells how to play a chord", () => {
  const g = (r) => gestureFor(parseRoman(r, C), C);
  assert.deepEqual(g("IV"), { degree: 4, flip: false, alter: 0, colour: "triad" });
  assert.equal(g("iv").flip, true);
  assert.equal(g("V7").colour, "dom7");
  assert.equal(g("bVII").alter, -1);
  assert.equal(g("ii").flip, false);
});
