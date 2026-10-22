// Gesture classification from MediaPipe hand landmarks. Pure logic, no DOM.
//
// The "Classic" control scheme: every rule and number here is documented in docs/ORIGINAL-CONTROLS.md.
// Landmarks are the RAW (un-mirrored) camera frame, normalised 0..1, y grows DOWNWARD. The on-screen video
// is mirrored with CSS, so a hand that leans to the screen's right leans to the raw frame's LEFT.
//
// HANDEDNESS: the hand MediaPipe labels "Left" is the chord hand, "Right" is the colour hand (use the
// "swap hands" setting if a device labels them the other way round). The label also picks which way the
// thumb test points, because a left and a right hand extend their thumbs in opposite directions.

export const LM = { WRIST: 0, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4, INDEX_MCP: 5, MIDDLE_MCP: 9, RING_MCP: 13, PINKY_MCP: 17 };
const FINGERS = [
  { name: "index", pip: 6, tip: 8 },
  { name: "middle", pip: 10, tip: 12 },
  { name: "ring", pip: 14, tip: 16 },
  { name: "pinky", pip: 18, tip: 20 },
];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Every tunable number of the Classic scheme in one place. */
export const RULES = {
  debounceMs: 100, // a new shape must hold this long before the chord changes
  bridgeMs: 50, // a lost hand is treated as still present this long
  tiltBand: 0.12, // wrist-offset (raw x) that counts as a full tilt
  raiseAboveY: 0.5, // lowest point of the chord hand above this line -> raise
  lowerFromY: 0.8, // lowest point of the chord hand at/below this line -> lower
  volTop: 0.05, // wrist y at (or above) this is full volume
  volBottom: 0.95, // wrist y at (or below) this is silent
  filter: { neutralHz: 1200, neutralQ: 0.7, darkHz: 250, brightHz: 5000, darkQAdd: 1.5, brightQAdd: 4.5 },
  oneHandVolume: 0.5, // fixed level when the colour hand is not used
  lenientHoldMs: 550, // only for the optional "beginner help" setting
  lenientVolume: 0.6,
  pinchRatio: 0.3, // pinch (strum) = thumb tip to index tip under this fraction of palm length
};

function dist(a, b, aspect = 1) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

// ---------------- single-hand features ----------------

/** Finger "extended": its tip is higher on screen (smaller y) than its middle joint. */
export function fingerUp(lm, i) {
  const f = FINGERS[i];
  return lm[f.tip].y < lm[f.pip].y;
}
/** Thumb "out": tip sits sideways of its joint; the direction depends on which hand it is. */
export function thumbOut(lm, side) {
  const tip = lm[LM.THUMB_TIP], ip = lm[LM.THUMB_IP];
  return String(side).toLowerCase() === "right" ? tip.x > ip.x : tip.x < ip.x;
}
/**
 * Tilt in -1..1, positive = fingertips lean INWARD (toward the middle of the screen / your body),
 * negative = OUTWARD. Zero while the wrist is still between the knuckles of the middle and ring fingers.
 */
export function tiltAmount(lm, side) {
  const wx = lm[LM.WRIST].x;
  const a = Math.min(lm[LM.MIDDLE_MCP].x, lm[LM.RING_MCP].x);
  const b = Math.max(lm[LM.MIDDLE_MCP].x, lm[LM.RING_MCP].x);
  let s = wx < a ? (wx - a) / RULES.tiltBand : wx > b ? (wx - b) / RULES.tiltBand : 0;
  s = clamp(s, -1, 1);
  // raw-frame sign: positive = fingertips lean to raw-left = screen-right = inward for a left-side hand.
  return String(side).toLowerCase() === "right" ? -s : s;
}
/** -1 lowered band, +1 raised band, 0 normal, from the lowest landmark of the hand. */
export function heightBand(lm) {
  let maxY = -Infinity;
  for (const p of lm) if (p.y > maxY) maxY = p.y;
  return maxY < RULES.raiseAboveY ? 1 : maxY >= RULES.lowerFromY ? -1 : 0;
}
/** Right-hand wrist height -> volume 0..1 (higher = louder, linear). */
export function wristVolume(lm) {
  const { volTop, volBottom } = RULES;
  return 1 - (clamp(lm[LM.WRIST].y, volTop, volBottom) - volTop) / (volBottom - volTop);
}
/** Right-hand tilt (inward positive) -> filter cutoff and resonance. */
export function filterFor(tilt) {
  const F = RULES.filter;
  if (tilt < 0) { const r = -tilt; return { freq: F.neutralHz - r * (F.neutralHz - F.darkHz), q: F.neutralQ + r * F.darkQAdd }; }
  if (tilt > 0) return { freq: F.neutralHz + tilt * (F.brightHz - F.neutralHz), q: F.neutralQ + tilt * F.brightQAdd };
  return { freq: F.neutralHz, q: F.neutralQ };
}

