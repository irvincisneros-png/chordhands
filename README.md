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

Left hand = chord (fingers 1-5 = I-V, index+pinky = VI, +thumb = VII, fist = rest; tilt outward = major/minor flip).
Right hand = colour (1 finger triad, 2 first inversion, 3 seventh, 4 dominant 7, fist mute), thumb out = octave down,
height = volume, tilt = tone, pinch = strum. See the in-app **Hand guide**.

MediaPipe labels handedness assuming a mirrored selfie image. We feed it the raw frame and mirror only the display, so
`src/gestures.js#assignHands` swaps the labels (and falls back to x-position if both hands get the same label).
If chords follow the wrong hand on some device, tick **Swap hands** in Settings.

## Add a song

Edit `src/songs.js` and add an object to `SONGS` (chord progressions only, never lyrics):

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
storage, main, `ui/*`), `vendor/` (MediaPipe, Apache-2.0, see `vendor/mediapipe/LICENSE-NOTE.md`).
