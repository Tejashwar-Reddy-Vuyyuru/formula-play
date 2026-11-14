# Formula Play

Draw it. Say it. Get the formula.

Formula Play turns a drawing or a ringing sound into a formula, turns a formula back into a drawing or a sound, and shows motion with its live numbers. It runs entirely in the browser on a phone. There is no account and nothing is uploaded.

**Live app:** https://tejashwar-reddy-vuyyuru.github.io/motion-formula-lab/formula-play.html

## What it does

### Create
- **Draw.** Draw with a finger, up to eight lines in one picture. A plain shape gets its equation (line, parabola, wave or circle). Anything else becomes a sum of spinning circles that redraw it.
- **Type a formula.** Write `y = f(x)` or a pair `x(t)`, `y(t)` and watch it draw itself.
- **Motion lab.** A pendulum, a dropped ball, a thrown ball, a weight on a spring and a spinning wheel, worked out from the laws of physics. It plays like a video with time, position, speed, acceleration and arrows on the picture. Change gravity (Earth, Moon, Mars, Jupiter), lengths, angles and speeds with sliders or by dragging the object, and see the formula, graphs, a 3D view, forces and energy, and the data change with it.
- Extras: keep a drawing replaying (signature mode), morph one drawing into another, hear a line as a sound, and make a poster.

### Sound
- **Tuner.** The note, how far out of tune it is, how fast the sound fades, its overtones and its formula. A background noise filter removes rumble, hum and hiss and ignores sounds near the background level.
- **Tune.** Hum or whistle for 8 seconds and get the notes written down and played back.
- **Voice pen.** The pitch of your voice moves a pen up and down across the screen.
- **Chords.** Tap up to four notes; the app plays them and names the chord.

### Games
- **Today's challenge.** One formula a day: read it, draw what it looks like, get a score out of 100.
- **Practice** with five levels, **Name the curve**, a 60-second **Speed round**, and **duels** sent to a friend by link.

### Menu
Progress, saved creations, opening a formula code, help, settings (light or dark, motion effects, clear data) and about.

## Sending

Every creation can be sent as a link. The link holds the formula itself, so it opens straight to the drawing, formula, sound or tune. Where links cannot carry data, the same formula travels as a short text code starting with `FP1`.

## How it works

- **Drawings.** Each line is sampled evenly along its length and written as a Fourier series, which is a sum of rotating circles. Simple shapes are also fitted directly by least squares.
- **Sounds.** Pitch is found with the YIN method, overtones by projecting the signal onto multiples of the pitch, and the fade from the slope of loudness over time.
- **Motion lab.** Drops, throws, springs and wheels follow their exact formulas. The pendulum is stepped through its full swing law, and its swing time uses the exact formula for large swings. No air drag or friction.
- **Noise.** The microphone signal is filtered, the background level is learned from moments with no clear pitch, and only clear notes well above it are counted.
- **Typed formulas** are read symbol by symbol by a small parser. No code from the text is ever run.

## How it has been tested

Tested with automated browser runs at phone size:

- Drawn lines, parabolas, waves and circles come back with the right equation; free drawings are matched to 99% or better.
- Thirteen computer-made tones from 82 to 1760 Hz were read to within 0.4 hundredths of a note-step.
- Nine computer-made melodies were written down with every note right; noise was refused.
- Motion lab: swing times matched the exact formula to 4 decimal places on Earth and the Moon, energy stayed constant, and landing times, heights and distances matched their formulas.
- A note buried in loud background noise (about 4 dB above it) was read within 0.2%, with no false notes while only the noise played.

Not yet tested:

- Real instruments, real humming and real voices.
- A wide range of phones.
- Real noisy rooms. The noise test used computer-made noise.

## Known limits

- The microphone needs the app opened from its own web address, with permission allowed.
- Sound tools handle one note at a time. Speech has no single formula.
- The Motion lab is a model: it leaves out air drag and friction.
- Progress, settings and saved creations are kept in the browser on one phone only.

## Running it

The whole app is one file, `formula-play.html`. Open it in a browser, or host it on any static site. No build step and no server are needed.

## Built by

Tejashwar Reddy Vuyyuru
