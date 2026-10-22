// ChordHands: wires audio, input, camera and UI together.
import { keyFromPc, keyChords, makeKey, MAJOR_ROOTS, MINOR_ROOTS, pretty } from "./theory.js";
import { AudioEngine, PRESET_LIST, STYLE_LIST } from "./audio.js";
import { Drums, PATTERN_LIST } from "./drums.js";
import { Performer } from "./performer.js";
import { GestureTracker, assignHands } from "./gestures.js";
import { HandCamera, friendlyCameraError } from "./camera.js";
import { Recorder } from "./recorder.js";
import { loadSettings, saveSettings } from "./storage.js";
import { createPad } from "./ui/pad.js";
import { createPiano } from "./ui/piano.js";
import { renderStaff } from "./ui/staff.js";
import { renderGuide } from "./ui/guide.js";
import { drawOverlay } from "./ui/overlay.js";
import { createSongPanel } from "./ui/songpanel.js";
import { createTutorialPanel } from "./ui/tutorialpanel.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const settings = loadSettings();
const persist = () => saveSettings(settings);

// ---------------- core objects ----------------
const audio = new AudioEngine();
const drums = new Drums(audio);
let keyOverride = null;
let mode = "play";
const baseKey = () => keyFromPc(settings.keyRoot, settings.mode);
const effKey = () => keyOverride || baseKey();
const effHarmony = () => (mode === "learn" ? "diatonic" : settings.harmony);
const performer = new Performer(audio, { key: effKey(), harmony: effHarmony() });
const tracker = new GestureTracker();
const cam = new HandCamera();
const recorder = new Recorder();
const announceEl = document.createElement("div");
announceEl.className = "sr-only"; announceEl.setAttribute("aria-live", "polite");
document.body.appendChild(announceEl);
const announce = (t) => { announceEl.textContent = ""; setTimeout(() => (announceEl.textContent = t), 30); };

// ---------------- banner ----------------
function banner(msg) { $("#bannerText").textContent = msg; $("#banner").hidden = !msg; }
$("#bannerClose").addEventListener("click", () => banner(""));

// ---------------- audio unlock ----------------
async function unlock() {
  const ok = await audio.unlock();
  if (ok) { $("#audioHint").hidden = true; applySettingsToAudio(); }
}
for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { capture: true, passive: true });
function applySettingsToAudio() {
  audio.setPreset(settings.preset); audio.style = settings.style;
  audio.arpPattern = settings.arpPattern; audio.arpDiv = settings.arpDiv; audio.bassOn = settings.bass;
  audio.setBpm(settings.bpm); audio.setVolume(settings.volume); audio.setReverb(settings.reverb);
}
audio.preset = settings.preset; audio.style = settings.style; audio.arpPattern = settings.arpPattern;
audio.arpDiv = settings.arpDiv; audio.bassOn = settings.bass; audio.bpm = settings.bpm;
audio.volume = settings.volume; audio.reverbAmt = settings.reverb;

// ---------------- display ----------------
const piano = createPiano($("#piano"));
const pad = createPad($("#padGrid"), (d) => (d ? performer.press("pad", d) : performer.release("pad")));
renderStaff($("#staff"), null);

