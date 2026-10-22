// ChordHands music theory. Pure functions, no DOM, unit-tested with node --test.

export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
export const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const DIATONIC = {
  major: ["maj", "min", "min", "maj", "maj", "min", "dim"],
  minor: ["min", "dim", "maj", "min", "min", "maj", "maj"],
};
export const MAJOR_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MINOR_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export const mod = (n, m) => ((n % m) + m) % m;

// ---------- spelling ----------
const ACC = { "-2": "bb", "-1": "b", 0: "", 1: "#", 2: "##" };

export function spell(letterIdx, pc) {
  const diff = mod(pc - NATURAL_PC[letterIdx] + 6, 12) - 6;
  return { letter: LETTERS[letterIdx], letterIdx, acc: diff, name: LETTERS[letterIdx] + (ACC[diff] ?? "") };
}

/** Pretty-print accidentals for display (not for parsing). */
export function pretty(s) {
  return String(s).replace(/##/g, "𝄪").replace(/bb(?=[^a-z]|$)/g, "𝄫").replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭").replace(/^b(?=[IVi])/, "♭");
}

export function noteNameToPc(name) {
  const m = /^([A-Ga-g])([#b♯♭]*)$/.exec(name);
  if (!m) return null;
  let pc = NATURAL_PC[LETTERS.indexOf(m[1].toUpperCase())];
  for (const ch of m[2]) pc += ch === "#" || ch === "♯" ? 1 : -1;
  return mod(pc, 12);
}

// ---------- keys ----------
export function makeKey(rootName, mode = "major") {
  const root = noteNameToPc(rootName);
  if (root == null || !SCALES[mode]) throw new Error("bad key " + rootName + " " + mode);
  return { root, rootName, mode, name: rootName + (mode === "minor" ? "m" : "") };
}
export function keyFromPc(pc, mode = "major") {
  return makeKey((mode === "minor" ? MINOR_ROOTS : MAJOR_ROOTS)[mod(pc, 12)], mode);
}
/** "C", "F#", "Am", "Bbm", "A minor" -> key */
export function parseKey(str) {
  const m = /^([A-Ga-g][#b♯♭]?)\s*(m|min|minor|major|maj)?$/.exec(String(str).trim());
  if (!m) return null;
  const mode = m[2] && m[2].startsWith("m") && m[2] !== "major" && m[2] !== "maj" ? "minor" : "major";
  const name = m[1][0].toUpperCase() + m[1].slice(1).replace("♯", "#").replace("♭", "b");
  try { return makeKey(name, mode); } catch { return null; }
}

export function scaleNotes(key) {
  const rl = LETTERS.indexOf(key.rootName[0]);
  return SCALES[key.mode].map((st, i) => spell((rl + i) % 7, mod(key.root + st, 12)));
}

export function diatonicQuality(key, degree) {
  return DIATONIC[key.mode][degree - 1];
}

/** Quality of a chord on `degree` given harmony mode and flip. */
export function qualityFor(key, degree, { flip = false, harmony = "diatonic", alter = 0 } = {}) {
  let q = harmony === "free" || alter !== 0 ? "maj" : diatonicQuality(key, degree);
  if (flip) q = q === "maj" ? "min" : q === "min" ? "maj" : q === "dim" ? "min" : "maj";
  return q;
}

// ---------- chord construction ----------
const TRIADS = {
  maj: [{ semi: 4, step: 2 }, { semi: 7, step: 4 }],
  min: [{ semi: 3, step: 2 }, { semi: 7, step: 4 }],
  dim: [{ semi: 3, step: 2 }, { semi: 6, step: 4 }],
  aug: [{ semi: 4, step: 2 }, { semi: 8, step: 4 }],
};
const QUAL_SYM = { maj: "", min: "m", dim: "dim", aug: "aug" };

/**
 * buildChord(key, { degree, alter, flip, harmony, quality, ext, inversion })
 * ext: triad | sus2 | sus4 | seventh | dom7 | maj7 | dim7 | add9
 *  - seventh: diatonic 7th in diatonic harmony, else maj7 on major / m7 on minor
 *  - dom7:    adds a flat 7th to whatever the chord is
 */
export function buildChord(key, o = {}) {
  const degree = o.degree;
  const alter = o.alter || 0;
  const ext = o.ext || "triad";
  const harmony = o.harmony || "diatonic";
  const scale = SCALES[key.mode];
  const rootLetter = LETTERS.indexOf(key.rootName[0]);
  const letterIdx = (rootLetter + degree - 1) % 7;
  const rootPc = mod(key.root + scale[degree - 1] + alter, 12);
  const root = spell(letterIdx, rootPc);
  let quality = o.quality || qualityFor(key, degree, { flip: o.flip, harmony, alter });
  if (ext === "dim7") quality = "dim";

  const tones = [{ semi: 0, step: 0 }];
  let third = TRIADS[quality][0];
  let fifth = TRIADS[quality][1];
  if (ext === "sus2") { third = { semi: 2, step: 1 }; fifth = { semi: 7, step: 4 }; }
  if (ext === "sus4") { third = { semi: 5, step: 3 }; fifth = { semi: 7, step: 4 }; }
  tones.push(third, fifth);

  let sev = null;
  if (ext === "seventh") {
    const scaleSeventh = !o.quality && harmony !== "free" && !o.flip && alter === 0;
    if (scaleSeventh) sev = mod(scale[(degree - 1 + 6) % 7] - scale[degree - 1], 12);
    else sev = quality === "min" || quality === "dim" ? 10 : 11;
  } else if (ext === "dom7") sev = 10;
  else if (ext === "maj7") sev = 11;
  else if (ext === "dim7") sev = 9;
  if (sev != null) tones.push({ semi: sev, step: 6 });
  if (ext === "add9") tones.push({ semi: 14, step: 8 });

  const spelled = tones.map((t) => spell((letterIdx + t.step) % 7, mod(rootPc + t.semi, 12)));
  const sus = ext === "sus2" || ext === "sus4";
  const symbol = root.name + symbolSuffix(quality, ext, sev, sus);
  const roman = romanText(degree, alter, quality, ext, sev, sus);
  return {
    degree, alter, quality, ext, sev,
    inversion: o.inversion ?? 0,
    rootPc, rootName: root.name, tones, spelled,
    pcs: tones.map((t) => mod(rootPc + t.semi, 12)),
    noteNames: spelled.map((s) => s.name),
    symbol, roman,
  };
}

function symbolSuffix(quality, ext, sev, sus) {
  if (sus) return (sev != null ? "7" : "") + ext;
  if (ext === "add9") return (quality === "min" ? "m" : "") + "add9";
  if (sev == null) return QUAL_SYM[quality];
  if (quality === "maj") return sev === 11 ? "maj7" : sev === 10 ? "7" : "7";
  if (quality === "min") return sev === 10 ? "m7" : sev === 11 ? "m(maj7)" : "m7";
  if (quality === "dim") return sev === 9 ? "dim7" : sev === 10 ? "m7b5" : "dim7";
  return "aug" + (sev === 11 ? "maj7" : "7");
}

function romanText(degree, alter, quality, ext, sev, sus) {
  let base = ROMAN[degree - 1];
  if (quality === "min" || quality === "dim") base = base.toLowerCase();
  const prefix = alter < 0 ? "b".repeat(-alter) : alter > 0 ? "#".repeat(alter) : "";
  let suf = "";
  if (sus) suf = (sev != null ? "7" : "") + ext;
  else if (ext === "add9") suf = "add9";
  else if (sev != null) {
    if (quality === "dim") suf = sev === 9 ? "°7" : "ø7";
    else suf = sev === 11 ? "maj7" : "7";
  } else if (quality === "dim") suf = "°";
  else if (quality === "aug") suf = "+";
  return prefix + base + suf;
}

/** "V7", "bVII", "vi", "vii°", "Imaj7" ... -> chord in key (null if invalid). */
export function parseRoman(str, key, extra = {}) {
  const m = /^([b#♭♯]*)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|dim|o|ø|aug|\+)?(maj7|7|sus4|sus2|add9)?$/.exec(String(str).trim());
  if (!m) return null;
  const alter = [...m[1]].reduce((a, c) => a + (c === "b" || c === "♭" ? -1 : 1), 0);
  const numeral = m[2];
  const degree = ROMAN.indexOf(numeral.toUpperCase()) + 1;
  const lower = numeral === numeral.toLowerCase();
  let quality = lower ? "min" : "maj";
  const q = m[3];
  if (q === "°" || q === "dim" || q === "o" || q === "ø") quality = "dim";
  if (q === "aug" || q === "+") quality = "aug";
  let ext = m[4] === "7" ? "dom7" : m[4] || "triad";
  if (ext === "dom7" && (q === "°" || q === "dim" || q === "o")) ext = "dim7";
  return buildChord(key, { ...extra, degree, alter, quality, ext });
}

/** What the player has to do to get this chord: degree, flip, accidental, colour. */
export function gestureFor(chord, key, harmony = "diatonic") {
  const base = qualityFor(key, chord.degree, { flip: false, harmony, alter: chord.alter });
  const flip = chord.quality !== base && chord.quality !== "dim";
  let colour = "triad";
  if (chord.ext === "seventh" || chord.ext === "maj7" || (chord.sev != null && chord.ext !== "dom7" && chord.ext !== "dim7")) colour = "seventh";
  if (chord.ext === "dom7" || chord.ext === "dim7") colour = "dom7";
  if (chord.ext === "sus2" || chord.ext === "sus4" || chord.ext === "add9") colour = chord.ext;
  return { degree: chord.degree, flip, alter: chord.alter, colour };
}

// ---------- voicing ----------
export const midiToName = (m) => ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"][mod(m, 12)] + (Math.floor(m / 12) - 1);

/**
 * Voice a chord into C3..~E5 with minimal movement from prevBase (array of midi).
 * inversion: 'auto' | 0 | 1 | 2 | 3. Returns {base, midi, bass, notes:[{midi,name,letter,acc,isRoot}]}.
 */
export function voiceChord(chord, prevBase = null, { inversion = chord.inversion, octaveShift = 0, lo = 48, hi = 76 } = {}) {
  const n = chord.tones.length;
  const invs = inversion === "auto" || inversion == null ? [...Array(Math.min(n, 3)).keys()] : [Math.min(inversion, n - 1)];
  let best = null;
  for (const inv of invs) {
    const order = [...chord.tones.keys()];
    const rot = order.slice(inv).concat(order.slice(0, inv));
    const firstPc = chord.pcs[rot[0]];
    for (let start = lo; start < lo + 24; start++) {
      if (mod(start, 12) !== firstPc) continue;
      const stack = [start];
      for (let i = 1; i < rot.length; i++) {
        const prev = stack[i - 1];
        const d = mod(chord.pcs[rot[i]] - prev, 12) || 12;
        stack.push(prev + d);
      }
      const top = stack[stack.length - 1];
      let cost = 0;
      if (top > hi || stack[0] < lo) cost += 1000 + Math.abs(top - hi);
      if (prevBase && prevBase.length) {
        const a = [...stack].sort((x, y) => x - y);
        const b = [...prevBase].sort((x, y) => x - y);
        const k = Math.min(a.length, b.length);
        for (let i = 0; i < k; i++) cost += Math.abs(a[i] - b[i]);
        cost += Math.abs(a.length - b.length) * 3;
      } else {
        cost += Math.abs(stack.reduce((s, v) => s + v, 0) / stack.length - 62);
      }
      if (inversion === "auto") cost += inv * 0.5;
      if (!best || cost < best.cost) best = { cost, stack, rot, inv };
    }
  }
  const notes = best.stack
    .map((m, i) => ({ midi: m, ...chord.spelled[best.rot[i]], isRoot: best.rot[i] === 0 }))
    .sort((a, b) => a.midi - b.midi);
  const base = notes.map((x) => x.midi);
  const shift = 12 * octaveShift;
  return {
    base,
    midi: base.map((m) => m + shift),
    bass: 36 + chord.rootPc,
    inversionUsed: best.inv,
    notes: notes.map((x) => ({ ...x, midi: x.midi + shift })),
  };
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Names of the 7 chords of a key (diatonic triads) for the pad/labels. */
export function keyChords(key, harmony = "diatonic") {
  return [1, 2, 3, 4, 5, 6, 7].map((degree) => buildChord(key, { degree, harmony }));
}
