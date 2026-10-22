// Theme: "system" | "light" | "dark". Sets <html data-theme="light|dark"> (the inline script in index.html does the same before first paint).
const KEY = "chordhands.v1.theme";
export const THEMES = ["system", "light", "dark"];
export const normalizeTheme = (t) => (THEMES.includes(t) ? t : "system");
export const resolveTheme = (pref, systemDark) => (pref === "light" ? "light" : pref === "dark" ? "dark" : systemDark ? "dark" : "light");

export function loadTheme() {
  try { return normalizeTheme(JSON.parse(window.localStorage.getItem(KEY))); } catch { return "system"; }
}
function saveTheme(t) { try { window.localStorage.setItem(KEY, JSON.stringify(t)); } catch {} }

export function initTheme(onChange) {
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let pref = loadTheme();
  const apply = () => {
    const eff = resolveTheme(pref, !!(mq && mq.matches));
    const root = document.documentElement;
    root.dataset.theme = eff;
    root.dataset.themePref = pref;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", eff === "dark" ? "#15111f" : "#f7f1e6");
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.themeSet === pref)));
    document.querySelectorAll("select[data-theme-select]").forEach((s) => { s.value = pref; });
    if (onChange) onChange(eff, pref);
  };
  const set = (t) => { pref = normalizeTheme(t); saveTheme(pref); apply(); };
  if (mq) (mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply));
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => set(b.dataset.themeSet)));
  document.querySelectorAll("select[data-theme-select]").forEach((s) => s.addEventListener("change", () => set(s.value)));
  window.addEventListener("storage", (e) => { if (e.key === KEY) { pref = loadTheme(); apply(); } });
  apply();
  return { set, get pref() { return pref; } };
}
