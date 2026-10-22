// Theremin view: big note + cents, vertical pitch ruler with the key's scale notes, volume level, and a
// mouse / touch pad (pointer x = pitch, y = volume). Drives audio.thereminSet; camera readings come in via setCamera().
import { THEREMIN, rulerTicks, thereminFromPad, unitFromHz, formatCents } from "../theremin.js";
import { pretty } from "../theory.js";

export function createThereminPanel(root, { audio, getKey, getSettings }) {
  const q = (s) => root.querySelector(s);
  const ruler = q("#thRuler"), marker = q("#thMarker"), pad = q("#thPad"), dot = q("#thDot");
  let active = false, cam = null, padReading = null;

  function buildRuler() {
    for (const n of [...ruler.querySelectorAll(".th-tick")]) n.remove();
    const frag = document.createDocumentFragment();
    for (const t of rulerTicks(getKey())) {
      const d = document.createElement("div");
      d.className = "th-tick" + (t.root ? " root" : "");
      d.style.bottom = t.pos * 100 + "%";
      d.innerHTML = `<span>${pretty(t.name)}</span>`;
      frag.appendChild(d);
    }
    ruler.insertBefore(frag, marker);
  }

  function show(r) {
    const gate = !!(r && r.gate);
    const n = r && r.note;
    q("#thNote").textContent = n ? pretty(n.name) : "–";
    q("#thCents").textContent = n ? (r.snapped ? "snapped to key" : formatCents(n.cents)) : "";
    q("#thHz").textContent = n ? Math.round(r.hz) + " Hz" : "";
    q("#thReadout").classList.toggle("off", !gate);
    q("#thReadout").classList.toggle("snapped", !!(r && r.snapped));
    marker.style.bottom = (r && r.hz ? unitFromHz(r.hz) * 100 : 0) + "%";
    marker.hidden = !(r && r.hz);
    marker.classList.toggle("on", gate);
    const v = r ? r.volume : 0;
    q("#thVol").style.width = Math.round(v * 100) + "%";
    q("#thVolOut").textContent = Math.round(v * 100) + "%";
    q("#thHint").textContent = !r || !r.hz
      ? "Show both hands: right hand height = pitch, left hand height = volume."
      : gate ? "" : v <= THEREMIN.gateVolume ? "Raise the volume hand to hear it." : "Show both hands to hear it.";
  }

  function apply() {
    const r = active ? padReading || cam : null;
    if (!active) { audio.thereminStop(); return; }
    show(r);
    if (!r) { audio.thereminSet({ on: false, tc: { pitch: THEREMIN.pitchTc, volume: THEREMIN.volumeTc } }); return; }
    audio.thereminSet({ hz: r.hz, level: r.volume * THEREMIN.gain, on: r.gate, tc: r.tc, type: getSettings().thereminVoice });
  }

  // ---- pointer pad
  const read = (e) => {
    const b = pad.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width));
    const y = Math.min(1, Math.max(0, (e.clientY - b.top) / b.height));
    dot.style.left = x * 100 + "%"; dot.style.top = y * 100 + "%"; dot.hidden = false;
    padReading = thereminFromPad(x, y, { snap: getSettings().thereminSnap, key: getKey() });
    apply();
  };
  pad.addEventListener("pointerdown", (e) => { pad.setPointerCapture(e.pointerId); pad.classList.add("down"); read(e); });
  pad.addEventListener("pointermove", (e) => { if (padReading) read(e); });
  const up = () => { padReading = null; pad.classList.remove("down"); dot.hidden = true; apply(); };
  pad.addEventListener("pointerup", up);
  pad.addEventListener("pointercancel", up);
  pad.addEventListener("lostpointercapture", () => { if (padReading) up(); });

  buildRuler();
  show(null);
  return {
    get active() { return active; },
    setActive(on) { active = on; if (!on) { padReading = null; cam = null; } apply(); },
    /** reading from thereminFromHands(), or null when the camera is off */
    setCamera(r) { cam = r; if (active && !padReading) apply(); },
    refreshKey() { buildRuler(); },
  };
}
