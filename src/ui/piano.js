// Two-octave piano strip (C3..C5) drawn as SVG. Notes outside the range are folded in by octave.
const LO = 48, HI = 72;
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (m) => WHITE.includes(((m % 12) + 12) % 12);

export function createPiano(el) {
  const whites = [];
  for (let m = LO; m <= HI; m++) if (isWhite(m)) whites.push(m);
  const W = 100 / whites.length;
  let svg = `<svg viewBox="0 0 100 26" preserveAspectRatio="none" role="img" aria-label="Piano keys showing the notes of the current chord">`;
  const pos = new Map();
  whites.forEach((m, i) => { pos.set(m, i * W); svg += `<rect class="wk" data-m="${m}" x="${i * W + 0.12}" y="0" width="${W - 0.24}" height="26" rx="0.8"/>`; });
  for (let m = LO; m <= HI; m++) if (!isWhite(m)) {
    const left = pos.get(m - 1);
    svg += `<rect class="bk" data-m="${m}" x="${left + W * 0.66}" y="0" width="${W * 0.68}" height="15.5" rx="0.6"/>`;
  }
  el.innerHTML = svg + "</svg>";
  const keys = new Map([...el.querySelectorAll("rect[data-m]")].map((r) => [+r.dataset.m, r]));
  const fold = (m) => { while (m > HI) m -= 12; while (m < LO) m += 12; return m; };
  return {
    show(notes, bass) {
      keys.forEach((r) => { r.classList.remove("on", "root"); });
      if (!notes) return;
      for (const n of notes) {
        const k = keys.get(fold(n.midi));
        if (k) k.classList.add("on");
        if (n.isRoot && k) k.classList.add("root");
      }
    },
  };
}