function refreshKeyUI() {
  const key = effKey();
  const chords = keyChords(key, effHarmony());
  pad.update(chords);
  $("#padKey").textContent = "· " + pretty(key.name.replace(/m$/, "")) + (key.mode === "minor" ? " minor" : " major");
  $("#keyLine").innerHTML = chords.map((c, i) => `<span data-d="${i + 1}" style="--c:var(--deg${i + 1})">${pretty(c.symbol)}</span>`).join("");
}
function showChord(info) {
  const c = info.chord;
  $("#chordRoman").textContent = c ? pretty(c.roman) : "–";
  $("#chordName").textContent = c ? pretty(c.symbol) : "Rest";
  $("#chordNotes").textContent = c ? info.voiced.notes.map((n) => pretty(n.name)).join("  ") : "Make a shape, or press 1 – 7";
  $("#chordBig").style.setProperty("--c", c ? `var(--deg${c.degree})` : "var(--muted)");
  $("#chordBig").classList.toggle("sounding", !!c);
  piano.show(c ? info.voiced.notes : null);
  renderStaff($("#staff"), c ? info.voiced.notes : null);
  pad.highlight(c && !c.alter ? c.degree : 0);
  $$("#keyLine span").forEach((s) => s.classList.toggle("on", !!c && !c.alter && +s.dataset.d === c.degree && s.textContent === pretty(c.symbol)));
  syncChips();
}
performer.onChange((info) => {
  showChord(info);
  recorder.push(info.chord);
  tutorial.update(performance.now(), info.chord);
});
setInterval(() => { if (tutorial.active) tutorial.update(performance.now(), performer.info.chord); }, 80);

// ---------------- settings UI ----------------
function fill(sel, list) { sel.innerHTML = list.map((o) => `<option value="${o.id}">${o.name}</option>`).join(""); }
fill($('[data-setting="preset"]'), PRESET_LIST);
fill($('[data-setting="style"]'), STYLE_LIST);
fill($('[data-setting="beatPattern"]'), PATTERN_LIST);
function fillKeys() {
  const names = settings.mode === "minor" ? MINOR_ROOTS : MAJOR_ROOTS;
  $("#selKey").innerHTML = names.map((n, i) => `<option value="${i}">${pretty(n)}${settings.mode === "minor" ? " minor" : " major"}</option>`).join("");
  $("#selKey").value = String(settings.keyRoot);
}
fillKeys();
function syncArpRows() { $$(".arp-only").forEach((l) => (l.hidden = settings.style !== "arp")); }

$$("[data-setting]").forEach((el) => {
  const name = el.dataset.setting;
  if (el.type === "checkbox") el.checked = !!settings[name]; else el.value = String(settings[name]);
  const out = $(`[data-out="${name}"]`);
  if (out) out.textContent = settings[name];
  const handler = () => {
    let v = el.type === "checkbox" ? el.checked : el.type === "range" || el.hasAttribute("data-number") ? Number(el.value) : el.value;
    settings[name] = v;
    if (out) out.textContent = v;
    applySetting(name, v);
    persist();
  };
  el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", handler);
});
function applySetting(name, v) {
  switch (name) {
    case "preset": audio.setPreset(v); break;
    case "style": audio.setStyle(v); syncArpRows(); break;
    case "arpPattern": audio.arpPattern = v; break;
    case "arpDiv": audio.arpDiv = v; break;
    case "volume": audio.setVolume(v); break;
    case "reverb": audio.setReverb(v); break;
    case "bass": audio.bassOn = v; break;
    case "keyRoot": case "mode":
      if (name === "mode") fillKeys();
      performer.setKey(effKey()); refreshKeyUI(); showChord(performer.info); break;
    case "harmony": performer.setHarmony(effHarmony()); refreshKeyUI(); break;
    case "bpm": audio.setBpm(v); drums.setBpm(v); break;
    case "beatOn": case "beatPattern": case "metronome": applyBeat(); break;
    default: break;
  }
}
syncArpRows();

function applyBeat() {
  drums.pattern = settings.beatPattern;
  if (mode === "songs" || !(settings.beatOn || settings.metronome)) { if (mode !== "songs") drums.stop(); return; }
  if (!audio.ctx) { audio.unlock().then(applyBeat); return; }
  drums.bpm = settings.bpm; drums.beatsPerBar = 4;
  drums.drumsOn = settings.beatOn; drums.metronome = settings.metronome;
  if (!drums.running) drums.start(undefined, { drums: settings.beatOn, metronome: settings.metronome });
}

