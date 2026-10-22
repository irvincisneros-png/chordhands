// "Hand guide" dialog: every gesture with our own SVG hand icons.
import { handIcon } from "./hands.js";
import { shapeForDegree, shapeForColour } from "../gestures.js";

const LEFT = [
  [1, "I", "1 finger or thumb"],
  [2, "II", "Any 2 digits"],
  [3, "III", "Any 3 digits"],
  [4, "IV", "Any 4 digits"],
  [5, "V", "Open hand, thumb out"],
  [6, "VI", "Index + pinky only (rock sign)"],
  [7, "VII", "Index + pinky + thumb"],
  [0, "Silence", "No finger up (fist)"],
];
const RIGHT = [
  ["mute", "Silence", "Fist (or no right hand)"],
  ["triad", "Root position", "1 finger"],
  ["inv1", "1st inversion", "2 fingers"],
  ["seventh", "maj7 / m7", "3 fingers"],
  ["dom7", "dom7 / dim7", "4 fingers"],
];

export function renderGuide(dlg, { volumeFrom = "wrist" } = {}) {
  const volText = volumeFrom === "index" ? "raise your right pointer finger higher for louder, lower it for softer" : "raise your right wrist higher for louder, lower it for softer";
  const l = LEFT.map(([d, r, t]) => `<figure>${handIcon({ ...shapeForDegree(d), label: r + ": " + t, size: 64 })}<figcaption><b>${r}</b><span>${t}</span></figcaption></figure>`).join("");
  const r = RIGHT.map(([c, n, t]) => `<figure>${handIcon({ ...shapeForColour(c), side: "right", label: n + ": " + t, size: 64 })}<figcaption><b>${n}</b><span>${t}</span></figcaption></figure>`).join("");
  dlg.innerHTML = `
  <div class="dlg-head"><h2 id="guideTitle">Hand guide</h2><button class="btn small" id="guideClose" aria-label="Close guide">Close</button></div>
  <p class="lead">Hold your hands up in front of the camera, palms facing it, in the mirrored view. Your <b>left hand picks the chord</b>; your <b>right hand shapes it</b>. Nothing sounds without a chord hand, and in two-handed mode nothing sounds without the right hand. The panel next to the camera shows what it sees.</p>
  <h3>Left hand: which chord</h3>
  <div class="fig-grid">${l}</div>
  <ul class="note-list">
    <li><b>Count the digits</b> that are up (thumb counts): 1 = I, 2 = II, 3 = III, 4 = IV, 5 = V. Index + pinky alone is VI; add the thumb for VII.</li>
    <li><b>Major or minor:</b> lean the hand <b>inward</b> (fingertips toward the middle of the screen) for <b>major</b>, <b>outward</b> for <b>minor</b>. Upright counts as major.</li>
    <li><b>Optional pitch shift</b> (turn on in Settings): hand in the top half of the picture raises the chord a semitone; a hand reaching the bottom fifth lowers it. Switch these on to reach chords like bVII.</li>
  </ul>
  <h3>Right hand: chord shape, octave, volume, tone</h3>
  <div class="fig-grid">${r}</div>
  <ul class="note-list">
    <li><b>Fingers</b> (thumb not counted): 1 root position, 2 first inversion, 3 seventh (maj7 on a major chord, m7 on minor), 4 dominant 7 (dim7 on minor).</li>
    <li><b>Thumb in:</b> higher octave. <b>Thumb out:</b> one octave lower.</li>
    <li><b>Volume:</b> ${volText} (Settings, Hands: <i>Volume follows</i> wrist or pointer fingertip). <b>Tilt inward:</b> brighter, more filter. <b>Tilt outward:</b> darker.</li>
    <li><b>Hold a shape</b> for a split second; the ring in the panel fills while it locks in. Losing a hand for a blink does not interrupt the chord.</li>
    <li><b>One-handed mode</b> (Settings, Hands): only the left hand is read, the chord is a root-position triad. Use the pad chips or keys Q W E R for the right-hand shapes.</li>
    <li><b>Wrong hand?</b> Use <i>Swap hands</i> in Settings. <b>Pinch</b> thumb to index re-strikes the chord in the Strum and Arpeggio styles.</li>
  </ul>
  <h3>Theremin mode</h3>
  <ul class="note-list">
    <li>Switch <b>Chords / Theremin</b> at the top. <b>Right hand height = pitch</b> (low at the bottom of the picture, high at the top). <b>Left hand height = volume.</b> It only sounds while both hands are in view and the volume hand is raised a little.</li>
    <li>Tick <b>Snap to key</b> to land only on notes of the key. Without a camera, drag on the pad: left to right is pitch, up is louder.</li>
  </ul>
  <h3>Keyboard and touch</h3>
  <p class="note"><kbd>1</kbd>–<kbd>7</kbd> chords, <kbd>Shift</kbd> minor (the tilt), <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> = right hand 1, 2, 3, 4 fingers (root, 1st inversion, 7th, dom7), <kbd>T</kbd> sus4 <kbd>Y</kbd> add9, <kbd>Z</kbd>/<kbd>X</kbd> octave (thumb), <kbd>,</kbd>/<kbd>.</kbd> inversion, <kbd>Space</kbd> strum, <kbd>P</kbd> projector. Or press and hold the big pad buttons.</p>`;
  dlg.querySelector("#guideClose").addEventListener("click", () => dlg.close());
}
