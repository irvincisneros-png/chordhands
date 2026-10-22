# ChordHands — spec

An original, school-friendly "play chords with your hands" web app for music classes. Inspired by the
*concept* of Gesture Synth (indecisive.eric) — **no code, text, logo, or styling copied from it**.

## Why it exists
Students can't reach the original (blocked host / CDNs). ChordHands is fully self-hosted: every library,
the WASM runtime and the hand model live in this repo, so one allowed domain (GitHub Pages) is enough.
It also works with **no camera at all** (keyboard, mouse, touch), because many school devices block it.

## Tech
- No build step. Vanilla ES modules, `index.html` + `src/*.js` + `styles.css`. Serve statically.
- Hand tracking: vendored `vendor/mediapipe/vision_bundle.mjs` (@mediapipe/tasks-vision 0.10.22, Apache-2.0),
  WASM in `vendor/mediapipe/wasm/`, model `vendor/models/hand_landmarker.task`. `numHands: 2`, `runningMode: VIDEO`,
  GPU delegate with CPU fallback. Load lazily only when camera mode starts.
- Audio: own WebAudio engine (no Tone.js). Master bus → compressor → limiter. Presets below.
- Dev server: `python3 -m http.server 8460` from repo root. Add `.nojekyll`.

## Music model (`src/theory.js`, pure + unit-tested with `node --test`)
- Key: any of 12 roots, major or (natural) minor mode. Scale degree 1–7 → diatonic triad.
- Chord = { degree, root pc, quality, extension, inversion } → MIDI notes (voice-led into a comfortable
  range C3–C5 so changes move minimally; bass note an octave below root).
- Qualities: maj, min, dim, aug(optional). **Flip** toggles major↔minor (dim → min).
- Extensions: triad, 1st inversion, sus2, sus4, 7 (diatonic 7th: maj7/dom7/m7/m7b5 as the key dictates), dom7 (force b7 on any
  chord), add9.
- Name helpers: chord symbol ("Dm7", "G7", "Fmaj7", "Bdim"), roman numeral ("ii7", "V7", "IV"), note names
  with correct sharps/flats per key.
- `parseRoman("V7")`, `parseRoman("bVII")` → chord in key (supports b/# prefix for borrowed chords in songs).

## Gesture control (`src/gestures.js`, logic unit-tested on synthetic landmark arrays)
Use the user's *real* left/right (MediaPipe handedness is mirrored for a selfie camera — handle and expose a
"swap hands" toggle). Smooth with a short debounce (a gesture must hold ~120 ms before the chord changes)
so chords don't flicker.

Finger "extended" = tip farther from wrist than PIP (distance-based, so it works when the hand is tilted);
thumb extended = tip far from index MCP.

Gestures deliberately follow the same *musical* scheme as the original (so students who know it feel at home):