// ---------------- chord pad tools ----------------
const colourMap = { triad: "triad", inv1: "inv1", seventh: "seventh", dom7: "dom7", sus4: "sus4", add9: "add9" };
function syncChips() {
  const cur = performer.colourName;
  $$("[data-colour]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.colour === cur)));
  $("#btnFlip").setAttribute("aria-pressed", String(performer.flipToggle));
  $("#btnFlat").setAttribute("aria-pressed", String(performer.alterToggle < 0));
  $("#btnSharp").setAttribute("aria-pressed", String(performer.alterToggle > 0));
  $("#btnHold").setAttribute("aria-pressed", String(performer.hold));
}
function setColour(c) {
  if (c !== "triad" && performer.colourName === c) c = "triad"; // toggle off
  performer.colourButton(colourMap[c]);
  syncChips();
}
$$("[data-colour]").forEach((b) => b.addEventListener("click", (e) => { setColour(b.dataset.colour); if (e.detail) b.blur(); }));
$("#btnFlip").addEventListener("click", (e) => { performer.setFlipToggle(!performer.flipToggle); syncChips(); if (e.detail) e.currentTarget.blur(); });
$("#btnFlat").addEventListener("click", (e) => { performer.setAlterToggle(performer.alterToggle < 0 ? 0 : -1); syncChips(); if (e.detail) e.currentTarget.blur(); });
$("#btnSharp").addEventListener("click", (e) => { performer.setAlterToggle(performer.alterToggle > 0 ? 0 : 1); syncChips(); if (e.detail) e.currentTarget.blur(); });
$("#btnOctDown").addEventListener("click", (e) => { performer.setOctave(performer.manual.octave - 1); if (e.detail) e.currentTarget.blur(); });
$("#btnOctUp").addEventListener("click", (e) => { performer.setOctave(performer.manual.octave + 1); if (e.detail) e.currentTarget.blur(); });
$("#btnHold").addEventListener("click", (e) => { settings.hold = !performer.hold; performer.setHold(settings.hold); persist(); syncChips(); pad.releaseAll(); if (e.detail) e.currentTarget.blur(); });
$("#btnStrum").addEventListener("pointerdown", () => performer.strum());
$("#btnStrum").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); performer.strum(); } });
performer.hold = !!settings.hold;

// ---------------- keyboard ----------------
const keysDown = [];
const COLOUR_KEYS = { KeyQ: "triad", KeyW: "inv1", KeyE: "seventh", KeyR: "dom7", KeyT: "sus4", KeyY: "add9" };
function degreeOf(code) {
  const m = /^(?:Digit|Numpad)([1-7])$/.exec(code);
  return m ? +m[1] : 0;
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.closest && t.closest("dialog[open]")) return;
  if (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type !== "checkbox" && t.type !== "range")) return;
  if (t.tagName === "SELECT") return;
  const d = degreeOf(e.code);
  if (d) {
    e.preventDefault();
    if (e.repeat) return;
    const i = keysDown.indexOf(d); if (i >= 0) keysDown.splice(i, 1);
    keysDown.push(d);
    performer.press("keys", d, e.shiftKey);
    return;
  }
  if (e.key === "Shift") { if (keysDown.length) performer.setLayerFlip("keys", true); return; }
  if (COLOUR_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) setColour(COLOUR_KEYS[e.code]); return; }
  switch (e.code) {
    case "KeyZ": performer.setOctave(performer.manual.octave - 1); break;
    case "KeyX": performer.setOctave(performer.manual.octave + 1); break;
    case "Comma": performer.stepInversion(-1); break;
    case "Period": performer.stepInversion(1); break;
    case "Space":
      if (t.closest && t.closest(".pad-btn")) return;
      if (["BUTTON", "SUMMARY", "INPUT", "A"].includes(t.tagName)) return;
      e.preventDefault(); if (!e.repeat) performer.strum(); break;
    case "KeyP": setProjector(!document.body.classList.contains("projector")); break;
    case "KeyH": openGuide(); break;
    case "Slash": if (e.key === "?") openGuide(); break;
    case "Escape": if (document.body.classList.contains("projector")) setProjector(false); else { performer.stopAll(); } break;
    default: break;
  }
});
window.addEventListener("keyup", (e) => {
  const d = degreeOf(e.code);
  if (d) {
    const i = keysDown.indexOf(d); if (i >= 0) keysDown.splice(i, 1);
    if (keysDown.length) performer.press("keys", keysDown[keysDown.length - 1], e.shiftKey);
    else performer.release("keys");
  } else if (e.key === "Shift" && keysDown.length) performer.setLayerFlip("keys", false);
});
window.addEventListener("blur", () => { keysDown.length = 0; performer.release("keys"); pad.releaseAll(); });

