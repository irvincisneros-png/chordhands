// Live "what the camera sees" panel: the 7 chord-hand shapes and 4 colour-hand shapes, with the shape
// being detected right now highlighted, plus tilt, octave, pitch band, and a lock-in ring.
// update(out) takes GestureTracker.update() output every frame and only touches the DOM when something changed.
import { handIcon } from "./hands.js";
import { shapeForDegree, shapeForColour } from "../gestures.js";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const SHAPE_TEXT = ["One digit", "Two digits", "Three digits", "Four digits", "Five digits", "Index + pinky", "Index + pinky + thumb"];
const COLOUR = [
  { id: "triad", major: "Root", minor: "Root", text: "1 finger" },
  { id: "inv1", major: "1st inv", minor: "1st inv", text: "2 fingers" },
  { id: "seventh", major: "maj7", minor: "m7", text: "3 fingers" },
  { id: "dom7", major: "dom7", minor: "dim7", text: "4 fingers" },
];
const RING_LEN = 2 * Math.PI * 9;

function ring() {
  return `<svg class="gg-ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="bg" cx="12" cy="12" r="9"/><circle class="fg" cx="12" cy="12" r="9" stroke-dasharray="${RING_LEN.toFixed(2)}" stroke-dashoffset="${RING_LEN.toFixed(2)}" transform="rotate(-90 12 12)"/></svg>`;
}

export function createGestureGuide(el) {
  el.innerHTML = `
    <section class="gg-block" data-hand="left" aria-label="Chord hand (left)">
      <header><h3>Left hand <span>chord</span></h3>${ring()}</header>
      <div class="gg-tiles">${ROMAN.map((r, i) => `<div class="gg-tile" data-d="${i + 1}" style="--c:var(--deg${i + 1})" title="${r}: ${SHAPE_TEXT[i]}">${handIcon({ ...shapeForDegree(i + 1), size: 30, label: r + ": " + SHAPE_TEXT[i] })}<b>${r}</b><i data-name></i></div>`).join("")}</div>
      <div class="gg-chips">
        <span class="gg-chip" data-tilt="in">Tilt in: major</span>
        <span class="gg-chip" data-tilt="out">Tilt out: minor</span>
      </div>
      <div class="gg-chips">
        <span class="gg-chip" data-band="1">Hand high: &#9839;</span>
        <span class="gg-chip" data-band="0">Middle</span>
        <span class="gg-chip" data-band="-1">Hand low: &#9837;</span>
      </div>
    </section>
    <section class="gg-block" data-hand="right" aria-label="Colour hand (right)">
      <header><h3>Right hand <span>colour</span></h3>${ring()}</header>
      <div class="gg-tiles four">${COLOUR.map((c, i) => `<div class="gg-tile" data-q="${i + 1}" title="${c.text}">${handIcon({ ...shapeForColour(c.id), side: "right", size: 30, label: c.text })}<b data-q-name>${c.major}</b><i>${i + 1}</i></div>`).join("")}</div>
      <div class="gg-chips">
        <span class="gg-chip" data-oct="up">Thumb in: higher</span>
        <span class="gg-chip" data-oct="down">Thumb out: lower</span>
      </div>
      <div class="gg-chips">
        <span class="gg-chip" data-ftilt="in">Tilt in: brighter</span>
        <span class="gg-chip" data-ftilt="out">Tilt out: darker</span>
      </div>
      <div class="gg-meter" aria-hidden="true"><div><i data-vol></i></div><span>Volume: raise your right pointer finger higher for louder</span></div>
    </section>
    <p class="gg-note" data-note></p>`;

  const q = (s, r = el) => r.querySelector(s);
  const qa = (s, r = el) => [...r.querySelectorAll(s)];
  const leftBlock = q('[data-hand="left"]'), rightBlock = q('[data-hand="right"]');
  const leftRing = q(".fg", leftBlock), rightRing = q(".fg", rightBlock);
  const tiles = qa("[data-d]"), qtiles = qa("[data-q]");
  const noteEl = q("[data-note]");
  let last = "";
  let toggles = { raiseOn: false, lowerOn: false };

  const setRing = (node, p) => node.style.strokeDashoffset = String(RING_LEN * (1 - p));
  const flag = (node, cls, on) => node.classList.toggle(cls, !!on);

  function paint(out, opts) {
    const info = out && out.info;
    const L = info && info.left && info.left.present ? info.left : null;
    const R = info && info.right && info.right.present ? info.right : null;
    const one = !!(opts && opts.oneHanded);
    const locked = !!(info && info.locked);
    const key = [L ? `${L.degree}|${L.minor}|${L.band}` : "-", R ? `${R.quality}|${R.thumb}|${R.tilt > 0.05 ? 1 : R.tilt < -0.05 ? -1 : 0}` : "-", one, locked, toggles.raiseOn, toggles.lowerOn, info ? info.stable.degree + "/" + info.stable.minor : ""].join("~");
    if (key !== last) {
      last = key;
      flag(leftBlock, "absent", !L); flag(rightBlock, "absent", !R); flag(rightBlock, "off", one);
      tiles.forEach((t) => { const on = L && L.degree === +t.dataset.d; flag(t, "det", on); flag(t, "lock", on && locked); });
      qtiles.forEach((t) => { const on = R && R.quality === +t.dataset.q; flag(t, "det", on); flag(t, "lock", on && locked); });
      const minor = L ? L.minor : info ? info.stable.minor : false;
      qa("[data-q-name]").forEach((n, i) => (n.textContent = COLOUR[i][minor ? "minor" : "major"]));
      flag(q('[data-tilt="in"]'), "on", L && !L.minor); flag(q('[data-tilt="out"]'), "on", L && L.minor);
      qa("[data-band]").forEach((c) => {
        const b = +c.dataset.band;
        const enabled = b === 0 || (b === 1 && toggles.raiseOn) || (b === -1 && toggles.lowerOn);
        flag(c, "on", L && L.band === b && enabled); flag(c, "dim", !enabled);
      });
      flag(q('[data-oct="up"]'), "on", R && !R.thumb); flag(q('[data-oct="down"]'), "on", R && R.thumb);
      const ft = R ? (R.tilt > 0.05 ? 1 : R.tilt < -0.05 ? -1 : 0) : 0;
      flag(q('[data-ftilt="in"]'), "on", R && ft > 0); flag(q('[data-ftilt="out"]'), "on", R && ft < 0);
      noteEl.textContent = !info ? "" : !L ? "Show your left hand to choose a chord." : one ? "One-handed: only your left hand is read." : !R ? "No right hand seen: silent until it appears." : L.degree === 0 ? "Left hand: no finger up = silence." : "";
    }
    setRing(leftRing, out ? out.progress.left : 0);
    setRing(rightRing, out ? out.progress.right : 0);
    const vol = q("[data-vol]");
    vol.style.height = R ? Math.round(R.volume * 100) + "%" : "0%";
  }

  return {
    update(out, opts) { paint(out, opts); },
    reset() { last = ""; paint(null, null); },
    setToggles(t) { toggles = { ...toggles, ...t }; last = ""; },
    /** names: chord symbols for degrees 1..7 in the current key */
    setNames(names) { qa("[data-name]").forEach((n, i) => (n.textContent = names[i] || "")); },
  };
}
