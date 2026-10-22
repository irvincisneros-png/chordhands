// Song tutorials: timeline building, tempo clock, matching and scoring. Pure logic, no DOM.
// Songs hold chord progressions only (never lyrics).
import { parseRoman, parseKey, keyFromPc } from "./theory.js";

/** Key to use for a song: override (a key object) or the song's originalKey. */
export function songKey(song, keyOverride = null) {
  return keyOverride || parseKey(song.originalKey);
}

/** "Easy key" = nearest of C / G (major) or Am / Em (minor). */
export function easyKey(song) {
  const k = parseKey(song.originalKey);
  const cands = k.mode === "minor" ? [9, 4] : [0, 7];
  const dist = (a, b) => Math.min((a - b + 12) % 12, (b - a + 12) % 12);
  const pc = cands.sort((a, b) => dist(a, k.root) - dist(b, k.root))[0];
  return keyFromPc(pc, k.mode);
}

/**
 * Flatten a song to chord events. Bar length = beatsPerChord beats; a bar with N chords splits evenly.
 * Returns {events:[{index, section, sectionIndex, bar, start, dur, roman, chord}], totalBeats, sections:[{name,start,end}]}
 */
export function buildTimeline(song, key = null) {
  const k = songKey(song, key);
  const barLen = song.beatsPerChord;
  const events = [];
  const sections = [];
  let beat = 0;
  let bar = 0;
  song.sections.forEach((sec, si) => {
    const sStart = beat;
    for (const chords of sec.bars) {
      const dur = barLen / chords.length;
      chords.forEach((r) => {
        const chord = parseRoman(r, k, { inversion: "auto" });
        if (!chord) throw new Error(`Bad chord "${r}" in ${song.id}`);
        events.push({ index: events.length, section: sec.name, sectionIndex: si, bar, start: beat, dur, roman: r, chord });
        beat += dur;
      });
      bar++;
    }
    sections.push({ name: sec.name, start: sStart, end: beat });
  });
  return { events, totalBeats: beat, sections, barLen, key: k };
}

/** Does the chord the player is sounding satisfy the target? (lenient on extensions) */
export function chordsMatch(player, target) {
  if (!player || !target) return false;
  if (player.rootPc !== target.rootPc) return false;
  if (target.ext === "sus2" || target.ext === "sus4") return true;
  return player.quality === target.quality;
}

// ---------------- tempo clock ----------------
export class SongRunner {
  /** timeline from buildTimeline; opts: {bpm, speed, countIn, loop:{start,end}|null} */
  constructor(timeline, { bpm, speed = 1, countIn = 4, loop = null } = {}) {
    this.tl = timeline;
    this.bpm = bpm;
    this.speed = speed;
    this.countIn = countIn;
    this.loop = loop;
    this.anchorTime = 0;
    this.anchorBeat = 0;
    this.started = false;
  }
  get spb() { return 60 / (this.bpm * this.speed); }
  get startBeat() { return this.loop ? this.loop.start : 0; }
  /** t0 = clock time at which the count-in begins. */
  start(t0) {
    this.anchorTime = t0;
    this.anchorBeat = this.startBeat - this.countIn;
    this.started = true;
  }
  setSpeed(s, t) {
    this.anchorBeat += (t - this.anchorTime) / this.spb;
    this.anchorTime = t;
    this.speed = s;
  }
  rawBeat(t) { return this.anchorBeat + (t - this.anchorTime) / this.spb; }
  /** {beat, pass, counting, done} */
  state(t) {
    const raw = this.rawBeat(t);
    if (raw < this.startBeat) return { beat: raw, pass: 0, counting: true, done: false };
    if (this.loop) {
      const len = this.loop.end - this.loop.start;
      const rel = raw - this.loop.start;
      return { beat: this.loop.start + (rel % len), pass: Math.floor(rel / len), counting: false, done: false };
    }
    return { beat: raw, pass: 0, counting: false, done: raw >= this.tl.totalBeats };
  }
  eventIndexAt(beat) {
    const ev = this.tl.events;
    let idx = -1;
    for (let i = 0; i < ev.length; i++) if (ev[i].start <= beat + 1e-9) idx = i; else break;
    return idx;
  }
  /** events inside the loop range (or all) */
  activeEvents() {
    if (!this.loop) return this.tl.events;
    return this.tl.events.filter((e) => e.start >= this.loop.start - 1e-9 && e.start < this.loop.end - 1e-9);
  }
}