// ---------------- guide / projector ----------------
const guide = $("#guide");
renderGuide(guide);
function openGuide() { if (!guide.open) guide.showModal(); }
$("#btnGuide").addEventListener("click", openGuide);
function setProjector(on) {
  document.body.classList.toggle("projector", on);
  $("#btnProjector").setAttribute("aria-pressed", String(on));
  announce(on ? "Projector mode on. Press P or Escape to exit." : "Projector mode off.");
}
$("#btnProjector").addEventListener("click", () => setProjector(!document.body.classList.contains("projector")));
$("#btnPanel").addEventListener("click", (e) => {
  const open = $("#side").classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", String(open));
});

// ---------------- camera ----------------
const video = $("#video");
let camOn = false;
const liveEl = $("#camLive");
function camStatus(msg) { const el = $("#camStatus"); el.textContent = msg; el.hidden = !msg; }
async function startCamera() {
  const btn = $("#btnCamera");
  btn.disabled = true;
  await unlock();
  banner("");
  try {
    await cam.start(video, camStatus);
    camOn = true;
    $("#camBox").classList.add("on");
    $("#camBox").style.aspectRatio = `${video.videoWidth || 4} / ${video.videoHeight || 3}`;
    $("#camEmpty").hidden = true;
    btn.textContent = "Stop camera"; btn.setAttribute("aria-pressed", "true");
    performer.setGestureEnabled(true);
    liveEl.hidden = false;
    announce("Camera on. Show your left hand to choose chords.");
  } catch (err) {
    camStatus("");
    banner(friendlyCameraError(err));
    camOn = false;
  } finally { btn.disabled = false; }
}
function stopCamera() {
  cam.stop(); camOn = false;
  $("#camBox").classList.remove("on");
  $("#camEmpty").hidden = false;
  liveEl.hidden = true; camStatus("");
  drawOverlay($("#overlay"), null);
  $("#btnCamera").textContent = "Start camera"; $("#btnCamera").setAttribute("aria-pressed", "false");
  performer.setGestureEnabled(false);
  tracker.leftStab.stable = "none"; tracker.rightStab.stable = "triad";
}
$("#btnCamera").addEventListener("click", () => (camOn ? stopCamera() : startCamera()));
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const COLOUR_NAME = { mute: "mute", triad: "triad", inv1: "1st inv", seventh: "7th", dom7: "dom 7" };
cam.onFrame = ({ hands, t, aspect, fps }) => {
  const one = settings.handsMode === "one";
  tracker.configure({ aspect, oneHanded: one, rightSilent: settings.rightSilent, accidentals: settings.accidentals });
  const roles = assignHands(hands, { swap: settings.swapHands, oneHanded: one });
  const out = tracker.update(t, roles);
  performer.setGesture(out);
  if (out.strum) performer.strum();
  const L = out.info.left, R = out.info.right;
  const labels = {};
  if (L.present) labels.left = { text: "Chord " + (L.degree === 0 ? "rest" : L.degree == null ? "?" : ROMAN[L.degree - 1]) + (L.flip && L.degree ? " (minor flip)" : ""), progress: out.progress.left };
  if (R.present) labels.right = { text: "Colour " + (COLOUR_NAME[["mute", "triad", "inv1", "seventh", "dom7"][R.count]] || "") + (R.thumb ? " · oct ↓" : ""), progress: out.progress.right };
  drawOverlay($("#overlay"), roles, labels);
  const sideName = (r) => (r && r.present ? r.physical : "");
  liveEl.innerHTML = hands.length
    ? `<span>Chord hand: ${L.present ? `${L.count + (L.thumb ? "+thumb" : "")} fingers` : "none"}</span><span>Colour hand: ${one ? "off" : R.present ? R.count + " fingers" : "none"}</span><span>${fps || 0} fps ${cam.delegate}</span>`
    : `<span>No hands in view. Hold them up, palms to the camera.</span><span>${fps || 0} fps ${cam.delegate}</span>`;
  void sideName;
};

