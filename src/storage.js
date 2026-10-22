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
  keyRoot: 0, mode: "major", harmony: "diatonic", preset: "pad", style: "hold", arpPattern: "up", arpDiv: 2,
  bpm: 100, swapHands: false, handsMode: "two", accidentals: false, rightSilent: false,
  reverb: 0.25, volume: 0.8, bass: true, beatOn: false, beatPattern: "pop", metronome: false, hold: false,
};
export function loadSettings() { return { ...DEFAULT_SETTINGS, ...(load("settings", {}) || {}) }; }
export function saveSettings(s) { return save("settings", s); }
export function loadBest() { return load("best", {}) || {}; }
export function saveBest(id, rec) {
  const all = loadBest();
  const prev = all[id];
  if (!prev || rec.accuracy > prev.accuracy) { all[id] = rec; save("best", all); return true; }
  return false;
}
