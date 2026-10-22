// Song picker + chord lane + Practice / Play-along / Listen modes. Lyrics: built-in only for public-domain songs; teachers can paste their own (stored in this browser).
import { SONGS, isLab } from "../songs.js";
import { buildTimeline, easyKey, SongRunner, Scorer, PracticeStepper, practiceMatch, colourOf } from "../songmode.js";
import { gestureFor, pretty, makeKey, MAJOR_ROOTS, MINOR_ROOTS, parseKey } from "../theory.js";
import { shapeForDegree } from "../gestures.js";
import { handIcon } from "./hands.js";
import { loadBest, saveBest, loadLyrics, saveLyrics } from "../storage.js";
import { lyricsForSong, hasLyrics, lyricAtBar, nextLyric, barProgress, barAtBeat, previewPairs, exportPayload, validateImport } from "../lyrics.js";

const PPB = 76; // pixels per beat in the lane
const ANCHOR = 120; // playhead x inside the lane
const DIFF = ["", "Easy", "Medium", "Hard"];
const stars = (n) => "★".repeat(n) + "☆".repeat(3 - n);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function hint(g) {
  const t = [];
  if (g.flip) t.push("flip");
  if (g.alter < 0) t.push("♭");
  if (g.alter > 0) t.push("♯");
  if (g.colour === "seventh") t.push("7th");
  if (g.colour === "dom7") t.push("dom7");
  if (g.colour === "sus2" || g.colour === "sus4") t.push("sus");
  if (g.colour === "add9") t.push("add9");
  return t.join(" · ");
}