// ---------------- play-along scoring ----------------
export const ON_TIME_BEATS = 0.5; // match within this many beats after the chord starts = on time
export const EARLY_BEATS = 0.25;  // a correct chord this early still counts for the upcoming one

export class Scorer {
  constructor(events) {
    this.events = events;
    this.rec = new Map(); // `${pass}:${i}` -> 'ok' | 'late' | 'miss'
    this.ratings = []; // chronological ratings for streak
    this.counts = { ok: 0, late: 0, miss: 0 };
    this.streak = 0;
    this.bestStreak = 0;
    this.lastPass = 0;
    this.lastRatingEvent = null; // for UI feedback
  }
  _commit(key, r, evIndex) {
    if (this.rec.has(key)) return;
    this.rec.set(key, r);
    this.counts[r]++;
    if (r === "miss") this.streak = 0;
    else { this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); }
    this.lastRatingEvent = { rating: r, index: evIndex };
  }
  /** beat: position in song (absolute beat); pass: loop pass number; chord: what the player sounds. */
  update(beat, pass, chord) {
    const ev = this.events;
    if (!ev.length) return;
    // finalise events that are over (previous passes entirely, or earlier in this one)
    for (let p = this.lastPass; p <= pass; p++) {
      for (let i = 0; i < ev.length; i++) {
        const over = p < pass || ev[i].start + ev[i].dur <= beat;
        if (over) this._commit(`${p}:${i}`, "miss", ev[i].index);
      }
    }
    this.lastPass = pass;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i], key = `${pass}:${i}`;
      if (this.rec.has(key)) continue;
      if (beat >= e.start - EARLY_BEATS && beat < e.start + e.dur && chordsMatch(chord, e.chord)) {
        this._commit(key, beat <= e.start + ON_TIME_BEATS ? "ok" : "late", e.index);
      }
    }
  }
  /** Call when the song ends so unplayed chords count as misses. */
  finish(pass = 0) {
    this.events.forEach((e, i) => this._commit(`${pass}:${i}`, "miss", e.index));
  }
  get total() { return this.counts.ok + this.counts.late + this.counts.miss; }
  get accuracy() { return this.total ? (this.counts.ok + 0.6 * this.counts.late) / this.total : 0; }
  get stars() { const a = this.accuracy; return a >= 0.9 ? 3 : a >= 0.7 ? 2 : 1; }
  result() {
    return { accuracy: Math.round(this.accuracy * 100), stars: this.stars, bestStreak: this.bestStreak, ...this.counts, total: this.total };
  }
}

// ---------------- practice mode: waits for the right chord ----------------
export class PracticeStepper {
  constructor(events, { holdMs = 220, lockMs = 600 } = {}) {
    this.events = events;
    this.holdMs = holdMs;
    this.lockMs = lockMs;
    this.index = 0;
    this.since = null;
    this.lock = null; // {chord, until}
    this.misses = 0;
  }
  get done() { return this.index >= this.events.length; }
  get target() { return this.events[this.index] || null; }
  update(t, chord) {
    if (this.done) return { advanced: false, done: true };
    if (this.lock) {
      if (t > this.lock.until || !chordsMatch(chord, this.lock.chord)) this.lock = null;
      else { this.since = null; return { advanced: false, done: false }; }
    }
    if (chordsMatch(chord, this.target.chord)) {
      if (this.since == null) this.since = t;
      if (t - this.since >= this.holdMs) {
        const just = this.target.chord;
        this.index++;
        this.since = null;
        this.lock = { chord: just, until: t + this.lockMs };
        return { advanced: true, done: this.done };
      }
    } else this.since = null;
    return { advanced: false, done: false, holdProgress: this.since == null ? 0 : Math.min(1, (t - this.since) / this.holdMs) };
  }
}
