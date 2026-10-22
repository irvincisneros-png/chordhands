# Reference controls: how the original behaves

ChordHands' default **Classic** control scheme matches the hand controls of Gesture Synth (the app that inspired
this one), so students who learned there can switch without relearning. This file records the *parameters and
rules* we measured from its published client code, in our own words. We implement the same gesture-to-music
mapping in our own code (`src/gestures.js`, `src/theory.js`, `src/performer.js`); no code, text or art is copied.

Conventions: landmarks are the raw camera frame, 0..1, **y grows downward**. The picture on screen is mirrored.
"Chord hand" = hand MediaPipe labels *Left*; "colour hand" = hand labelled *Right*.

## Chord hand (left)

| Topic | Rule |
|---|---|
| Finger extended | fingertip is higher on screen than its middle joint (tip y < PIP y). Index, middle, ring, pinky. Not rotation tolerant: an upside-down hand reads as folded. |
| Thumb extended | tip vs the joint below it, sideways in the raw frame. A hand labelled Left: tip x < joint x. A hand labelled Right: tip x > joint x (i.e. pointing away from the palm). |
| Degree | **count of extended digits, thumb included**, 1..5 = I..V (any digits, not specific ones). 0 digits = no chord (silence). |
| VI | index + pinky up, middle + ring down, thumb in. Checked before the count. |
| VII | same shape with thumb out. Checked before the count. |
| Tilt measure | compare wrist x with the x of the middle-finger and ring-finger knuckles. Wrist inside that span = 0. Beyond it, tilt = distance beyond the span / 0.12, clamped to +-1. Sign is flipped for the Right-labelled hand so that **positive = fingertips lean inward** (toward the middle of the screen / your body), negative = outward. |
| Major / minor | tilt >= 0 (inward or upright) = major, tilt < 0 (any outward lean past the knuckles) = minor. Applies to every degree. **No hysteresis**; only the 100 ms debounce. |
| Height bands (optional, two separate toggles, both off by default) | uses the **lowest** landmark of the hand (max y). max y < 0.5 (whole hand in the top half) = raise root +1 semitone. max y >= 0.8 (hand reaches the bottom fifth) = lower root -1 semitone. In between = normal. A band only acts if its toggle is on. |

## Colour hand (right)

| Topic | Rule |
|---|---|
| Quality | number of extended fingers (thumb **not** counted): 0 = silent, 1 = root position, 2 = 1st inversion, 3 = maj7 (major chord) or m7 (minor), 4 = dom7 (major) or dim7 with a b5 (minor). |
| Octave | thumb out = every note one octave **lower**; thumb in = normal ("higher"). |
| Volume | wrist y, linear: y <= 0.05 full, y >= 0.95 silent. Higher hand = louder. Gain ramps over 50 ms per frame; no other smoothing. |
| Filter | same tilt measure (inward positive). Neutral 1200 Hz, Q 0.7. Outward: cutoff 1200 - 950*t (down to 250 Hz), Q 0.7 + 1.5*t. Inward: cutoff 1200 + 3800*t (up to 5000 Hz), Q 0.7 + 4.5*t. Smoothed with a 40 ms time constant. |

## Timing, triggering, missing hands

| Topic | Rule |
|---|---|
| Debounce | the whole candidate (degree, major/minor, quality, octave, pitch shift) must be unchanged for **100 ms** before it replaces the sounding state. Any field changing restarts the timer. |
| Dropout bridging | if the chord hand disappears, the previous candidate is kept for **50 ms**. After that the candidate becomes "nothing", which then also needs its 100 ms: silence arrives about 150 ms after the hand leaves. |
| Note start / re-trigger | the notes are replaced only when the sounding note set changes (new degree, quality, octave, tilt or pitch shift). Same notes = no re-trigger. Silence is a gain fade to 0, not a note-off. |
| No chord hand / no fingers | silence. |
| Two-handed, no right hand | silence (volume 0 at once; quality 0 after the debounce). No fallback chord. |
| Right fist | silence. |
| One-handed mode ("Left hand only") | only the Left-labelled hand is read; a lone Right-labelled hand does nothing. Chord is root position (quality 1), no octave shift, fixed volume (0.2 on its synth), filter fixed at 1200 Hz / Q 0.7. |
| Which hand is which | MediaPipe is fed the raw frame, the picture is mirrored only for display. The Left-labelled hand is the chord hand and shows on the left of the screen. Both-same-label case is not handled in the original. |

## Harmony and voicing

| Topic | Rule |
|---|---|
| Roots | tonic plus the **major scale**: degrees 1..6 = +0, +2, +4, +5, +7, +9 semitones; **VII = -1 semitone** (the leading tone *below* the tonic). Optional raise/lower adds +-1 semitone to the root. |
| Quality of the triad | **major unless tilted to minor**, for every degree (no diatonic ii/iii/vi minors, vii is just a major chord). |
| Tonic pitch | the 12 keys sit in one octave window F#3..F4: A = 220 Hz (MIDI 57), C = MIDI 60, F = 65; F#, G and G#/Ab are folded down an octave (54, 55, 56). |
| Quality 1 (root) | root, 5th, root + octave, 3rd + octave (the root is doubled, the third repeated on top). |
| Quality 2 (1st inv.) | 3rd, 5th, root + octave, 3rd + octave. |
| Quality 3 | major: root, 3rd, 5th, major 7th. Minor: root, minor 3rd, 5th, minor (flat) 7th. |
| Quality 4 | major: root, 3rd, 5th, flat 7th (dom7). Minor: root, minor 3rd, **flat 5th**, diminished 7th (6th). |
| Thumb out | all of the above one octave lower. |

## Not determined from the code

- Whether the model's *Left* label really is the user's physical left hand on a raw (un-mirrored) frame. The
  original's thumb, tilt and "inward" rules are only consistent if it is, so Classic uses the labels as they come
  and keeps a **Swap hands** setting for any device that disagrees.
- The exact sound of the original's synth and sample instruments (we only match controls).

## How ChordHands differs on purpose

- Our synth presets, envelopes and reverb are our own; a repeated chord after silence re-attacks instead of
  un-muting a drone. Because our presets have their own tone shaping, a global 1200 Hz neutral filter sounds darker.
- One-handed fixed volume is 0.5 (not 0.2): our voices are quieter than the original's raw oscillators.
- Extras kept optional: Diatonic harmony, pinch-strum (Strum and Arpeggio styles only), "Beginner help" for a
  dropped right hand, sus4/add9 keys, manual octave/inversion keys, a bass note.
