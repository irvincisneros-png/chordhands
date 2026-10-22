import test from "node:test";
import assert from "node:assert/strict";
import { parseLyricsText, flattenLyrics, nestLyrics, lyricsForSong, hasLyrics, lyricAtBar, nextLyric, barAtBeat, barProgress, previewPairs, exportPayload, validateImport, barCount } from "../src/lyrics.js";

const song = { id: "x-song", originalKey: "C", beatsPerChord: 4, sections: [{ name: "A", bars: [["I"], ["V", "vi"]] }, { name: "B", bars: [["IV"], ["I"]] }] };

test("parse: one line per bar, pipe splits, blank = none", () => {
  assert.deepEqual(parseLyricsText("line one\nline two | line three\n\nline five", 6), ["line one", "line two", "line three", "", "line five", ""]);
  assert.deepEqual(parseLyricsText("a\r\nb", 3), ["a", "b", ""]);
  assert.deepEqual(parseLyricsText("a\nb\nc\nd", 2), ["a", "b"]);
  assert.deepEqual(parseLyricsText("", 2), ["", ""]);
  assert.deepEqual(parseLyricsText("a\n\n\n"), ["a"]);
});
test("flatten and nest follow the sections", () => {
  assert.equal(barCount(song), 4);
  const flat = ["one", "two", "", "four"];
  assert.deepEqual(nestLyrics(song, flat), [["one", "two"], ["", "four"]]);
  assert.deepEqual(flattenLyrics(nestLyrics(song, flat)), flat);
});
test("lyricsForSong: custom beats built-in; none gives null", () => {
  assert.equal(lyricsForSong(song, {}), null);
  assert.equal(hasLyrics(song, {}), false);
  assert.deepEqual(lyricsForSong(song, { "x-song": "line one\nline two" }), ["line one", "line two", "", ""]);
  const built = { ...song, lyrics: [["b1", "b2"], ["b3", "b4"]] };
  assert.deepEqual(lyricsForSong(built, {}), ["b1", "b2", "b3", "b4"]);
  assert.deepEqual(lyricsForSong(built, { "x-song": "mine" }), ["mine", "", "", ""]);
  assert.equal(hasLyrics(built, {}), true);
});
test("bar index to lyric, next line, progress", () => {
  const flat = ["line one", "", "line three", ""];
  assert.equal(lyricAtBar(flat, 0), "line one");
  assert.equal(lyricAtBar(flat, 1), "");
  assert.equal(lyricAtBar(flat, 9), "");
  assert.equal(nextLyric(flat, 0), "line three");
  assert.equal(nextLyric(flat, 2), "");
  assert.equal(barAtBeat(-2, 4), 0);
  assert.equal(barAtBeat(4, 4), 1);
  assert.equal(barAtBeat(7.9, 4), 1);
  assert.equal(barProgress(-1, 4), 0);
  assert.equal(barProgress(6, 4), 0.5);
});
test("preview pairs each line with its bar's chords", () => {
  const rows = previewPairs(song, "line one\nline two");
  assert.equal(rows.length, 4);
  assert.deepEqual([rows[1].chords, rows[1].lyric, rows[2].lyric], ["V vi", "line two", ""]);
  assert.equal(rows[2].section, "B");
});
test("export then import round trip and validation", () => {
  const payload = exportPayload({ "x-song": "line one", empty: "  " });
  assert.deepEqual(payload.lyrics, { "x-song": "line one" });
  const r = validateImport(JSON.stringify(payload));
  assert.ok(r.ok);
  assert.equal(r.count, 1);
  assert.equal(validateImport(payload, ["other"]).ok, false);
  assert.equal(validateImport("not json").ok, false);
  assert.equal(validateImport({ app: "nope", version: 1, lyrics: {} }).ok, false);
  assert.equal(validateImport({ app: "chordhands-lyrics", version: 2, lyrics: {} }).ok, false);
  assert.equal(validateImport({ app: "chordhands-lyrics", version: 1, lyrics: { "Bad Id!": "line one", ok: 5 } }).ok, false);
});