export function createSongPanel(root, deps) {
  const overlay = deps.overlay || root; // NOW card, chips and the chord lane live over the camera stage
  const { performer, audio, drums, getSettings, setKeyOverride, announce } = deps;
  const Q = { one: (sel) => root.querySelector(sel) || overlay.querySelector(sel), all: (sel) => [...root.querySelectorAll(sel), ...(overlay === root ? [] : overlay.querySelectorAll(sel))] };
  const S = {
    tab: "songs", diff: 0, song: null, key: null, keyChoice: "orig", mode: "practice", speed: 100, loop: -1, beat: false,
    lyrics: loadLyrics(), showLyrics: getSettings().showLyrics !== false, flat: null, lyrBar: -2, tl: null, running: false, runner: null, scorer: null, stepper: null, raf: 0, timer: 0, counting: false, lastIdx: -2, finished: false, shown: -1,
  };

  // ---------------- list ----------------
  function renderList() {
    if (overlay !== root) { overlay.hidden = true; overlay.innerHTML = ""; }
    root.classList.remove("in-song");
    const best = loadBest();
    const items = SONGS.filter((s) => (S.tab === "lab" ? isLab(s) : !isLab(s))).filter((s) => !S.diff || s.difficulty === S.diff);
    root.innerHTML = `
      <div class="card songs-list">
        <div class="sl-head">
          <div class="seg" role="tablist" aria-label="Song groups">
            <button role="tab" data-tab="songs" aria-selected="${S.tab === "songs"}">Songs</button>
            <button role="tab" data-tab="lab" aria-selected="${S.tab === "lab"}">Progression Lab</button>
          </div>
          ${S.tab === "songs" ? `<div class="seg" role="group" aria-label="Difficulty">${["All", "Easy", "Medium", "Hard"].map((n, i) => `<button data-diff="${i}" aria-pressed="${S.diff === i}">${n}</button>`).join("")}</div>` : `<span class="sub">Classic progressions to learn by ear and by hand.</span>`}
        </div>
        <p class="sub">Pick one, learn the shapes, then play along. A ♪ means the song has lyrics (public-domain songs, or ones your teacher added).</p>
        <div class="song-grid">
          ${items.map((s) => `<button class="song-card" data-id="${s.id}">
              <span class="sc-title">${esc(s.title)}</span>
              <span class="sc-meta">${esc(s.artist)}${s.year ? " · " + s.year : ""}</span>
              <span class="sc-row"><span class="pill">Key ${esc(s.originalKey)}</span><span class="pill d${s.difficulty}">${DIFF[s.difficulty]}</span>${hasLyrics(s, S.lyrics) ? `<span class="pill lyr-badge" title="Has lyrics" aria-label="Has lyrics">♪</span>` : ""}<span class="sc-best" title="Best score">${best[s.id] ? stars(best[s.id].stars) + " " + best[s.id].accuracy + "%" : ""}</span></span>
            </button>`).join("") || `<p class="sub">No songs here yet.</p>`}
        </div>
      </div>`;
    Q.all("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderList(); }));
    Q.all("[data-diff]").forEach((b) => b.addEventListener("click", () => { S.diff = +b.dataset.diff; renderList(); }));
    Q.all(".song-card").forEach((b) => b.addEventListener("click", () => openSong(b.dataset.id)));
  }

  // ---------------- song view ----------------
  function currentKey() {
    if (S.keyChoice === "orig") return parseKey(S.song.originalKey);
    const [pc, mode] = S.keyChoice.split(":");
    return makeKey((mode === "minor" ? MINOR_ROOTS : MAJOR_ROOTS)[+pc], mode);
  }
  function openSong(id) {
    S.song = SONGS.find((s) => s.id === id);
    S.keyChoice = "orig"; S.loop = -1; S.finished = false;
    S.key = currentKey();
    setKeyOverride(S.key);
    renderSong();
    if (deps.onView) deps.onView();
  }
  function renderSong() {
    const s = S.song;
    root.classList.add("in-song");
    const orig = parseKey(s.originalKey);
    const names = orig.mode === "minor" ? MINOR_ROOTS : MAJOR_ROOTS;
    S.tl = buildTimeline(s, S.key);
    const keyOpts = [`<option value="orig">Original (${esc(s.originalKey)})</option>`, ...names.map((n, pc) => `<option value="${pc}:${orig.mode}">${pretty(n)}${orig.mode === "minor" ? "m" : ""}</option>`)].join("");
    root.innerHTML = `
      <div class="card song-view">
        <div class="sv-head">
          <button class="btn small" id="svBack">← All songs</button>
          <div class="sv-title"><h2>${esc(s.title)}</h2><span class="sub">${esc(s.artist)} · ${esc(s.bpm)} bpm · ${DIFF[s.difficulty]}</span></div>
          <button class="btn primary" id="svGo">Start</button>
        </div>
        <div class="sv-controls">
          <div class="seg" role="radiogroup" aria-label="Mode">
            <button role="radio" data-m="practice" aria-checked="${S.mode === "practice"}" title="Waits for the right chord before moving on">Practice</button>
            <button role="radio" data-m="play" aria-checked="${S.mode === "play"}" title="Keeps time and scores you">Play-along</button>
            <button role="radio" data-m="listen" aria-checked="${S.mode === "listen"}" title="The app plays it so you can hear it first">Listen</button>
          </div>
          <label>Key <select id="svKey">${keyOpts}</select></label>
          <button class="btn small" id="svEasy">Easy key</button>
          <label class="tempo">Speed <input type="range" id="svSpeed" min="50" max="120" step="5" value="${S.speed}"><output id="svSpeedOut">${S.speed}%</output></label>
          <label>Loop <select id="svLoop"><option value="-1">Whole song</option>${S.tl.sections.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join("")}</select></label>
          <label class="check"><input type="checkbox" id="svBeat"> Backing beat</label>
          <label class="check"><input type="checkbox" id="svLyrOn"> Show lyrics</label>
          <button class="btn small" id="svLyrics" aria-haspopup="dialog">Lyrics</button>
        </div>
        <p class="tip"><b>Tip:</b> ${esc(s.tip)}</p>
      </div>`;
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="so-top">
        <div class="now" id="svNow" aria-live="polite"></div>
        <div class="pchips" id="svChips" hidden></div>
        <div class="lyr" id="svLyr" hidden aria-live="off"></div>
        <div class="sv-live" id="svLive" aria-live="polite"></div>
      </div>
      <div class="lane" id="lane" aria-label="Chord progression"><div class="playhead"></div><div class="track" id="track"></div><div class="countin" id="countin" hidden></div></div>`;
    Q.one("#svKey").value = S.keyChoice;
    Q.one("#svLoop").value = String(S.loop);
    Q.one("#svBeat").checked = S.beat;
    Q.one("#svLyrOn").checked = S.showLyrics;
    S.flat = lyricsForSong(S.song, S.lyrics); S.lyrBar = -2;
    renderTrack();
    updateNow(0);
    Q.one("#svBack").addEventListener("click", () => { stop(); S.song = null; setKeyOverride(null); renderList(); if (deps.onView) deps.onView(); });
    Q.one("#svGo").addEventListener("click", () => (S.running ? stop(true) : start()));
    Q.all("[data-m]").forEach((b) => b.addEventListener("click", () => {
      if (S.running) return;
      S.mode = b.dataset.m;
      Q.all("[data-m]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    }));
    Q.one("#svKey").addEventListener("change", (e) => { if (S.running) stop(); S.keyChoice = e.target.value; S.key = currentKey(); setKeyOverride(S.key); renderSong(); });
    Q.one("#svEasy").addEventListener("click", () => {
      if (S.running) stop();
      const k = easyKey(S.song);
      S.keyChoice = `${k.root}:${k.mode}`; S.key = makeKey(k.rootName, k.mode); setKeyOverride(S.key); renderSong();
    });
    Q.one("#svSpeed").addEventListener("input", (e) => {
      S.speed = +e.target.value;
      Q.one("#svSpeedOut").textContent = S.speed + "%";
      if (S.runner) { S.runner.setSpeed(S.speed / 100, audio.now); drums.setBpm(S.song.bpm * S.speed / 100); audio.setBpm(S.song.bpm * S.speed / 100); }
    });
    Q.one("#svLoop").addEventListener("change", (e) => { if (S.running) stop(); S.loop = +e.target.value; });
    Q.one("#svBeat").addEventListener("change", (e) => { S.beat = e.target.checked; if (S.running && S.runner) drums.drumsOn = S.beat; });
    Q.one("#svLyrOn").addEventListener("change", (e) => { S.showLyrics = e.target.checked; if (deps.onShowLyrics) deps.onShowLyrics(S.showLyrics); S.lyrBar = -2; updateLyrics(S.running ? S.curBeat : 0, S.running ? S.curIdx : 0); });
    Q.one("#svLyrics").addEventListener("click", openLyricsEditor);
    updateLyrics(0, 0);
  }

  function renderTrack() {
    const track = Q.one("#track");
    let html = "";
    let lastSection = -1;
    for (const e of S.tl.events) {
      const g = gestureFor(e.chord, S.key, getSettings().harmony);
      const shape = shapeForDegree(g.degree);
      const first = e.sectionIndex !== lastSection; lastSection = e.sectionIndex;
      const barStart = Math.abs(e.start % S.tl.barLen) < 1e-9;
      html += `<div class="cc${barStart ? " bar" : ""}" data-i="${e.index}" style="left:${e.start * PPB}px;width:${e.dur * PPB - 6}px">
        ${first ? `<span class="sec">${esc(e.section)}</span>` : ""}
        <span class="cc-roman">${pretty(e.chord.roman)}</span>
        <span class="cc-name">${pretty(e.chord.symbol)}</span>
        ${handIcon({ ...shape, size: 30, label: "" })}
        <span class="cc-hint">${hint(g)}</span></div>`;
    }
    track.style.width = S.tl.totalBeats * PPB + "px";
    track.innerHTML = html;
  }

  function updateNow(idx) {
    const el = Q.one("#svNow");
    if (!el) return;
    const ev = S.tl.events;
    const cur = ev[Math.max(0, idx)], next = ev[Math.min(ev.length - 1, Math.max(0, idx) + 1)];
    const card = (e, label) => {
      const g = gestureFor(e.chord, S.key, getSettings().harmony);
      return `<div class="now-card"><span class="nc-label">${label}</span>${handIcon({ ...shapeForDegree(g.degree), size: 54, label: "Hand shape for " + e.chord.roman })}<span class="nc-roman">${pretty(e.chord.roman)}</span><span class="nc-name">${pretty(e.chord.symbol)}</span><span class="nc-hint">${hint(g)}</span></div>`;
    };
    el.innerHTML = card(cur, S.mode === "listen" ? "Playing" : "Now") + (next && next !== cur ? card(next, "Next") : "");
  }

  // ---------------- lyrics ----------------
  /** Current bar's lyric large (with a tempo-timed fill in Play-along / Listen), next line smaller and faded. */
  function updateLyrics(beat, idx) {
    const el = Q.one("#svLyr");
    if (!el) return;
    const on = S.showLyrics && S.flat && S.flat.some((x) => x.trim());
    el.hidden = !on;
    if (!on) return;
    const bar = S.tl.events[Math.max(0, idx)].bar;
    if (bar !== S.lyrBar) {
      S.lyrBar = bar;
      const cur = lyricAtBar(S.flat, bar), nxt = nextLyric(S.flat, bar);
      el.innerHTML = `<div class="lyr-now ${cur ? "" : "empty"}"><span class="lyr-base">${esc(cur) || "&nbsp;"}</span><span class="lyr-fill" aria-hidden="true">${esc(cur)}</span></div><div class="lyr-next">${esc(nxt) || "&nbsp;"}</div>`;
    }
    const fill = el.querySelector(".lyr-fill");
    const p = S.mode === "practice" ? 1 : barProgress(beat, S.tl.barLen);
    if (fill) fill.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(1)}% 0 0)`;
  }

  let dlg = null;
  function openLyricsEditor() {
    const s = S.song;
    if (!s) return;
    if (!dlg) { dlg = document.createElement("dialog"); dlg.className = "guide lyr-dlg"; dlg.setAttribute("aria-labelledby", "lyrTitle"); document.body.appendChild(dlg); }
    const hasBuiltIn = Array.isArray(s.lyrics);
    dlg.innerHTML = `
      <div class="dlg-head"><h2 id="lyrTitle">Lyrics: ${esc(s.title)}</h2><button class="btn small" id="lyClose">Close</button></div>
      <p class="note">Paste lyrics you have permission to use (e.g. your school's licence). They are stored only in this browser.</p>
      <p class="sub">One line per bar. Put <b>|</b> in a line to split it across two bars. A blank line means no lyric for that bar.${hasBuiltIn ? " This song has built-in public-domain lyrics; pasted lyrics replace them until you clear." : ""}</p>
      <div class="lyr-edit">
        <label class="lyr-ta"><span class="sr-only">Lyrics, one line per bar</span><textarea id="lyText" rows="12" spellcheck="false" placeholder="line one&#10;line two | line three&#10;&#10;line five"></textarea></label>
        <div class="lyr-prev" id="lyPrev" aria-label="Preview: each bar's chord and lyric"></div>
      </div>
      <div class="dlg-actions lyr-actions">
        <button class="btn primary" id="lySave">Save</button>
        <button class="btn" id="lyClear">Clear</button>
        <span class="sep"></span>
        <button class="btn" id="lyExport">Export all (.json)</button>
        <button class="btn" id="lyImport">Import (.json)</button>
        <input type="file" id="lyFile" accept=".json,application/json" hidden>
      </div>
      <p class="sub" id="lyMsg" role="status" aria-live="polite"></p>`;
    const $ = (q) => dlg.querySelector(q);
    const ta = $("#lyText"), msg = (t) => { $("#lyMsg").textContent = t; };
    ta.value = typeof S.lyrics[s.id] === "string" ? S.lyrics[s.id] : (S.flat && hasBuiltIn ? S.flat.join("\n") : "");
    const drawPrev = () => {
      $("#lyPrev").innerHTML = previewPairs(s, ta.value).map((r) => `<div class="lp-row${r.lyric ? "" : " none"}"><span class="lp-bar">${r.bar}</span><span class="lp-chord">${esc(r.chords)}</span><span class="lp-text">${esc(r.lyric) || "–"}</span></div>`).join("");
    };
    drawPrev();
    ta.addEventListener("input", drawPrev);
    const refresh = () => { S.flat = lyricsForSong(s, S.lyrics); S.lyrBar = -2; updateLyrics(S.running ? S.curBeat : 0, S.running ? S.curIdx : 0); };
    $("#lySave").addEventListener("click", () => {
      if (ta.value.trim()) S.lyrics[s.id] = ta.value; else delete S.lyrics[s.id];
      const ok = saveLyrics(S.lyrics);
      refresh();
      msg(ok ? "Saved in this browser." : "Could not save to browser storage; lyrics will last until you close the page.");
    });
    $("#lyClear").addEventListener("click", () => {
      delete S.lyrics[s.id]; saveLyrics(S.lyrics); ta.value = ""; drawPrev(); refresh(); msg("Cleared.");
    });
    $("#lyExport").addEventListener("click", () => {
      const all = { ...S.lyrics }; if (ta.value.trim()) all[s.id] = ta.value;
      const payload = exportPayload(all);
      if (!Object.keys(payload.lyrics).length) { msg("Nothing to export yet."); return; }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "chordhands-lyrics.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      msg("Exported " + Object.keys(payload.lyrics).length + " song(s).");
    });
    $("#lyImport").addEventListener("click", () => $("#lyFile").click());
    $("#lyFile").addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      if (f.size > 2e6) { msg("That file is too large."); return; }
      let text = "";
      try { text = await f.text(); } catch { msg("Could not read that file."); return; }
      const r = validateImport(text, SONGS.map((x) => x.id));
      if (!r.ok) { msg(r.error); return; }
      Object.assign(S.lyrics, r.lyrics);
      saveLyrics(S.lyrics);
      ta.value = typeof S.lyrics[s.id] === "string" ? S.lyrics[s.id] : ta.value;
      drawPrev(); refresh();
      msg("Imported lyrics for " + r.count + " song(s).");
    });
    $("#lyClose").addEventListener("click", () => dlg.close());
    dlg.showModal();
    ta.focus();
  }

  // ---------------- run ----------------
  function setCards(beatOrIdx, byIdx) {
    const track = Q.one("#track");
    if (!track) return;
    const cards = track.children;
    for (const c of cards) {
      const i = +c.dataset.i;
      c.classList.toggle("current", i === byIdx);
      c.classList.toggle("past", i < byIdx);
    }
  }
  async function start() {
    await audio.unlock();
    S.lyrBar = -2;
    S.finished = false;
    const loopSec = S.loop >= 0 ? S.tl.sections[S.loop] : null;
    const loop = loopSec ? { start: loopSec.start, end: loopSec.end } : null;
    S.running = true;
    Q.one("#svGo").textContent = "Stop";
    Q.all(".cc").forEach((c) => c.classList.remove("ok", "late", "miss", "skip", "past", "current"));
    const evs = loop ? S.tl.events.filter((e) => e.start >= loop.start - 1e-9 && e.start < loop.end - 1e-9) : S.tl.events;
    S.lastIdx = -2; S.shown = -1;
    if (S.mode === "practice") {
      S.stepper = new PracticeStepper(evs, { harmony: getSettings().harmony });
      S.runner = null;
      S.counting = false;
      S.chipSig = "";
      if (getSettings().practiceOnlyRight) performer.setGate((chord) => !S.stepper || S.stepper.done || practiceMatch(chord, S.stepper.target.chord, { harmony: getSettings().harmony }).ok);
      renderChips();
    } else {
      const sp = S.speed / 100;
      S.runner = new SongRunner(S.tl, { bpm: S.song.bpm, speed: sp, countIn: S.song.beatsPerChord, loop });
      const t0 = audio.now + 0.2;
      S.runner.start(t0);
      S.counting = true;
      drums.bpm = S.song.bpm * sp;
      audio.setBpm(S.song.bpm * sp);
      drums.beatsPerBar = S.song.beatsPerChord;
      drums.pattern = getSettings().beatPattern;
      drums.start(t0, { drums: S.beat, metronome: true });
      S.scorer = S.mode === "play" ? new Scorer(evs, { harmony: getSettings().harmony }) : null;
    }
    S.evs = evs;
    S.timer = setInterval(tick, 25);
    S.raf = requestAnimationFrame(frame);
    announce(S.mode === "practice" ? "Make the shape for each chord. It moves on when you get it right." : S.mode === "play" ? "Count-in, then play along." : "Listen to the progression.");
  }

  function tick() {
    if (!S.running) return;
    const now = performance.now();
    if (S.mode === "practice") {
      const r = S.stepper.update(now, performer.info.played);
      if (r.advanced) afterStep();
      else updateChips();
      if (S.stepper.done) finish();
      return;
    }
    const st = S.runner.state(audio.now);
    if (st.counting) return;
    if (S.counting) {
      S.counting = false;
      drums.metronome = getSettings().metronome;
      drums.drumsOn = S.beat;
      if (!S.beat && !drums.metronome) drums.stop();
    }
    if (S.mode === "listen") {
      const idx = S.runner.eventIndexAt(st.beat);
      if (idx !== S.lastIdx) { S.lastIdx = idx; performer.setExternal(S.tl.events[idx].chord); }
    } else {
      S.scorer.update(st.beat, st.pass, performer.info.chord);
      const le = S.scorer.lastRatingEvent;
      if (le && le !== S.lastShown) { S.lastShown = le; const c = Q.one(`.cc[data-i="${le.index}"]`); if (c) { c.classList.remove("ok", "late", "miss"); c.classList.add(le.rating); } liveText(le.rating); }
    }
    if (st.done) finish();
  }
  // ---------------- practice chips ----------------
  const CHIP_ORDER = ["chord", "majmin", "colour", "octave"];
  const COLOUR_NAME = { triad: "triad", inv1: "1st inv", seventh: "7th", dom7: "dom7" };
  function targetColourText(t) {
    if (t.sev == null) return "triad";
    return t.ext === "dom7" || t.ext === "dim7" ? "dom7" : "7th";
  }
  function renderChips() {
    const el = Q.one("#svChips");
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<span class="pchip" data-k="chord"><b>Chord</b><i></i></span><span class="pchip" data-k="majmin"><b>Maj/Min</b><i></i></span><span class="pchip" data-k="colour"><b>Colour</b><i></i></span><span class="pchip" data-k="octave"><b>Octave</b><i></i></span>
      <button class="btn small" id="svSkip" title="Give up on this chord and move on (counts as a skip)">Skip chord</button>`;
    el.querySelector("#svSkip").addEventListener("click", () => {
      if (!S.running || S.mode !== "practice" || S.stepper.done) return;
      S.stepper.skip(performance.now());
      afterStep();
      if (S.stepper.done) finish();
    });
    S.chipSig = "";
    updateChips();
  }
  /** Four live chips from the performer state: green = matches the target, red = does not, grey = nothing played / not needed. */
  function updateChips() {
    const el = Q.one("#svChips");
    if (!el || !S.stepper || S.stepper.done) return;
    const t = S.stepper.target.chord;
    const info = performer.info;
    const m = practiceMatch(info.played, t, { harmony: getSettings().harmony, octave: info.octave });
    const cur = info.played;
    const mark = (v) => (v === true ? "ok" : v === false ? "bad" : "idle");
    const state = m.has ? { chord: mark(m.chord), majmin: mark(m.majmin), colour: m.colourNeeded ? mark(m.colour) : "idle", octave: m.octave ? "ok" : "bad" } : { chord: "idle", majmin: "idle", colour: "idle", octave: "idle" };
    const sus = t.ext === "sus2" || t.ext === "sus4";
    const text = {
      chord: `${pretty(t.roman.replace(/(maj7|7|sus4|sus2|add9|°7|ø7|°|\+)$/, ""))} · ${pretty(t.rootName)}`,
      majmin: sus ? "any" : t.quality === "maj" || t.quality === "aug" ? "major" : "minor",
      colour: t.ext === "add9" || sus ? "any" : targetColourText(t),
      octave: "normal",
    };
    const sig = CHIP_ORDER.map((k) => state[k]).join("|") + "|" + CHIP_ORDER.map((k) => text[k]).join("|") + "|" + (cur ? colourOf(cur) : "-");
    if (sig === S.chipSig) return;
    S.chipSig = sig;
    const icon = { ok: "✓", bad: "✗", idle: "" };
    for (const k of CHIP_ORDER) {
      const c = el.querySelector(`.pchip[data-k="${k}"]`);
      if (!c) continue;
      c.className = "pchip " + state[k];
      c.querySelector("i").textContent = `${text[k]} ${icon[state[k]]}`.trim();
      c.title = k === "colour" && cur && state[k] !== "idle" ? "You are playing: " + (COLOUR_NAME[colourOf(cur)] || "other") : "";
    }
  }
  /** After the stepper moved on (matched or skipped): card marks, gate refresh, new chips. */
  function afterStep() {
    const st = S.stepper;
    const k = st.results.length - 1;
    const card = S.evs[k] && Q.one(`.cc[data-i="${S.evs[k].index}"]`);
    if (card) card.classList.add(st.results[k] === "skipped" ? "skip" : "ok");
    setCards(0, st.index < S.evs.length ? S.evs[st.index].index : 999);
    S.chipSig = "";
    if (performer.gate) performer.recompute();
    updateChips();
  }
  function liveText(r) {
    const el = Q.one("#svLive");
    if (!el) return;
    const sc = S.scorer;
    el.innerHTML = `<span class="fb ${r}">${r === "ok" ? "On time!" : r === "late" ? "A little late" : "Missed"}</span> Streak <b>${sc.streak}</b> · Best <b>${sc.bestStreak}</b>`;
  }

  function frame() {
    if (!S.running) return;
    const track = Q.one("#track");
    const cd = Q.one("#countin");
    if (!track) return;
    let beat = 0, idx = 0;
    if (S.mode === "practice") {
      idx = Math.min(S.stepper.index, S.evs.length - 1);
      beat = S.evs[idx].start;
      track.style.transition = "transform .25s ease-out";
      cd.hidden = true;
    } else {
      const st = S.runner.state(audio.now);
      beat = st.beat;
      idx = Math.max(0, S.runner.eventIndexAt(st.beat));
      track.style.transition = "none";
      if (st.counting) {
        const n = Math.ceil(-st.beat - 1e-6) ;
        cd.hidden = false;
        cd.textContent = Math.max(1, n > 0 ? S.song.beatsPerChord - n + 1 : 1);
      } else cd.hidden = true;
    }
    track.style.transform = `translateX(${ANCHOR - beat * PPB}px)`;
    S.curBeat = beat; S.curIdx = idx;
    if (idx !== S.shown) { S.shown = idx; setCards(beat, idx); updateNow(idx); }
    updateLyrics(beat, idx);
    S.raf = requestAnimationFrame(frame);
  }

  function stop(userStopped = false) {
    const was = S.running;
    S.running = false;
    clearInterval(S.timer); cancelAnimationFrame(S.raf);
    drums.stop();
    audio.setBpm(getSettings().bpm);
    performer.setExternal(null);
    performer.setGate(null);
    const chips = Q.one("#svChips");
    if (chips) chips.hidden = true;
    const go = Q.one("#svGo");
    if (go) go.textContent = "Start";
    const cd = Q.one("#countin");
    if (cd) cd.hidden = true;
    if (was && userStopped && S.mode === "play" && S.scorer && S.scorer.total > 0 && S.loop >= 0) showResults(S.scorer.result(), true);
  }

  function finish() {
    if (S.finished) return;
    S.finished = true;
    const mode = S.mode;
    const scorer = S.scorer;
    stop();
    if (mode === "play" && scorer) {
      scorer.finish(S.runner ? S.runner.state(audio.now).pass : 0);
      const res = scorer.result();
      const isBest = saveBest(S.song.id, { accuracy: res.accuracy, stars: res.stars, streak: res.bestStreak });
      showResults(res, false, isBest);
    } else if (mode === "practice") {
      showResults(null, false, false, S.stepper ? { matched: S.stepper.matched, skipped: S.stepper.skipped } : null);
    }
  }

  function showResults(res, partial, isBest, practice) {
    const dlg = document.getElementById("results");
    if (!dlg) return;
    dlg.innerHTML = res
      ? `<div class="dlg-head"><h2 id="resultsTitle">${partial ? "Loop results" : "Nice playing!"}</h2></div>
         <div class="stars" aria-label="${res.stars} of 3 stars">${stars(res.stars)}</div>
         <p class="big-num">${res.accuracy}%</p>
         <p class="sub">accuracy${isBest ? " · new best!" : ""}</p>
         <p>On time <b>${res.ok}</b> · Late <b>${res.late}</b> · Missed <b>${res.miss}</b> · Best streak <b>${res.bestStreak}</b></p>
         <div class="dlg-actions"><button class="btn primary" id="resAgain">Play again</button><button class="btn" id="resClose">Close</button></div>`
      : `<div class="dlg-head"><h2 id="resultsTitle">Practice complete</h2></div>
         <div class="stars">${stars(!practice || !practice.skipped ? 3 : practice.matched >= practice.skipped ? 2 : 1)}</div>
         <p class="big-num">${practice ? practice.matched : 0}<span class="sub"> of ${practice ? practice.matched + practice.skipped : 0} matched</span></p>
         <p>Matched <b>${practice ? practice.matched : 0}</b> · Skipped <b>${practice ? practice.skipped : 0}</b></p>
         <p>${practice && practice.skipped ? "Practise the skipped chords again, then" : "You found every chord. Next,"} try <b>Play-along</b>: it keeps time and scores you.</p>
         <div class="dlg-actions"><button class="btn primary" id="resAgain">Practice again</button><button class="btn" id="resClose">Close</button></div>`;
    dlg.showModal();
    dlg.querySelector("#resClose").addEventListener("click", () => { dlg.close(); renderList(); if (S.song) renderSong(); });
    dlg.querySelector("#resAgain").addEventListener("click", () => { dlg.close(); renderSong(); start(); });
    dlg.addEventListener("close", () => {}, { once: true });
  }

  renderList();
  return {
    show() { root.hidden = false; if (!S.song) renderList(); },
    setShowLyrics(v) { S.showLyrics = !!v; S.lyrBar = -2; const c = Q.one("#svLyrOn"); if (c) c.checked = S.showLyrics; if (S.song) updateLyrics(S.curBeat || 0, S.curIdx || 0); },
    hide() { stop(); S.song = null; setKeyOverride(null); root.hidden = true; overlay.hidden = true; },
    stop,
    get active() { return !!S.song; },
  };
}