**Left hand — which chord (scale degree)**
| shape | degree |
|---|---|
| 1–5 fingers counted index→pinky then thumb (1=index, 2=+middle, 3=+ring, 4=+pinky, 5=open palm) | I–V |
| index + pinky, thumb tucked (🤘) | VI |
| index + pinky + thumb out (🤟) | VII |
| fist / no hand | silence |
- **Harmony mode** setting: *Diatonic* (default — chords follow the key: ii, iii, vi minor, vii° dim) or
  *Free* (every degree major; tilt for minor — the original's behaviour). In both, tilting the left hand
  outward (roll past ~25°, hysteresis) **flips** major↔minor.
- Optional "accidentals" toggle: left-hand height — top band raises the root a semitone, bottom 20 % lowers it
  (lets students reach bVII, #iv etc.). Off by default.

**Right hand — chord colour, octave, volume, tone**
| fingers (index→pinky; thumb ignored for count) | effect |
|---|---|
| 0 (fist) | mute (fade out) |
| 1 | root-position triad |
| 2 | 1st inversion |
| 3 | 7th (maj7 on major, m7 on minor, diatonic in Diatonic mode) |
| 4 | dominant 7 (on minor: dim7) |
- Thumb out → octave down. Hand height → volume (top loud). Tilt → filter brightness (~250 Hz–5 kHz).
- Pinch (thumb tip to index tip) → strum/re-trigger (works in Strum/Arp styles).
- If the right hand is absent in two-handed mode: use the last-held colour for 400 ms then default triad at
  medium volume (more forgiving than silence for beginners). Setting "No right hand = silent" for the original feel.

Debounce: a shape must be stable ~110 ms before it changes the chord; bridge dropouts of ≤150 ms.
Show a small "lock-in" ring filling while a new shape is being confirmed. Same chord held = no re-trigger.

**One-handed mode**: left hand only; right-hand functions available via on-screen buttons/keys.

Show on the video: landmark skeleton, per-hand label ("chord" / "colour"), and the detected count — helps
students learn the shapes.

## Non-camera controls (always on)
- Keys `1`–`7` = degrees; hold `Shift` = flip; `Q W E R` = triad/1st inv/7th/dom7, `T` sus4, `Y` add9; `Space` = strum;
  `Z`/`X` octave down/up; `,`/`.` inversion.
- Big on-screen chord pad: 7 buttons (roman numeral + chord name in current key), pointer down = play,
  up = release (a "hold" toggle keeps sustaining). Touch friendly, multi-touch safe.

## Sound (`src/audio.js`)
Presets: Warm Pad, Bright Synth, Retro (square/chip), Strings (detuned saw + slow attack + filter),
Electric Piano (FM bell decay), Organ (additive drawbars), Nylon Guitar (Karplus-Strong, strummed).
Playback styles: **Hold** (sustain while chord held, crossfade on change), **Strum** (notes staggered 25 ms),
**Arpeggio** (up / up-down / random, at the tempo, 8ths or 16ths). Reverb (generated impulse) send.
Beat: optional drum loop (synth kick/snare/hat, 4 patterns: Pop, Rock, Ballad, Reggaeton) + metronome, BPM 60–160.
Audio unlocks on first user gesture.

## Learning views
- **Piano strip** (2 octaves) highlighting sounding notes, root in accent colour.
- **Staff** (treble, SVG) showing the chord's notes with correct accidentals.
- Big chord name + roman numeral; the key's 7 chords listed with the current one highlighted.
- **Guide** overlay: illustrated hand shapes (draw simple SVG hands, our own art) for every gesture.
- **Tutorial**: step-by-step guided lesson that waits for the student to make each shape (also completable with
  keys/pad): I → IV → flip IV to iv → V7 → I.

## Song tutorials (`src/songs.js` data + `src/songmode.js`)
Chord progressions only — **never lyrics**. Each song: title, artist, original key, bpm, sections of bars, tip.
- Pick a song → shows the progression as a scrolling lane of chord cards (roman numeral big, chord name small,
  required hand shape icon), playhead driven by the tempo, count-in, optional backing beat.
- Modes: **Practice** (waits for the right chord before advancing), **Play-along** (keeps time, scores
  on-time/late/miss), **Listen** (app plays it so students hear it first).
- Transpose to any key (default: original key; "easy key" button → C/G).
- Tempo slider (50–120 % speed), loop a section.
- End screen: accuracy %, streak, stars (1–3). Best score per song saved in localStorage (try/catch).
- Songs are browsable by difficulty; also "Progression Lab" classics (I–V–vi–IV, 12-bar blues, ii–V–I, Canon).

## Classroom extras
- **Projector mode**: hides side panels, huge chord name + piano strip.
- **Free-play recorder**: records the chord sequence + timing, play it back, export as text ("C | G | Am | F").
- Settings persisted (key, preset, style, bpm, hand swap) in localStorage with try/catch.
- Camera privacy note: video never leaves the device (all processing local).
- Clear error states: no camera / denied / unsupported → falls back to pad with a friendly banner.

## Look
Own identity: dark stage, warm accent palette (not a copy of the original's black + orange monospace). Rounded
cards, a display font from Google Fonts is NOT allowed (offline-friendly) — use system font stack. Responsive:
works on Chromebook 1366×768, iPad, projector 1920×1080. Accessible: buttons labelled, focus states, reduced motion.

## Tests
- `node --test tests/` for theory (degrees, flip, extensions, names, roman parse, voice leading),
  gestures (synthetic landmarks → shape → degree), songs (every song's chords parse in its key; no lyrics field).
