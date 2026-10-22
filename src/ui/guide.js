// "Hand guide" dialog: every gesture with our own SVG hand icons.
import { handIcon } from "./hands.js";
import { shapeForDegree, shapeForColour } from "../gestures.js";

const LEFT = [
  [1, "I", "Index finger"],
  [2, "II", "Index + middle"],
  [3, "III", "Three fingers"],
  [4, "IV", "Four fingers, thumb tucked"],
  [5, "V", "Open palm"],
  [6, "VI", "Index + pinky (rock sign)"],
  [7, "VII", "Index + pinky + thumb"],
  [0, "Silence", "Fist"],
];
const RIGHT = [
  ["mute", "Mute", "Fist: fades out"],
  ["triad", "Triad", "1 finger"],
  ["inv1", "1st inversion", "2 fingers"],
  ["seventh", "7th", "3 fingers"],
  ["dom7", "Dominant 7", "4 fingers"],
];

export function renderGuide(dlg) {
  const l = LEFT.map(([d, r, t]) => `<figure>${handIcon({ ...shapeForDegree(d), label: r + ": " + t, size: 64 })}<figcaption><b>${r}</b><span>${t}</span></figcaption></figure>`).join("");
  const r = RIGHT.map(([c, n, t]) => `<figure>${handIcon({ ...shapeForColour(c), side: "right", label: n + ": " + t, size: 64 })}<figcaption><b>${n}</b><span>${t}</span></figcaption></figure>`).join("");
  dlg.innerHTML = `
  <div class="dlg-head"><h2 id="guideTitle">Hand guide</h2><button class="btn small" id="guideClose" aria-label="Close guide">Close</button></div>
  <p class="lead">Hold your hands up in front of the camera, palms facing it. Your <b>left hand picks the chord</b>; your <b>right hand shapes the sound</b>. Hold a shape for a moment, a ring fills while it locks in.</p>
  <h3>Left hand: which chord</h3>
  <div class="fig-grid">${l}</div>
  <p class="note"><b>Flip major / minor:</b> tilt your left hand outward (away from your body). In <i>Diatonic</i> harmony chords already follow the key (ii, iii and vi are minor); the tilt flips any chord, so IV becomes iv.</p>
  <h3>Right hand: colour, octave, volume, tone</h3>
  <div class="fig-grid">${r}</div>
  <ul class="note-list">
    <li><b>Thumb out</b> on the right hand: play one octave lower.</li>
    <li><b>Hand height</b>: higher is louder. <b>Tilt</b> the hand: brighter or darker tone.</li>
    <li><b>Pinch</b> thumb to index: strum / re-strike (Strum and Arpeggio styles).</li>
    <li>No right hand in view? The last colour is held for a moment, then a plain triad plays (or silence, if you turn on <i>No right hand = silent</i>).</li>
    <li><b>One-handed mode</b>: use the left hand only; set colour with the pad buttons or keys Q W E R T Y.</li>
    <li><b>Wrong hand?</b> Use <i>Swap hands</i> in Settings.</li>
  </ul>
  <h3>Keyboard and touch</h3>
  <p class="note"><kbd>1</kbd>–<kbd>7</kbd> chords, <kbd>Shift</kbd> flip, <kbd>Q</kbd> triad <kbd>W</kbd> 1st inversion <kbd>E</kbd> 7th <kbd>R</kbd> dominant 7th <kbd>T</kbd> sus4 <kbd>Y</kbd> add9, <kbd>Z</kbd>/<kbd>X</kbd> octave, <kbd>,</kbd>/<kbd>.</kbd> inversion, <kbd>Space</kbd> strum, <kbd>P</kbd> projector. Or press and hold the big pad buttons.</p>`;
  dlg.querySelector("#guideClose").addEventListener("click", () => dlg.close());
}
