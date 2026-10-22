// Guided first lesson. Pure logic: feed it the chord the student is sounding.
export const TUTORIAL_KEY = { rootName: "C", mode: "major" };

// hands: which hands the step needs ("one" = left hand only, "two" = both). Camera steps 1-3 are left-hand only,
// then the right hand joins in, so a student never has to guess why nothing sounds.
export const STEPS = [
  { id: "I", roman: "I", hands: "one", title: "Start at home", text: "Show your left hand with ONE finger up (index) and lean it inward. That is chord I, the \"home\" chord.", gesture: { degree: 1 }, keys: "Press 1" },
  { id: "IV", roman: "IV", hands: "one", title: "Move to IV", text: "Hold up FOUR fingers (thumb tucked) for chord IV. Hear how it lifts away from home?", gesture: { degree: 4 }, keys: "Press 4" },
  { id: "iv", roman: "iv", hands: "one", title: "Make it sad: flip to minor", text: "Keep four fingers up, then tilt your left hand outward. A major chord flips to minor (iv) and the mood darkens.", gesture: { degree: 4, flip: true }, keys: "Hold Shift + 4" },
  { id: "V", roman: "V", hands: "two", title: "Add your right hand", text: "Left hand: all five fingers for chord V, tilted inward. Now bring in your RIGHT hand with one finger up: it shapes the chord (root position). No right hand means silence.", gesture: { degree: 5, colour: "triad" }, keys: "Press 5 (Q = right hand, 1 finger)" },
  { id: "V7", roman: "V7", hands: "two", title: "Build tension: V7", text: "Keep V and show FOUR fingers on your right hand for a dominant 7th. V7 wants to resolve.", gesture: { degree: 5, colour: "dom7" }, keys: "Press 5, then R" },
  { id: "I2", roman: "I", hands: "two", title: "Resolve home", text: "Back to ONE finger on the left hand: chord I. Right hand: one finger. Tension released, the progression is complete.", gesture: { degree: 1, colour: "triad" }, keys: "Press 1, then Q" },
];

export class Tutorial {
  constructor(steps = STEPS, { holdMs = 500 } = {}) {
    this.steps = steps;
    this.holdMs = holdMs;
    this.index = 0;
    this.since = null;
    this.done = false;
  }
  get step() { return this.steps[this.index] || null; }
  get hands() { return this.step ? this.step.hands : null; }
  get progress() { return this.index / this.steps.length; }
  reset() { this.index = 0; this.since = null; this.done = false; }
  /** chord: chord object or null. Returns {advanced, done, holdProgress}. */
  update(t, chord) {
    if (this.done) return { advanced: false, done: true, holdProgress: 1 };
    const ok = chord && chord.roman === this.step.roman;
    if (!ok) { this.since = null; return { advanced: false, done: false, holdProgress: 0 }; }
    if (this.since == null) this.since = t;
    const holdProgress = Math.min(1, (t - this.since) / this.holdMs);
    if (holdProgress >= 1) {
      this.index++;
      this.since = null;
      if (this.index >= this.steps.length) this.done = true;
      return { advanced: true, done: this.done, holdProgress: 1 };
    }
    return { advanced: false, done: false, holdProgress };
  }
}
