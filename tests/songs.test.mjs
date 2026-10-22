import test from "node:test";
import assert from "node:assert/strict";
import { SONGS, isLab } from "../src/songs.js";
import { parseKey, parseRoman, makeKey, MAJOR_ROOTS, MINOR_ROOTS } from "../src/theory.js";
import { buildTimeline, SongRunner, Scorer, PracticeStepper, chordsMatch, easyKey } from "../src/songmode.js";

const ALLOWED = ["id", "title", "artist", "year", "difficulty", "originalKey", "bpm", "beatsPerChord", "sections", "tip"];

test("songs list: enough entries, unique ids, includes Progression Lab", () => {
  assert.ok(SONGS.length >= 3);
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
  assert.ok(SONGS.some(isLab));
});
for (const s of SONGS) {
  test(`song "${s.id}" is valid, parses in ${s.originalKey}, has no lyrics`, () => {
    assert.deepEqual(Object.keys(s).sort(), [...ALLOWED].sort(), "only schema fields (no lyrics field)");
    assert.ok([1, 2, 3].includes(s.difficulty));
    assert.ok(s.bpm >= 40 && s.bpm <= 220);
    assert.ok(s.beatsPerChord >= 2 && s.beatsPerChord <= 6);
    assert.ok(typeof s.tip === "string" && s.tip.length < 400);
    const key = parseKey(s.originalKey);
    assert.ok(key, "key parses");
    assert.ok(s.sections.length > 0);
    for (const sec of s.sections) {
      assert.ok(sec.name && sec.bars.length > 0);
      for (const bar of sec.bars) {
        assert.ok(bar.length >= 1 && bar.length <= 4);
        for (const r of bar) assert.ok(parseRoman(r, key), `chord ${r} in ${s.originalKey}`);
      }
    }
    assert.ok(buildTimeline(s).totalBeats > 0);
    const names = key.mode === "minor" ? MINOR_ROOTS : MAJOR_ROOTS;
    for (const n of names) buildTimeline(s, makeKey(n, key.mode)); // all 12 transpositions
  });
}
test("bars split evenly", () => {
  const tl = buildTimeline({ id: "x", originalKey: "C", beatsPerChord: 4, sections: [{ name: "a", bars: [["I"], ["V", "vi"]] }] });
  assert.deepEqual(tl.events.map((e) => [e.start, e.dur]), [[0, 4], [4, 2], [6, 2]]);
  assert.equal(tl.totalBeats, 8);
});
test("lab songs include blues and ii-V-I", () => {
  const labs = SONGS.filter(isLab).map((s) => s.id).join(" ");
  assert.match(labs, /blues/);
  assert.match(labs, /two-five-one/);
});
test("easyKey picks C or G", () => {
  assert.ok(["C", "G"].includes(easyKey({ originalKey: "Ab" }).rootName));
  assert.equal(easyKey({ originalKey: "D" }).rootName, "C");
});

const C = makeKey("C");
const mk = (r) => parseRoman(r, C);
test("runner: count-in, tempo, speed, loop", () => {
  const tl = buildTimeline({ id: "x", originalKey: "C", bpm: 120, beatsPerChord: 4, sections: [{ name: "a", bars: [["I"], ["V"]] }, { name: "b", bars: [["vi"], ["IV"]] }] });
  const r = new SongRunner(tl, { bpm: 120, speed: 1, countIn: 4 });
  r.start(10);
  assert.equal(r.state(10).counting, true);
  assert.equal(r.state(10).beat, -4);
  assert.equal(r.state(12).beat, 0);
  assert.equal(r.state(12).counting, false);
  assert.equal(r.state(13).beat, 2);
  r.setSpeed(0.5, 13);
  assert.ok(Math.abs(r.state(14).beat - 3) < 1e-9);
  assert.equal(r.state(100).done, true);
  const loop = new SongRunner(tl, { bpm: 120, countIn: 4, loop: { start: 8, end: 16 } });
  loop.start(0);
  assert.equal(loop.state(2).beat, 8);
  assert.equal(loop.state(2 + 4).beat, 8 + 8 - 8 + 0, "wraps back to loop start after 8 beats");
  assert.equal(loop.state(2 + 5).pass, 1);
});
test("scorer: on time / late / miss, accuracy, stars", () => {
  const tl = buildTimeline({ id: "x", originalKey: "C", bpm: 100, beatsPerChord: 4, sections: [{ name: "a", bars: [["I"], ["V"], ["vi"], ["IV"]] }] });
  const sc = new Scorer(tl.events);
  sc.update(0.1, 0, mk("I"));
  sc.update(4.1, 0, mk("I"));
  sc.update(7.0, 0, mk("V"));
  sc.update(12.1, 0, mk("ii"));
  sc.finish(0);
  const res = sc.result();
  assert.equal(res.ok, 1);
  assert.equal(res.late, 1);
  assert.equal(res.miss, 2);
  assert.equal(res.accuracy, Math.round(((1 + 0.6) / 4) * 100));
  assert.equal(res.stars, 1);
  const perfect = new Scorer(tl.events);
  [[0, "I"], [4, "V"], [8, "vi"], [12, "IV"]].forEach(([b, r]) => perfect.update(b + 0.1, 0, mk(r)));
  perfect.update(16.5, 0, null);
  assert.equal(perfect.stars, 3);
  assert.equal(perfect.bestStreak, 4);
});
test("scorer credits a correct chord played slightly early", () => {
  const tl = buildTimeline({ id: "x", originalKey: "C", bpm: 100, beatsPerChord: 4, sections: [{ name: "a", bars: [["I"], ["V"]] }] });
  const sc = new Scorer(tl.events);
  sc.update(3.8, 0, mk("V"));
  assert.equal(sc.counts.ok, 1);
});
test("practice stepper waits for the right chord", () => {
  const tl = buildTimeline({ id: "x", originalKey: "C", bpm: 100, beatsPerChord: 4, sections: [{ name: "a", bars: [["I"], ["I"], ["V"]] }] });
  const p = new PracticeStepper(tl.events);
  assert.equal(p.update(0, mk("V")).advanced, false);
  p.update(100, mk("I"));
  assert.equal(p.update(400, mk("I")).advanced, true);
  assert.equal(p.index, 1);
  assert.equal(p.update(500, mk("I")).advanced, false, "same chord is locked until released");
  p.update(600, null);
  p.update(700, mk("I"));
  assert.equal(p.update(1000, mk("I")).advanced, true);
  p.update(1100, mk("V"));
  assert.equal(p.update(1400, mk("V")).done, true);
});
test("chordsMatch: quality matters, and a 7th target needs its 7th", () => {
  assert.ok(!chordsMatch(mk("V"), mk("V7")));
  assert.ok(chordsMatch(mk("V7"), mk("V7")));
  assert.ok(!chordsMatch(mk("iv"), mk("IV")));
  assert.ok(!chordsMatch(null, mk("I")));
});
