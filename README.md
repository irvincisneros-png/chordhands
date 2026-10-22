# ChordHands

Play chords with your hands (webcam + MediaPipe), or with the keyboard, mouse and touch. Built for school music classes.
Fully self-hosted: no build step, no npm packages, no CDNs or fonts, no network requests at runtime. The hand model and
WASM runtime live in `vendor/`. Video never leaves the device.

## Run

```
python3 -m http.server 8460
# open http://localhost:8460
```

Any static host works (GitHub Pages: `.nojekyll` is included). The camera needs `https://` or `localhost`.

## Test

```
node --test tests/
```

Pure logic (theory, gestures, songs/scoring, tutorial, recorder) is DOM-free and covered by `tests/*.test.mjs`.

## Hands

Default **Classic** controls (same hand mapping as the app that inspired this one; rules and numbers in
`docs/ORIGINAL-CONTROLS.md`):

- Left hand = chord. Digits up (thumb counts) 1-5 = I-V, index+pinky = VI, +thumb = VII, no digit = silence.
  Tilt inward = major, outward = minor. Optional height bands raise/lower a semitone.
- Right hand = chord shape. 1 finger root position, 2 first inversion, 3 maj7/m7, 4 dom7/dim7; thumb out = octave
  down; raise your right hand (wrist) higher for louder (Settings: *Volume follows* wrist or pointer fingertip); tilt = filter. No right hand = silence (two-handed mode).
- **Theremin** (header switch): right wrist height = pitch, left wrist height = volume, optional Snap to key; drag the
  pad without a camera.
- Keyboard: 1-7 chords, Shift minor, Q W E R = right hand 1-4 fingers, Z/X octave, [ / ] key down/up a semitone (wraps; off while a song sets the key), ; / ' previous/next instrument. The key badge on the stage opens a 12-key picker; the instrument chip beside it opens a grouped instrument list.
- **Instruments** (all procedural WebAudio, no samples): Synths (Warm Pad, Bright Synth, Retro Chip, Supersaw, Pluck, Acid, Synth Bass + Pad), Keys (Electric Piano, Lo-fi Keys, Organ, Music Box), Band & Orchestra (Strings, Horns, Nylon Guitar), Voices (Choir, Robo Singer). The right-hand tilt is the Tone filter; on Choir / Robo Singer it morphs the vowel oo-oh-ah-eh-ee, on Acid it drives the filter cutoff. Robo Singer sings a syllable (la / doo / na / mm / aah) on every chord change. Theremin has a Voice option (a sustained vowel). Synth Bass + Pad gives the bass note a fat saw/square + sub voice (Settings, Bass note, turns it off).
- Dev check: open `tests/audio-check.html` (serve with `python3 -m http.server 8463`) to render every preset offline and compare levels.
- Optional: Diatonic harmony, one-handed mode, pinch-strum (Strum/Arp styles). A live gesture guide beside the camera
  shows what the camera reads. See the in-app **Hand guide**.

We feed MediaPipe the raw (un-mirrored) frame and mirror only the display, so
`src/gestures.js#assignHands` uses the labels as they come (Left = chord hand) and falls back to x-position if both hands get the same label.
If chords follow the wrong hand on some device, tick **Swap hands** in Settings.

The page is camera-first: the video is the stage, overlays carry the chord and gesture guides, the pad lives in the
**Pad & tools** drawer and Settings is a slide-over.

## Add a song

Edit `src/songs.js` and add an object to `SONGS` (chord progressions only; lyrics are allowed only on public-domain songs with `lyricsSource: "Public domain"`):

```js
{ id: "my-song", title: "My Song", artist: "Someone", year: 2001, difficulty: 1,   // 1 easy .. 3 hard
  originalKey: "C",            // "C", "F#", "Am"...
  bpm: 100, beatsPerChord: 4,  // beats per bar
  sections: [{ name: "Verse", bars: [["I"], ["V"], ["vi", "IV"]] }],   // 2 chords in a bar split it evenly
  tip: "One teaching sentence." }
```

Roman numerals: uppercase major, lowercase minor, `°` or `dim` diminished, suffixes `7 maj7 sus4 sus2 add9`,
`b`/`#` prefixes for borrowed chords (`bVII`). Numerals are relative to the song's key scale. An entry whose artist is
`"Progression Lab"` appears under the Progression Lab tab. `node --test tests/` checks that every chord parses.

## Layout

`index.html`, `styles.css`, `src/` (theory, gestures, camera, audio, drums, performer, songs, songmode, tutorial, recorder,
storage, formants, main, `ui/*`), `vendor/` (MediaPipe, Apache-2.0, see `vendor/mediapipe/LICENSE-NOTE.md`).

## Themes and lyrics

Header toggle (System / Light / Dark, also in Settings) sets `data-theme` before first paint; colours are CSS custom properties. In Song mode the Lyrics button lets a teacher paste lyrics (one line per bar, `|` splits a bar) and export/import them as .json; they are stored only in this browser. Pure helpers live in `src/lyrics.js`.
