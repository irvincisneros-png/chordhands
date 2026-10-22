// Pure (DOM-free) helpers for the stage key picker.
import { mod, pretty, MAJOR_ROOTS, MINOR_ROOTS } from "./theory.js";

/** Grid labels, indexed by pitch class (musician-friendly, dual spelling for F#/Gb in major). */
export const GRID_LABELS = {
  major: ["C", "D♭", "D", "E♭", "E", "F", "F♯/G♭", "G", "A♭", "A", "B♭", "B"],
  minor: ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"],
};
export const normMode = (m) => (m === "minor" ? "minor" : "major");

/** Single-name root spelling for a pitch class, e.g. (3, "major") -> "E♭". */
export const rootName = (pc, mode = "major") => pretty((normMode(mode) === "minor" ? MINOR_ROOTS : MAJOR_ROOTS)[mod(pc, 12)]);

/** "E♭ major" */
export const keyLabel = (pc, mode = "major") => `${rootName(pc, mode)} ${normMode(mode)}`;

/** Step a key root by n semitones, wrapping 0..11. */
export const stepKeyRoot = (pc, delta) => mod(pc + delta, 12);

/** Move within the 4x3 grid (cols=4). Arrow keys wrap by row/column; Home/End jump. */
export function gridMove(index, key, cols = 4, total = 12) {
  const rows = total / cols, r = Math.floor(index / cols), c = index % cols;
  switch (key) {
    case "ArrowRight": return r * cols + ((c + 1) % cols);
    case "ArrowLeft": return r * cols + ((c + cols - 1) % cols);
    case "ArrowDown": return ((r + 1) % rows) * cols + c;
    case "ArrowUp": return ((r + rows - 1) % rows) * cols + c;
    case "Home": return 0;
    case "End": return total - 1;
    default: return index;
  }
}
