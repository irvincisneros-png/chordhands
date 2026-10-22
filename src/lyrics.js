// Lyrics helpers: pure, DOM-free. Built-in lyrics exist only for public-domain songs; teachers can paste their own.
// A song's lyrics are an array parallel to its sections, each an array parallel to that section's bars (strings, may be empty).

export const EXPORT_APP = "chordhands-lyrics";
export const MAX_TEXT = 20000;

/** Number of bars in a song (all sections). */
export const barCount = (song) => song.sections.reduce((n, s) => n + s.bars.length, 0);

/** Pasted text -> one string per bar. One line per bar; "|" splits a line across bars; a blank line = no lyric for that bar. */
export function parseLyricsText(text, bars) {
  const lines = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const out = [];
  for (const line of lines) for (const part of line.split("|")) out.push(part.trim());
  if (bars != null) { out.length = Math.min(out.length, bars); while (out.length < bars) out.push(""); }
  return out;
}

/** Per-section nested array -> flat per-bar array. */
export function flattenLyrics(nested) { return (nested || []).flat().map((x) => String(x || "")); }

/** Flat per-bar array -> nested to match the song's sections. */
export function nestLyrics(song, flat) {
  let i = 0;
  return song.sections.map((s) => s.bars.map(() => String(flat[i++] || "")));
}

/** Lyrics in use for a song: a teacher's pasted text wins, else built-in. Returns a flat per-bar array or null. */
export function lyricsForSong(song, custom = {}) {
  const text = custom && custom[song.id];
  if (typeof text === "string" && text.trim()) return parseLyricsText(text, barCount(song));
  if (Array.isArray(song.lyrics)) return flattenLyrics(song.lyrics);
  return null;
}
export const hasLyrics = (song, custom) => { const l = lyricsForSong(song, custom); return !!l && l.some((x) => x.trim()); };

/** Lyric for a bar index (empty string when none). */
export const lyricAtBar = (flat, bar) => (flat && flat[bar]) || "";

/** The next non-empty lyric after `bar` (within `look` bars), or "". */
export function nextLyric(flat, bar, look = 4) {
  if (!flat) return "";
  for (let i = bar + 1; i <= bar + look && i < flat.length; i++) if (flat[i] && flat[i].trim()) return flat[i];
  return "";
}

/** Bar index for a beat (clamped at 0 during the count-in). */
export const barAtBeat = (beat, barLen) => Math.max(0, Math.floor((beat + 1e-9) / barLen));
/** 0..1 progress through the bar the beat is in (0 during the count-in). */
export function barProgress(beat, barLen) {
  if (beat < 0) return 0;
  const p = (beat % barLen) / barLen;
  return Math.min(1, Math.max(0, p));
}

/** Live preview rows: each bar's chords next to its lyric. */
export function previewPairs(song, text) {
  const flat = parseLyricsText(text, barCount(song));
  const rows = [];
  let i = 0;
  for (const s of song.sections) for (const b of s.bars) { rows.push({ bar: i + 1, section: s.name, chords: b.join(" "), lyric: flat[i] }); i++; }
  return rows;
}

/** Export payload for all custom lyrics ({songId: text}). */
export function exportPayload(custom) {
  const lyrics = {};
  for (const [id, t] of Object.entries(custom || {})) if (typeof t === "string" && t.trim()) lyrics[id] = t;
  return { app: EXPORT_APP, version: 1, lyrics };
}

/** Validate imported JSON (object or string). Returns {ok, lyrics, count, error}. Unknown song ids are kept only when knownIds is not given. */
export function validateImport(data, knownIds = null) {
  let obj = data;
  if (typeof data === "string") { try { obj = JSON.parse(data); } catch { return { ok: false, error: "That file is not valid JSON." }; } }
  if (!obj || typeof obj !== "object" || obj.app !== EXPORT_APP) return { ok: false, error: "That is not a ChordHands lyrics file." };
  if (obj.version !== 1) return { ok: false, error: "Unsupported lyrics file version." };
  if (!obj.lyrics || typeof obj.lyrics !== "object" || Array.isArray(obj.lyrics)) return { ok: false, error: "The file has no lyrics." };
  const lyrics = {};
  for (const [id, t] of Object.entries(obj.lyrics)) {
    if (!/^[a-z0-9-]{1,60}$/.test(id) || typeof t !== "string" || t.length > MAX_TEXT) continue;
    if (knownIds && !knownIds.includes(id)) continue;
    if (t.trim()) lyrics[id] = t;
  }
  const count = Object.keys(lyrics).length;
  return count ? { ok: true, lyrics, count } : { ok: false, error: "No usable lyrics found in that file." };
}
