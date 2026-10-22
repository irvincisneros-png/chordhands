// Learn tab: step-by-step guided lesson card. Logic lives in ../tutorial.js.
import { Tutorial, STEPS } from "../tutorial.js";
import { handIcon } from "./hands.js";
import { shapeForDegree, shapeForColour } from "../gestures.js";

export function createTutorialPanel(el, { onStart, onEnd, announce }) {
  const tut = new Tutorial(STEPS, { holdMs: 500 });
  let active = false;

  function render(holdProgress = 0) {
    if (!active) { el.hidden = true; return; }
    el.hidden = false;
    if (tut.done) {
      el.innerHTML = `<div class="tut-done"><h2>Lesson complete!</h2><p>You played I, IV, iv, V, V7 and I: home, away, a darker turn, tension, and back home. Try the <b>Songs</b> tab next.</p><div class="dlg-actions"><button class="btn primary" id="tutAgain">Do it again</button><button class="btn" id="tutExit">Finish</button></div></div>`;
      el.querySelector("#tutAgain").addEventListener("click", () => { tut.reset(); render(); });
      el.querySelector("#tutExit").addEventListener("click", () => onEnd());
      return;
    }
    const s = tut.step;
    const g = s.gesture;
    const left = handIcon({ ...shapeForDegree(g.degree), size: 64, label: "Left hand shape" });
    const right = g.colour ? handIcon({ ...shapeForColour(g.colour), side: "right", size: 64, label: "Right hand shape" }) : "";
    el.innerHTML = `
      <div class="tut-head"><span class="tut-count">Step ${tut.index + 1} of ${tut.steps.length}</span><button class="btn small" id="tutExit" aria-label="Leave lesson">Leave lesson</button></div>
      <div class="tut-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${tut.steps.length}" aria-valuenow="${tut.index}"><i style="width:${(tut.index + holdProgress) / tut.steps.length * 100}%"></i></div>
      <div class="tut-body">
        <div class="tut-icons"><div><span>Left</span>${left}</div>${right ? `<div><span>Right</span>${right}</div>` : ""}</div>
        <div><h2>${s.title}</h2><p>${s.text}</p><p class="sub">Keyboard: ${s.keys}</p></div>
        <div class="tut-target" aria-hidden="true">${s.roman}</div>
      </div>`;
    el.querySelector("#tutExit").addEventListener("click", () => onEnd());
  }

  return {
    start() { tut.reset(); active = true; onStart(); render(); announce(STEPS[0].text); },
    stop() { active = false; render(); },
    /** call on every chord change and on a timer */
    update(t, chord) {
      if (!active || tut.done) return;
      const r = tut.update(t, chord);
      if (r.advanced) { render(); if (!tut.done) announce(tut.step.text); }
      else {
        const bar = el.querySelector(".tut-bar i");
        if (bar) bar.style.width = ((tut.index + r.holdProgress) / tut.steps.length) * 100 + "%";
      }
    },
    get active() { return active; },
    /** "one" | "two" | null: which hands the current step needs */
    get hands() { return active && !tut.done ? tut.hands : null; },
  };
}
