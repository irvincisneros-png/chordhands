// localStorage wrapper: every access is try/catch'd; falls back to memory.
const PREFIX = "chordhands.v1.";
const mem = new Map();

export function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw != null) return JSON.parse(raw);
  } catch {}
  return mem.has(key) ? mem.get(key) : fallback;
}
export function save(key, value) {
  mem.set(key, value);
  try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEFAULT_SETTINGS = {
  keyRoot: 0, mode: "major", harmony: "classic", preset: "pad", style: "hold", arpPattern: "up", arpDiv: 2,
  bpm: 100, swapHands: false, handsMode: "two", raiseOn: false, lowerOn: false, rightLenient: false, controlsV: 2,
  reverb: 0.25, volume: 0.8, bass: true, beatOn: false, beatPattern: "pop", metronome: false, hold: false,
};
export function loadSettings() {
  const saved = load("settings", {}) || {};
  const s = { ...DEFAULT_SETTINGS, ...saved };
  // v2 = Classic control scheme: it is the default, and the old "free" harmony is now called "classic".
  if (saved.controlsV !== 2) { s.harmony = "classic"; s.controlsV = 2; }
  if (s.harmony === "free") s.harmony = "classic";
  if (s.harmony !== "classic" && s.harmony !== "diatonic") s.harmony = "classic";
  return s;
}
export function saveSettings(s) { return save("settings", s); }
export function loadBest() { return load("best", {}) || {}; }
export function saveBest(id, rec) {
  const all = loadBest();
  const prev = all[id];
  if (!prev || rec.accuracy > prev.accuracy) { all[id] = rec; save("best", all); return true; }
  return false;
}
