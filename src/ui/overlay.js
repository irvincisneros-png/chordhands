// Draws hand skeletons, role labels and the "lock-in" ring on a canvas laid over the video.
// The video is mirrored with CSS; the canvas is NOT, so we mirror x ourselves and text stays readable.
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export function drawOverlay(canvas, roles, labels) {
  const v = canvas.parentElement.querySelector("video");
  const w = (canvas.width = canvas.clientWidth * (window.devicePixelRatio > 1 ? 2 : 1));
  const h = (canvas.height = canvas.clientHeight * (window.devicePixelRatio > 1 ? 2 : 1));
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  if (!roles) return;
  const px = (p) => [(1 - p.x) * w, p.y * h];
  for (const role of ["left", "right"]) {
    const hand = roles[role];
    if (!hand) continue;
    const colour = role === "left" ? "#ffb454" : "#5ee6c4";
    ctx.lineWidth = Math.max(2, w / 160);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [a, b] of BONES) { const [x1, y1] = px(hand.lm[a]); const [x2, y2] = px(hand.lm[b]); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
    for (let i = 0; i < 21; i++) { const [x, y] = px(hand.lm[i]); ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 && i ? w / 120 : w / 220, 0, 7); ctx.fill(); }
    const [wx, wy] = px(hand.lm[0]);
    const lab = labels && labels[role];
    if (lab) {
      const fs = Math.max(13, w / 22);
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      const text = lab.text;
      const tw = ctx.measureText(text).width + fs;
      const tx = Math.min(w - tw - 4, Math.max(4, wx - tw / 2)), ty = Math.min(h - fs * 1.8, wy + fs * 0.6);
      ctx.fillStyle = "rgba(20,16,28,.82)";
      ctx.beginPath(); ctx.roundRect(tx, ty, tw, fs * 1.5, fs * 0.5); ctx.fill();
      ctx.fillStyle = colour;
      ctx.fillText(text, tx + fs / 2, ty + fs * 1.1);
      if (lab.progress > 0 && lab.progress < 1) {
        ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(3, w / 100);
        ctx.beginPath(); ctx.arc(wx, wy - fs * 1.2, fs * 0.8, -Math.PI / 2, -Math.PI / 2 + lab.progress * Math.PI * 2); ctx.stroke();
      }
    }
  }
}
