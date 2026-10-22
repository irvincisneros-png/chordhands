// Big chord pad: 7 buttons. Pointer down = play, up = release. Multi-touch safe; keyboard (Enter/Space) too.
import { pretty } from "../theory.js";

export function createPad(grid, onChange) {
  const down = new Map(); // pointerId (or "k"+degree) -> degree
  const order = []; // pointer ids in press order
  const fire = () => {
    const last = order.length ? down.get(order[order.length - 1]) : 0;
    onChange(last || 0);
  };
  const press = (id, d) => { down.set(id, d); order.push(id); fire(); };
  const lift = (id) => {
    if (!down.has(id)) return;
    down.delete(id);
    order.splice(order.indexOf(id), 1);
    fire();
  };
  const btns = [];
  for (let d = 1; d <= 7; d++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pad-btn";
    b.dataset.degree = d;
    b.style.setProperty("--c", `var(--deg${d})`);
    b.innerHTML = `<span class="pb-roman"></span><span class="pb-name"></span><span class="pb-notes"></span><kbd>${d}</kbd>`;
    b.addEventListener("pointerdown", (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch {}
      press(e.pointerId, d);
    });
    const up = (e) => lift(e.pointerId);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("lostpointercapture", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    b.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); press("k" + d, d); }
    });
    b.addEventListener("keyup", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); lift("k" + d); } });
    b.addEventListener("blur", () => lift("k" + d));
    grid.appendChild(b);
    btns.push(b);
  }
  return {
    update(chords) {
      chords.forEach((c, i) => {
        const b = btns[i];
        b.querySelector(".pb-roman").textContent = pretty(c.roman);
        b.querySelector(".pb-name").textContent = pretty(c.symbol);
        b.querySelector(".pb-notes").textContent = c.noteNames.map(pretty).join(" ");
        b.setAttribute("aria-label", `${c.roman}, ${c.symbol}, notes ${c.noteNames.join(" ")}`);
      });
    },
    highlight(degree) { btns.forEach((b, i) => b.classList.toggle("on", degree === i + 1)); },
    releaseAll() { [...order].forEach((id) => lift(id)); },
  };
}
