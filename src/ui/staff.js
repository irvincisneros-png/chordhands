// Treble staff (SVG) with the chord's notes and correct accidentals.
const GAP = 8; // distance between staff lines
const BOTTOM = 80; // y of the bottom line (E4)
const E4 = 4 * 7 + 2;
const LET = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

export function stepOf(n) {
  const natural = n.midi - n.acc;
  return (Math.floor(natural / 12) - 1) * 7 + LET[n.letter];
}
const yOf = (step) => BOTTOM - ((step - E4) * GAP) / 2;

export function renderStaff(el, notes) {
  let s = `<svg viewBox="0 0 260 150" role="img" aria-label="Treble staff showing the chord notes">`;
  for (let i = 0; i < 5; i++) s += `<line class="sl" x1="20" x2="250" y1="${BOTTOM - i * GAP}" y2="${BOTTOM - i * GAP}"/>`;
  s += `<text class="clef" x="26" y="${BOTTOM + 6}" font-size="58">𝄞</text>`;
  if (notes && notes.length) {
    const items = notes.map((n) => ({ n, step: stepOf(n) })).sort((a, b) => a.step - b.step);
    // accidentals stagger leftwards; adjacent steps (seconds) shift the notehead right
    let prevStep = -99, prevShift = false, accCol = 0;
    const cx = 150;
    for (const it of items) {
      it.shift = it.step - prevStep === 1 && !prevShift;
      prevShift = it.shift; prevStep = it.step;
    }
    for (const { n, step, shift } of items) {
      const y = yOf(step), x = cx + (shift ? 13 : 0);
      if (step <= E4 - 2) for (let st = E4 - 2; st >= step; st -= 2) s += `<line class="sl led" x1="${x - 13}" x2="${x + 13}" y1="${yOf(st)}" y2="${yOf(st)}"/>`;
      if (step >= E4 + 10) for (let st = E4 + 12; st <= step; st += 2) s += `<line class="sl led" x1="${x - 13}" x2="${x + 13}" y1="${yOf(st)}" y2="${yOf(st)}"/>`;
      s += `<ellipse class="nh${n.isRoot ? " root" : ""}" cx="${x}" cy="${y}" rx="7.2" ry="5.2" transform="rotate(-18 ${x} ${y})"/>`;
      if (n.acc) {
        const g = n.acc === 1 ? "♯" : n.acc === -1 ? "♭" : n.acc === 2 ? "𝄪" : "𝄫";
        s += `<text class="acc" x="${x - 24 - (accCol++ % 2) * 12}" y="${y + 6}" font-size="20">${g}</text>`;
      }
    }
  }
  el.innerHTML = s + "</svg>";
}
