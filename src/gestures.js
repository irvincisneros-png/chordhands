// Gesture classification from MediaPipe hand landmarks. Pure logic, no DOM.
//
// HANDEDNESS: MediaPipe assumes the input image is a mirrored selfie. We feed it the RAW
// (un-mirrored) camera frame and mirror only the on-screen video with CSS, so its "Left"
// label is really the user's RIGHT hand and vice versa. assignHands() corrects this, falls
// back to x-position if both hands get the same label, and honours a "swap hands" setting.

export const LM = { WRIST: 0, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4, INDEX_MCP: 5, MIDDLE_MCP: 9, PINKY_MCP: 17 };
const FINGERS = [
  { name: "index", mcp: 5, pip: 6, tip: 8 },
  { name: "middle", mcp: 9, pip: 10, tip: 12 },
  { name: "ring", mcp: 13, pip: 14, tip: 16 },
  { name: "pinky", mcp: 17, pip: 18, tip: 20 },
];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function dist(a, b, aspect) {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** Per-hand features from 21 landmarks. aspect = video width / height. */
export function analyzeHand(lm, aspect = 1) {
  const w = lm[LM.WRIST];
  const palm = dist(w, lm[LM.MIDDLE_MCP], aspect) || 1e-6;
  const fingers = FINGERS.map((f) => dist(lm[f.tip], w, aspect) > dist(lm[f.pip], w, aspect) * 1.15);
  const thumb = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP], aspect) > 0.62 * palm;
  const pinchDist = dist(lm[LM.THUMB_TIP], lm[8], aspect) / palm;
  const dx = (lm[LM.MIDDLE_MCP].x - w.x) * aspect;
  const dy = lm[LM.MIDDLE_MCP].y - w.y;
  return {
    fingers,
    thumb,
    count: fingers.filter(Boolean).length,
    palm,
    pinch: pinchDist < 0.3,
    // lean of the hand in the raw image, degrees; + = fingertips lean toward image right
    tilt: (Math.atan2(dx, -dy) * 180) / Math.PI,
    cx: (w.x + lm[LM.MIDDLE_MCP].x) / 2,
    cy: (w.y + lm[LM.MIDDLE_MCP].y) / 2,
  };
}

/** Left (chord) hand -> 1..7, 0 for fist (silence), null for shapes we don't recognise. */
export function classifyLeft(h) {
  const key = h.fingers.map((f) => (f ? 1 : 0)).join("");
  switch (key) {
    case "0000": return 0;
    case "1000": return 1;
    case "1100": return 2;
    case "1110": return 3;
    case "1111": return h.thumb ? 5 : 4;
    case "1001": return h.thumb ? 7 : 6;
    default: return null;
  }
}