/** Per-hand features from 21 landmarks. side = 'left' | 'right' (the label of the hand itself). */
export function analyzeHand(lm, side = "left", aspect = 1) {
  const fingers = FINGERS.map((_, i) => fingerUp(lm, i));
  const thumb = thumbOut(lm, side);
  const palm = dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP], aspect) || 1e-6;
  return {
    side: String(side).toLowerCase(),
    fingers,
    thumb,
    count: fingers.filter(Boolean).length, // 0..4, thumb not included
    total: fingers.filter(Boolean).length + (thumb ? 1 : 0), // 0..5
    tilt: tiltAmount(lm, side),
    band: heightBand(lm),
    wristY: lm[LM.WRIST].y,
    pinch: dist(lm[LM.THUMB_TIP], lm[8], aspect) / palm < RULES.pinchRatio,
  };
}

/**
 * Chord hand -> scale degree 1..7, or 0 for no extended finger at all (silence).
 * Index + pinky only is VI (thumb tucked) or VII (thumb out); anything else is the NUMBER of extended
 * digits, thumb included (1..5 = I..V), whichever digits they are.
 */
export function classifyLeft(h) {
  const [i, m, r, p] = h.fingers;
  if (i && p && !m && !r) return h.thumb ? 7 : 6;
  return h.total >= 1 && h.total <= 5 ? h.total : 0;
}

export const COLOURS = ["mute", "triad", "inv1", "seventh", "dom7"];
/** Colour hand -> {quality 0..4, colour name, octaveDown}. Fingers only; thumb out = octave down. */
export function classifyRight(h) {
  return { quality: h.count, colour: COLOURS[h.count], octaveDown: h.thumb };
}

/** Hand-shape descriptions, used by the guide / song cards to draw icons. */
export function shapeForDegree(d) {
  const T = true, F = false;
  return ({
    0: { fingers: [F, F, F, F], thumb: F },
    1: { fingers: [T, F, F, F], thumb: F },
    2: { fingers: [T, T, F, F], thumb: F },
    3: { fingers: [T, T, T, F], thumb: F },
    4: { fingers: [T, T, T, T], thumb: F },
    5: { fingers: [T, T, T, T], thumb: T },
    6: { fingers: [T, F, F, T], thumb: F },
    7: { fingers: [T, F, F, T], thumb: T },
  })[d] || null;
}
export function shapeForColour(c) {
  const n = { mute: 0, triad: 1, inv1: 2, seventh: 3, dom7: 4 }[c];
  if (n == null) return null;
  return { fingers: [0, 1, 2, 3].map((i) => i < n), thumb: false };
}

// ---------------- hand assignment ----------------
/**
 * hands: [{label:'Left'|'Right', score, landmarks}] straight from MediaPipe on a raw frame.
 * Returns {left, right, extra}: left/right are ROLES (chord hand / colour hand). Each item is
 * {lm, label, side:'left'|'right' (the hand's own label), meanX}. With `swap`, the roles are exchanged
 * but `side` stays the hand's own label (the thumb and tilt tests follow the real hand).
 * One-handed mode keeps ONLY the chord-role hand.
 */
export function assignHands(hands, { swap = false, oneHanded = false } = {}) {
  const list = (hands || []).filter((h) => h && h.landmarks && h.landmarks.length >= 21);
  let items = list.map((h) => ({
    lm: h.landmarks,
    label: h.label === "Right" ? "Right" : "Left",
    side: h.label === "Right" ? "right" : "left",
    score: h.score ?? 1,
    meanX: h.landmarks.reduce((s, p) => s + p.x, 0) / h.landmarks.length,
  }));
  if (items.length >= 2) {
    items.sort((a, b) => b.score - a.score);
    items = items.slice(0, 2);
    if (items[0].side === items[1].side) {
      // Same label twice: on a mirrored screen the left hand is on the left, i.e. larger raw x.
      const [a, b] = items[0].meanX > items[1].meanX ? [items[0], items[1]] : [items[1], items[0]];
      a.side = "left"; a.label = "Left";
      b.side = "right"; b.label = "Right";
    }
  }
  const roleOf = (it) => (swap ? (it.side === "left" ? "right" : "left") : it.side);
  const out = { left: null, right: null, extra: 0 };
  for (const it of items) {
    const role = roleOf(it);
    if (oneHanded && role !== "left") { out.extra++; continue; }
    if (!out[role]) out[role] = it; else out.extra++;
  }
  return out;
}

// ---------------- debounce + dropout bridging ----------------
/**
 * Candidate state (a string, or null for "nothing playable") -> stable state.
 * A lost hand (null) keeps the previous candidate for `bridgeMs`; any change of candidate must then
 * hold for `holdMs` before it becomes the stable state.
 */
