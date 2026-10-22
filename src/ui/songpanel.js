// Song picker + chord lane + Practice / Play-along / Listen modes. Chord progressions only, no lyrics.
import { SONGS, isLab } from "../songs.js";
import { buildTimeline, easyKey, SongRunner, Scorer, PracticeStepper } from "../songmode.js";
import { gestureFor, pretty, makeKey, MAJOR_ROOTS, MINOR_ROOTS, parseKey } from "../theory.js";
import { shapeForDegree } from "../gestures.js";
import { handIcon } from "./hands.js";
import { loadBest, saveBest } from "../storage.js";

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
  const { performer, audio, drums, getSettings, setKeyOverride, announce } = deps;
  const S = {
    tab: "songs", diff: 0, song: null, key: null, keyChoice: "orig", mode: "practice", speed: 100, loop: -1, beat: false,
    tl: null, running: false, runner: null, scorer: null, stepper: null, raf: 0, timer: 0, counting: false, lastIdx: -2, finished: false, shown: -1,
  };

  // ---------------- list ----------------
  function renderList() {
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
        <p class="sub">Chord progressions only. Pick one, learn the shapes, then play along.</p>
        <div class="song-grid">
          ${items.map((s) => `<button class="song-card" data-id="${s.id}">
              <span class="sc-title">${esc(s.title)}</span>
              <span class="sc-meta">${esc(s.artist)}${s.year ? " · " + s.year : ""}</span>
              <span class="sc-row"><span class="pill">Key ${esc(s.originalKey)}</span><span class="pill d${s.difficulty}">${DIFF[s.difficulty]}</span><span class="sc-best" title="Best score">${best[s.id] ? stars(best[s.id].stars) + " " + best[s.id].accuracy + "%" : ""}</span></span>
            </button>`).join("") || `<p class="sub">No songs here yet.</p>`}
        </div>
      </div>`;
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderList(); }));
    root.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", () => { S.diff = +b.dataset.diff; renderList(); }));
    root.querySelectorAll(".song-card").forEach((b) => b.addEventListener("click", () => openSong(b.dataset.id)));
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
  }
  function renderSong() {
    const s = S.song;
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
        </div>
        <div class="now" id="svNow" aria-live="polite"></div>
        <div class="lane" id="lane" aria-label="Chord progression"><div class="playhead"></div><div class="track" id="track"></div><div class="countin" id="countin" hidden></div></div>
        <p class="tip"><b>Tip:</b> ${esc(s.tip)}</p>
        <div class="sv-live" id="svLive" aria-live="polite"></div>
      </div>`;
    root.querySelector("#svKey").value = S.keyChoice;
    root.querySelector("#svLoop").value = String(S.loop);
    root.querySelector("#svBeat").checked = S.beat;
    renderTrack();
    updateNow(0);
    root.querySelector("#svBack").addEventListener("click", () => { stop(); S.song = null; setKeyOverride(null); renderList(); });
    root.querySelector("#svGo").addEventListener("click", () => (S.running ? stop(true) : start()));
    root.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
      if (S.running) return;
      S.mode = b.dataset.m;
      root.querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    }));
    root.querySelector("#svKey").addEventListener("change", (e) => { if (S.running) stop(); S.keyChoice = e.target.value; S.key = currentKey(); setKeyOverride(S.key); renderSong(); });
    root.querySelector("#svEasy").addEventListener("click", () => {
      if (S.running) stop();
      const k = easyKey(S.song);
      S.keyChoice = `${k.root}:${k.mode}`; S.key = makeKey(k.rootName, k.mode); setKeyOverride(S.key); renderSong();
    });
    root.querySelector("#svSpeed").addEventListener("input", (e) => {
      S.speed = +e.target.value;
      root.querySelector("#svSpeedOut").textContent = S.speed + "%";
      if (S.runner) { S.runner.setSpeed(S.speed / 100, audio.now); drums.setBpm(S.song.bpm * S.speed / 100); audio.setBpm(S.song.bpm * S.speed / 100); }
    });
    root.querySelector("#svLoop").addEventListener("change", (e) => { if (S.running) stop(); S.loop = +e.target.value; });
    root.querySelector("#svBeat").addEventListener("change", (e) => { S.beat = e.target.checked; if (S.running && S.runner) drums.drumsOn = S.beat; });
  }

  function renderTrack() {
    const track = root.querySelector("#track");
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
    const el = root.querySelector("#svNow");
    if (!el) return;
    const ev = S.tl.events;
    const cur = ev[Math.max(0, idx)], next = ev[Math.min(ev.length - 1, Math.max(0, idx) + 1)];
    const card = (e, label) => {
      const g = gestureFor(e.chord, S.key, getSettings().harmony);
      return `<div class="now-card"><span class="nc-label">${label}</span>${handIcon({ ...shapeForDegree(g.degree), size: 54, label: "Hand shape for " + e.chord.roman })}<span class="nc-roman">${pretty(e.chord.roman)}</span><span class="nc-name">${pretty(e.chord.symbol)}</span><span class="nc-hint">${hint(g)}</span></div>`;
    };
    el.innerHTML = card(cur, S.mode === "listen" ? "Playing" : "Now") + (next && next !== cur ? card(next, "Next") : "");
  }

  // ---------------- run ----------------
  function setCards(beatOrIdx, byIdx) {
    const track = root.querySelector("#track");
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
    S.finished = false;
    const loopSec = S.loop >= 0 ? S.tl.sections[S.loop] : null;
    const loop = loopSec ? { start: loopSec.start, end: loopSec.end } : null;
    S.running = true;
    root.querySelector("#svGo").textContent = "Stop";
    root.querySelectorAll(".cc").forEach((c) => c.classList.remove("ok", "late", "miss", "past", "current"));
    const evs = loop ? S.tl.events.filter((e) => e.start >= loop.start - 1e-9 && e.start < loop.end - 1e-9) : S.tl.events;
    S.lastIdx = -2; S.shown = -1;
    if (S.mode === "practice") {
      S.stepper = new PracticeStepper(evs);
      S.runner = null;
      S.counting = false;
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
      S.scorer = S.mode === "play" ? new Scorer(evs) : null;
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
      const r = S.stepper.update(now, performer.info.chord);
      if (r.advanced) setCards(0, S.stepper.index < S.evs.length ? S.evs[S.stepper.index].index : 999);
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
      if (le && le !== S.lastShown) { S.lastShown = le; const c = root.querySelector(`.cc[data-i="${le.index}"]`); if (c) { c.classList.remove("ok", "late", "miss"); c.classList.add(le.rating); } liveText(le.rating); }
    }
    if (st.done) finish();
  }
  function liveText(r) {
    const el = root.querySelector("#svLive");
    if (!el) return;
    const sc = S.scorer;
    el.innerHTML = `<span class="fb ${r}">${r === "ok" ? "On time!" : r === "late" ? "A little late" : "Missed"}</span> Streak <b>${sc.streak}</b> · Best <b>${sc.bestStreak}</b>`;
  }

  function frame() {
    if (!S.running) return;
    const track = root.querySelector("#track");
    const cd = root.querySelector("#countin");
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
    if (idx !== S.shown) { S.shown = idx; setCards(beat, idx); updateNow(idx); }
    S.raf = requestAnimationFrame(frame);
  }

  function stop(userStopped = false) {
    const was = S.running;
    S.running = false;
    clearInterval(S.timer); cancelAnimationFrame(S.raf);
    drums.stop();
    audio.setBpm(getSettings().bpm);
    performer.setExternal(null);
    const go = root.querySelector("#svGo");
    if (go) go.textContent = "Start";
    const cd = root.querySelector("#countin");
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
      showResults(null, false);
    }
  }

  function showResults(res, partial, isBest) {
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
         <div class="stars">★★★</div>
         <p>You found every chord. Try <b>Play-along</b> next: it keeps time and scores you.</p>
         <div class="dlg-actions"><button class="btn primary" id="resAgain">Practice again</button><button class="btn" id="resClose">Close</button></div>`;
    dlg.showModal();
    dlg.querySelector("#resClose").addEventListener("click", () => { dlg.close(); renderList(); if (S.song) renderSong(); });
    dlg.querySelector("#resAgain").addEventListener("click", () => { dlg.close(); renderSong(); start(); });
    dlg.addEventListener("close", () => {}, { once: true });
  }

  renderList();
  return {
    show() { root.hidden = false; if (!S.song) renderList(); },
    hide() { stop(); S.song = null; setKeyOverride(null); root.hidden = true; },
    stop,
    get active() { return !!S.song; },
  };
}