// ---------------- recorder ----------------
let playTimers = [];
$("#recStart").addEventListener("click", () => {
  if (recorder.recording) {
    recorder.stop();
    $("#recStart").textContent = "Record";
    const txt = recorder.toText();
    $("#recText").textContent = txt || "Nothing recorded.";
    $("#recPlay").disabled = $("#recCopy").disabled = !txt;
  } else {
    recorder.start(); recorder.push(performer.info.chord);
    $("#recStart").textContent = "Stop recording";
    $("#recText").textContent = "Recording… play some chords.";
    $("#recPlay").disabled = $("#recCopy").disabled = true;
  }
});
$("#recPlay").addEventListener("click", () => {
  if (playTimers.length) { playTimers.forEach(clearTimeout); playTimers = []; performer.setExternal(null); $("#recPlay").textContent = "Play back"; return; }
  $("#recPlay").textContent = "Stop playback";
  for (const ev of recorder.events) playTimers.push(setTimeout(() => performer.setExternal(ev.chord ? { ...ev.chord, inversion: "auto" } : null), ev.t));
  playTimers.push(setTimeout(() => { playTimers = []; performer.setExternal(null); $("#recPlay").textContent = "Play back"; }, recorder.duration + 400));
});
$("#recCopy").addEventListener("click", async () => {
  const txt = recorder.toText();
  try { await navigator.clipboard.writeText(txt); $("#recCopy").textContent = "Copied!"; }
  catch { const r = document.createRange(); r.selectNodeContents($("#recText")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("#recCopy").textContent = "Select + copy"; }
  setTimeout(() => ($("#recCopy").textContent = "Copy chords"), 1600);
});

// ---------------- songs / learn ----------------
function setKeyOverride(k) {
  keyOverride = k;
  performer.setKey(effKey());
  refreshKeyUI();
  showChord(performer.info);
}
const songs = createSongPanel($("#songView"), { performer, audio, drums, getSettings: () => ({ ...settings, harmony: effHarmony() }), setKeyOverride, announce });
const tutorial = createTutorialPanel($("#tutorialCard"), {
  onStart() { setKeyOverride(makeKey("C")); performer.setHarmony("diatonic"); refreshKeyUI(); },
  onEnd() { setMode("play"); },
  announce,
});

function setMode(m) {
  if (m === mode && !(m === "songs" && songs.active)) { /* re-select: fall through to refresh */ }
  const prev = mode;
  if (prev === "songs") songs.hide();
  if (prev === "learn") { tutorial.stop(); setKeyOverride(null); }
  mode = m;
  performer.stopAll();
  document.body.dataset.mode = m;
  $$(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
  $("#stageView").hidden = m === "songs";
  $("#songView").hidden = m !== "songs";
  $("#recorderCard").hidden = m !== "play";
  if (m === "songs") { drums.stop(); songs.show(); }
  else applyBeat();
  if (m === "learn") tutorial.start();
  performer.setHarmony(effHarmony());
  refreshKeyUI();
}
$$(".tabs [role=tab]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
$(".tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const tabs = $$(".tabs [role=tab]");
  const i = tabs.indexOf(document.activeElement);
  const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  n.focus(); n.click();
});

// ---------------- boot ----------------
refreshKeyUI();
showChord(performer.info);
syncChips();
$("#stageView").hidden = false;
$("#songView").hidden = true;
$("#tutorialCard").hidden = true;
