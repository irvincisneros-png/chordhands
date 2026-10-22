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
- Qualities: maj, min, dim, aug(optional). **Flip** toggles major↔minor (dim → min). Harmony `classic` (default,
  every degree major) or `diatonic`. `classicVoice()` gives the fixed Classic voicings (tonic in F#3..F4, VII below it).
- Extensions: triad, 1st inversion, sus2, sus4, 7 (Classic: maj7 on major / m7 on minor; Diatonic: the key's own 7th),
  dom7 (force b7 on any chord), dim7 (Classic dom7 on a minor chord), add9.
- Name helpers: chord symbol ("Dm7", "G7", "Fmaj7", "Bdim"), roman numeral ("ii7", "V7", "IV"), note names
  with correct sharps/flats per key.
- `parseRoman("V7")`, `parseRoman("bVII")` → chord in key (supports b/# prefix for borrowed chords in songs).

## Gesture control (`src/gestures.js`, logic unit-tested on synthetic landmark arrays)
The default **Classic** scheme copies the hand controls of the app that inspired ChordHands, so students can
move between them. Every rule and number (finger/thumb tests, tilt measure, height bands, debounce, volume and
filter curves, voicings) is in **`docs/ORIGINAL-CONTROLS.md`**; `RULES` in `src/gestures.js` holds the constants.
Summary:

**Left hand (the hand MediaPipe labels Left) - which chord**
| shape | degree |
|---|---|
| number of digits up, thumb included (any digits): 1, 2, 3, 4, 5 | I - V |
| index + pinky only (thumb in) | VI |
| index + pinky + thumb out | VII |
| no digit up (fist) / no hand | silence |
- Tilt inward (or upright) = **major**; tilt outward = **minor**. Measured from the wrist x against the middle/ring
  knuckles (dead zone between them), no hysteresis. Applies to every degree.
- Optional, off by default (Settings): chord hand in the top half of the picture raises the root a semitone, a hand
  reaching the bottom fifth lowers it. Two separate toggles.
- **Harmony: Classic (default)**: roots from the key's scale (VII a semitone *below* the tonic), every chord
  major unless tilted. **Diatonic (optional)**: chords follow the key (ii, iii, vi minor, vii dim) and the tilt flips them.

**Right hand (Right label) - chord shape, octave, volume, tone**
| fingers (thumb not counted) | effect |
|---|---|
| 0 / no right hand | silence |
| 1 | root position (root, 5th, octave root, octave 3rd) |
| 2 | 1st inversion |
| 3 | maj7 (major) or m7 (minor) |
| 4 | dom7 (major) or dim7 with b5 (minor) |
- Thumb out = one octave lower. Volume = right **wrist** height by default (landmark 0; y 0.05 full .. 0.95 silent, linear; raise your right hand higher for louder). Setting "Volume follows" can switch to the pointer fingertip (landmark 8). The overlay marker sits on whichever landmark is active. Tilt inward = brighter:
  filter 1200 Hz neutral, up to 5 kHz / Q 5.2; outward darker, down to 250 Hz / Q 2.2.
- Pinch (thumb tip to index tip) re-strikes the chord, **only in Strum / Arpeggio styles**.
- Right hand missing in two-handed mode = silence. Optional "Beginner help" (off by default) keeps the last
  colour for about half a second, then a plain triad at medium volume.

**Timing**: a shape must hold 100 ms before the chord changes (any change of chord, quality, octave, tilt or
pitch band restarts the timer); a lost hand is bridged for 50 ms; silence follows about 150 ms after a hand leaves.
Same notes = no re-trigger. The **lock-in ring** fills during the 100 ms hold.

**One-handed mode**: only the left-hand-role hand is read; the colour is a root-position triad unless you set it
with the pad chips / keys Q W E R; fixed volume; fixed 1200 Hz filter. "Swap hands" exchanges the roles.

**Live gesture guide** (`src/ui/gestureguide.js`): beside (wide screens) or under the camera, the 7 left shapes and
4 right shapes with the one being detected highlighted (brighter once locked in), the tilt state (major/minor,
brighter/darker), octave state, pitch band, volume meter and the lock-in rings. Updated every camera frame from
`GestureTracker` output; touches the DOM only when something changed.

Show on the video: landmark skeleton, per-hand label ("Chord IV minor" / "Colour 3: maj7 · oct down"), and the
lock-in ring.

## Non-camera controls (always on)
- Keys `1`–`7` = degrees; hold `Shift` = minor (the tilt); `Q W E R` = right hand with 1, 2, 3, 4 fingers (root /
  1st inversion / 7th / dom7, dim7 on minor); `T` sus4, `Y` add9 (extras); `Space` = strum; `Z`/`X` octave down/up
  (the thumb); `,`/`.` inversion.
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
- **Hand guide** dialog: illustrated hand shapes (our own SVG art) and every rule above, in student words.
- **Tutorial**: step-by-step guided lesson that waits for the student to make each shape (also completable with
  keys/pad): I → IV → flip IV to iv (left hand only), then the right hand joins: V → V7 → I.

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

## Theremin mode (`src/theremin.js`, `src/ui/thereminpanel.js`)
Header switch **Chords / Theremin**. Right-hand wrist y = pitch, exponential 65 Hz (bottom) to 1200 Hz (top), about
30 ms glide. Left-hand wrist y = volume, same linear curve as the chord volume, about 40 ms smoothing. Sound only
while both hands are seen and volume > 0.02. Sine voice (triangle / saw optional). Optional **Snap to key** quantises
to the key's scale with a short glide. Swap-hands exchanges the two roles. Shows a big note name with cents, a
vertical pitch ruler marking the key's scale notes, and the volume level. Mouse / touch pad: pointer x = pitch,
y = volume.

## Practice feedback
Under the NOW card: four chips, live from the performer state. **Chord** (root / degree), **Maj/Min**,
**Colour** (triad / 1st inv / 7th / dom7; only checked when the target needs it: a 7th target such as V7 or Imaj7
needs that 7th, a plain triad accepts root position or 1st inversion), **Octave** (informational). Green = match,
red = no match. In Classic harmony minor needs the tilt and 7ths need the right-hand finger count. **Skip chord**
counts as a skip; the end screen shows matched vs skipped. Optional setting "Practice: only the right chord
sounds" (default off).

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
