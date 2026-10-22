// Guided first lesson. Pure logic: feed it the chord the student is sounding.
export const TUTORIAL_KEY = { rootName: "C", mode: "major" };

export const STEPS = [
  { id: "I", roman: "I", title: "Start at home", text: "Show your left hand with ONE finger up (index). That is chord I, the \"home\" chord.", gesture: { degree: 1 }, keys: "Press 1" },
  { id: "IV", roman: "IV", title: "Move to IV", text: "Hold up FOUR fingers (thumb tucked) for chord IV. Hear how it lifts away from home?", gesture: { degree: 4 }, keys: "Press 4" },
  { id: "iv", roman: "iv", title: "Make it sad: flip to minor", text: "Keep IV, then tilt your left hand outward. A major chord flips to minor (iv) and the mood darkens.", gesture: { degree: 4, flip: true }, keys: "Hold Shift + 4" },
  { id: "V7", roman: "V7", title: "Build tension: V7", text: "Hold up all five fingers for V. With your right hand, show 3 fingers for a 7th (or press E). V7 wants to resolve.", gesture: { degree: 5, colour: "seventh" }, keys: "Press 5, then E (or R)" },
  { id: "I2", roman: "I", title: "Resolve home", text: "Back to ONE finger: chord I. Tension released, the progression is complete.", gesture: { degree: 1 }, keys: "Press 1" },
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