export const COLOURS = ["mute", "triad", "inv1", "seventh", "dom7"];
/** Right (colour) hand -> {colour, octaveDown}. */
export function classifyRight(h) {
  return { colour: COLOURS[h.count], octaveDown: h.thumb };
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

/** Left/right outward-tilt in degrees (positive = leaning away from the body). */
export function outwardTilt(tilt, physical) {
  return physical === "left" ? tilt : -tilt;
}
export function nextFlip(prev, outward, on = 25, off = 15) {
  return prev ? outward > off : outward > on;
}

/**
 * hands: [{label:'Left'|'Right', score, landmarks}] straight from MediaPipe on a raw frame.
 * Returns {left, right, extra} where left/right are ROLES (chord hand / colour hand) and each
 * has {lm, physical:'left'|'right'(the user's real hand), label}.
 */
export function assignHands(hands, { swap = false, oneHanded = false } = {}) {
  const list = (hands || []).filter((h) => h && h.landmarks && h.landmarks.length >= 21);
  const flipLabel = (l) => (l === "Left" ? "right" : "left"); // raw-frame correction
  let items = list.map((h) => ({
    lm: h.landmarks,
    label: h.label,
    score: h.score ?? 1,
    physical: flipLabel(h.label),
    meanX: h.landmarks.reduce((s, p) => s + p.x, 0) / h.landmarks.length,
  }));
  if (items.length >= 2) {
    items.sort((a, b) => b.score - a.score);
    items = items.slice(0, 2);
    if (items[0].physical === items[1].physical) {
      // Same label twice: user's left hand is on the image's right (larger x) in a raw frame.
      const [a, b] = items[0].meanX > items[1].meanX ? [items[0], items[1]] : [items[1], items[0]];
      a.physical = "left";
      b.physical = "right";
    }
  }
  const roleOf = (p) => (swap ? (p === "left" ? "right" : "left") : p);
  const out = { left: null, right: null, extra: 0 };
  if (oneHanded) {
    const pick = items.find((i) => roleOf(i.physical) === "left") || items[0];
    if (pick) out.left = pick;
    out.extra = Math.max(0, items.length - 1);
    return out;
  }
  for (const it of items) {
    const role = roleOf(it.physical);
    if (!out[role]) out[role] = it;
  }
  return out;
}

// ---------------- stabiliser (debounce + dropout bridging) ----------------
export class Stabilizer {
  constructor({ holdMs = 110, dropMs = 150, initial = "none" } = {}) {
    this.holdMs = holdMs;
    this.dropMs = dropMs;
    this.stable = initial;
    this.cand = initial;
    this.since = 0;
    this.lastSeen = null;
    this.lastRaw = null;
  }
  /** raw: string key, null (no hand) or 'unknown' (unrecognised shape: keep current). */
  update(t, raw) {
    if (raw === null) {
      raw = this.lastSeen != null && t - this.lastSeen <= this.dropMs && this.lastRaw != null ? this.lastRaw : "none";
    } else {
      this.lastSeen = t;
      if (raw !== "unknown") this.lastRaw = raw;
    }
    if (raw === "unknown") {
      this.cand = this.stable;
      this.since = t;
    } else if (raw !== this.cand) {
      this.cand = raw;
      this.since = t;
    }
    let changed = false;
    if (this.cand !== this.stable && t - this.since >= this.holdMs) {
      this.stable = this.cand;
      changed = true;
    }
    const progress = this.cand !== this.stable ? clamp((t - this.since) / this.holdMs, 0, 1) : 0;
    return { stable: this.stable, candidate: this.cand, progress, changed };
  }
}

const VOL_TOP = 0.15, VOL_BOTTOM = 0.85;
export function heightToVolume(cy) {
  return 0.12 + 0.88 * clamp((VOL_BOTTOM - cy) / (VOL_BOTTOM - VOL_TOP), 0, 1);
}

/** Maps left/right hand landmarks over time to a performance intent. */
export class GestureTracker {
  constructor(opts = {}) {
    this.opts = { oneHanded: false, rightSilent: false, accidentals: false, aspect: 4 / 3, ...opts };
    this.leftStab = new Stabilizer({ holdMs: 110, dropMs: 150 });
    this.rightStab = new Stabilizer({ holdMs: 110, dropMs: 150, initial: "triad" });
    this.flip = false;
    this.lastColour = null;
    this.lastRightSeen = -1e9;
    this.vol = 0.7;
    this.bright = 0.7;
    this.pinchPrev = false;
    this.octaveDown = false;
  }
  configure(o) { Object.assign(this.opts, o); }

  /** hands = result of assignHands (roles). t in ms. */
  update(t, hands) {
    const o = this.opts;
    const L = hands.left ? { ...hands.left, f: analyzeHand(hands.left.lm, o.aspect) } : null;
    const R = !o.oneHanded && hands.right ? { ...hands.right, f: analyzeHand(hands.right.lm, o.aspect) } : null;

    // ---- chord hand
    let leftRaw = null, leftDeg = null, alter = 0;
    if (L) {
      leftDeg = classifyLeft(L.f);
      this.flip = nextFlip(this.flip, outwardTilt(L.f.tilt, L.physical));
      if (o.accidentals) alter = L.f.cy < 0.25 ? 1 : L.f.cy > 0.8 ? -1 : 0;
      leftRaw = leftDeg === null ? "unknown" : leftDeg === 0 ? "silent" : `${leftDeg}|${this.flip ? 1 : 0}|${alter}`;
    }
    const ls = this.leftStab.update(t, leftRaw);
    const parse = (k) => {
      if (k === "none" || k === "silent") return { degree: 0, flip: false, alter: 0 };
      const [d, f, a] = k.split("|");
      return { degree: +d, flip: f === "1", alter: +a };
    };
    const chord = parse(ls.stable);

    // ---- colour hand
    let colour = null, octaveDown = false, volume = null, brightness = null, strum = false, rs = { progress: 0, stable: "none" };
    if (!o.oneHanded) {
      const rawR = R ? classifyRight(R.f).colour : null;
      rs = this.rightStab.update(t, rawR);
      if (R) {
        this.lastRightSeen = t;
        const c = classifyRight(R.f);
        this.octaveDown = c.octaveDown;
        const outward = outwardTilt(R.f.tilt, R.physical);
        this.vol += (heightToVolume(R.f.cy) - this.vol) * 0.35;
        this.bright += (clamp((outward + 45) / 90, 0, 1) - this.bright) * 0.3;
        strum = R.f.pinch && !this.pinchPrev;
        this.pinchPrev = R.f.pinch;
        this.lastColour = rs.stable === "none" ? this.lastColour : rs.stable;
      } else {
        this.pinchPrev = false;
      }
      if (rs.stable !== "none" && R) {
        colour = rs.stable; octaveDown = this.octaveDown; volume = this.vol; brightness = this.bright;
      } else if (o.rightSilent) {
        colour = "mute"; volume = 0;
      } else if (t - this.lastRightSeen <= 150 + 400 && this.lastColour) {
        colour = this.lastColour; octaveDown = this.octaveDown; volume = this.vol; brightness = this.bright;
      } else {
        colour = "triad"; volume = 0.6; brightness = null;
      }
      if (colour === "none") colour = "triad";
    }

    return {
      ...chord, colour, octaveDown, volume, brightness, strum,
      progress: { left: ls.progress, right: rs.progress },
      info: {
        left: L ? { present: true, count: L.f.count, thumb: L.f.thumb, degree: leftDeg, flip: this.flip, physical: L.physical, f: L.f } : { present: false },
        right: R ? { present: true, count: R.f.count, thumb: R.f.thumb, physical: R.physical, f: R.f } : { present: false },
      },
    };
  }
}
