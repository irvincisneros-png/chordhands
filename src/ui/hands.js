// Original SVG hand-shape icons. Drawn as a LEFT hand seen palm-out (thumb on the right),
// the way the student sees it in the mirrored camera view. Pass side:"right" to mirror.
const COLS = [{ x: 22, w: 11, h: 34 }, { x: 36, w: 11, h: 44 }, { x: 50, w: 11, h: 48 }, { x: 64, w: 11, h: 42 }];
// COLS is ordered pinky, ring, middle, index (left to right for a left hand).
export function handIcon({ fingers = [0, 0, 0, 0], thumb = false, side = "left", label = "", size = 72, cls = "" } = {}) {
  const ext = [fingers[3], fingers[2], fingers[1], fingers[0]]; // index..pinky -> screen order
  const top = 66;
  let s = `<svg class="hand ${cls}" viewBox="0 0 100 120" width="${size}" height="${size * 1.2}" role="img" aria-label="${label}">`;
  if (side === "right") s += `<g transform="translate(100,0) scale(-1,1)">`;
  COLS.forEach((c, i) => {
    if (ext[i]) s += `<rect class="ext" x="${c.x}" y="${top - c.h + 6}" width="${c.w}" height="${c.h + 6}" rx="5.5"/>`;
    else s += `<rect class="fold" x="${c.x}" y="${top - 4}" width="${c.w}" height="16" rx="5.5"/>`;
  });
  s += `<rect class="palm" x="18" y="${top}" width="62" height="46" rx="14"/>`;
  if (thumb) s += `<rect class="ext" x="74" y="76" width="30" height="12" rx="6" transform="rotate(-38 76 84)"/>`;
  else s += `<rect class="fold" x="58" y="82" width="22" height="12" rx="6" transform="rotate(-18 60 88)"/>`;
  if (side === "right") s += `</g>`;
  return s + `</svg>`;
}
export function shapeIcon(shape, opts = {}) {
  return handIcon({ ...shape, ...opts });
}