export class Debouncer {
  constructor({ holdMs = RULES.debounceMs, bridgeMs = RULES.bridgeMs } = {}) {
    this.holdMs = holdMs;
    this.bridgeMs = bridgeMs;
    this.reset();
  }
  reset() { this.stable = null; this.cand = null; this.since = 0; this.lastSeen = 0; }
  update(t, state) {
    if (state !== null) this.lastSeen = t;
    let cur = state;
    if (state === null && t - this.lastSeen < this.bridgeMs) cur = this.cand;
    if (cur !== this.cand) { this.cand = cur; this.since = t; }
    let changed = false;
    if (t - this.since >= this.holdMs && this.stable !== this.cand) { this.stable = this.cand; changed = true; }
    const pending = this.cand !== this.stable;
    return { stable: this.stable, candidate: this.cand, changed, progress: pending ? clamp((t - this.since) / this.holdMs, 0, 1) : 0 };
  }
}

// ---------------- tracker ----------------
const keyOf = (s) => `${s.degree}|${s.minor ? 1 : 0}|${s.alter}|${s.colour}|${s.octaveDown ? 1 : 0}`;
const parseKey = (k) => {
  if (k === null) return null;
  const [d, m, a, c, o] = k.split("|");
  return { degree: +d, minor: m === "1", alter: +a, colour: c === "null" ? null : c, octaveDown: o === "1" };
};

/** Maps chord-hand / colour-hand landmarks over time to a performance intent. */
export class GestureTracker {
  constructor(opts = {}) {
    this.opts = { oneHanded: false, lenientRight: false, raiseOn: false, lowerOn: false, aspect: 4 / 3, ...opts };
    this.deb = new Debouncer();
    this.reset();
  }
  reset() {
    this.deb.reset();
    this.lastFilter = filterFor(0);
    this.lastColour = null;
    this.lastOctave = false;
    this.lastVolume = RULES.lenientVolume;
    this.lastRightSeen = -1e9;
    this.pinchPrev = false;
  }
  configure(o) { Object.assign(this.opts, o); }

  /** hands = result of assignHands (roles). t in ms. */
  update(t, hands) {
    const o = this.opts;
    const one = !!o.oneHanded;
    const L = hands.left ? analyzeHand(hands.left.lm, hands.left.side, o.aspect) : null;
    const R = !one && hands.right ? analyzeHand(hands.right.lm, hands.right.side, o.aspect) : null;

    // ---- instantaneous reads (what the camera sees right now)
    const degree = L ? classifyLeft(L) : 0;
    const minor = L ? L.tilt < 0 : false;
    let alter = 0;
    if (L) alter = L.band === 1 && o.raiseOn ? 1 : L.band === -1 && o.lowerOn ? -1 : 0;

    let colour = null, octaveDown = false, volume, strum = false, usedLenient = false;
    let filter = this.lastFilter;
    if (one) {
      volume = RULES.oneHandVolume;
      filter = filterFor(0);
    } else if (R) {
      const c = classifyRight(R);
      colour = c.colour; octaveDown = c.octaveDown;
      volume = wristVolume(hands.right.lm);
      filter = this.lastFilter = filterFor(R.tilt);
      this.lastRightSeen = t; this.lastColour = colour; this.lastOctave = octaveDown; this.lastVolume = volume;
      strum = R.pinch && !this.pinchPrev;
    } else if (o.lenientRight) {
      usedLenient = true;
      const held = this.lastColour && t - this.lastRightSeen <= RULES.lenientHoldMs;
      colour = held ? this.lastColour : "triad";
      octaveDown = held ? this.lastOctave : false;
      volume = held ? this.lastVolume : RULES.lenientVolume;
    } else {
      colour = "mute"; // right hand absent in two-handed mode = silence, like the original
      volume = 0;
    }
    this.pinchPrev = !!(R && R.pinch);

    // ---- debounce the discrete musical state
    const cand = L && degree > 0 ? keyOf({ degree, minor, alter, colour, octaveDown }) : null;
    const d = this.deb.update(t, cand);
    const s = parseKey(d.stable);
    const stable = s || { degree: 0, minor: false, alter: 0, colour: one ? null : "mute", octaveDown: false };
    const c = parseKey(d.candidate);
    const leftPending = d.progress > 0 && (!s || !c || c.degree !== s.degree || c.minor !== s.minor || c.alter !== s.alter);
    const rightPending = d.progress > 0 && (!s || !c || c.colour !== s.colour || c.octaveDown !== s.octaveDown);

    return {
      degree: stable.degree,
      flip: stable.minor,
      alter: stable.alter,
      colour: stable.degree ? stable.colour : one ? null : "mute",
      octaveDown: stable.octaveDown,
      volume,
      filter,
      strum,
      progress: { left: leftPending ? d.progress : 0, right: rightPending ? d.progress : 0 },
      info: {
        oneHanded: one,
        lenient: usedLenient,
        locked: d.candidate === d.stable,
        left: L ? { present: true, degree, minor, tilt: L.tilt, band: L.band, count: L.count, thumb: L.thumb, total: L.total } : { present: false },
        right: R ? { present: true, quality: R.count, count: R.count, thumb: R.thumb, tilt: R.tilt, volume, filter } : { present: false },
        stable,
      },
    };
  }
}
