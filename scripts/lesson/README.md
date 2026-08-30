# Lesson cards and films

Things the chain taught us, drawn to be shared. One lesson so far: what a
signer seat cost went from 49,056 STX in cycle 141 to 52,687 in 142, and a
pool sitting on 50,020 STX lost its seat without moving a single one.

Outputs land in `public/lessons/`.

```bash
pnpm card:lesson    # public/lessons/seat-price-142.png  — 1200×675, for a post
pnpm film:lesson    # public/lessons/seat-price-142.mp4  — 9s, 720p, with sound
pnpm score:lesson   # the music on its own, as a WAV
```

## Useful variants

```bash
pnpm film:lesson --draft            # 640×360, 16 samples, ~20s — for checking a change
pnpm film:lesson --silent           # skip the score, ~6s quicker while iterating on the picture
pnpm film:lesson --out /tmp/try.mp4 # render elsewhere and leave the committed file alone
pnpm card:lesson --quick            # reuse the last seahorse render instead of rendering again
```

The numbers are arguments, not constants, so the next cycle's lesson is a
different invocation rather than a copy of these files:

```bash
pnpm card:lesson --was-cycle 142 --now-cycle 143 --was 52,687 --now 54,900 --held 50,020
pnpm film:lesson --was-cycle 142 --now-cycle 143 --was 52687 --now 54900 --held 50020
```

## What is in here

| file | what it is |
| --- | --- |
| `lesson_beats.py` | the storyboard, in seconds. Read by the picture and the sound, so neither can drift from the other |
| `seahorse3d.py` | Fast Pool's mark as a solid object. Every scene choice is an argument — pose, angle, material, floor, size, engine, frames |
| `make-lesson-card.mjs` | the still: the seahorse, the two figures, the explanation |
| `seahorse-explainer.py` | the film: five beats, from the seat to the drop |
| `lesson_score.py` | the music — a small orchestra, written here rather than licensed |

## What it needs

`blender` and `ffmpeg` on the `PATH` for the film, `magick` for the card. No
npm dependencies and no Python packages: the score is standard library only,
and the card is drawn by ImageMagick, which is the same choice
`make-share-card.mjs` makes and for the same reason.

## What it costs

About 80 seconds for the finished film — 216 frames at 720p, plus six seconds
for the score and one to mux. Which is the number worth knowing: rendering is
not what makes a video expensive. Deciding what should move is.

## Two things that will bite

**The score is written to the frame.** The bell rings where the amber bar
clears the cream one because both halves read `lesson_beats.py`. Move a beat
there and the music follows; move it in one file only and it will not.

**The card's text block ends at 588 with the padding starting at 599.** A line
added to it has to buy its room from the spacing above, not from the margin.
