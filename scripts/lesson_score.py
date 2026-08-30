"""
The music for the film, written here rather than licensed from anywhere.

    python3 scripts/lesson_score.py --out /tmp/score.wav
    python3 scripts/lesson_score.py --video public/lessons/seat-price-142.mp4

"Royalty free" is a promise about somebody else's file that somebody else can
withdraw. This is a few hundred lines of arithmetic that makes a WAV, so there
is no licence to keep track of, no attribution line to lose, and nothing to
take down. It also means the score can be written against `lesson_beats.py`
and land on the frame it is meant to land on, which no library track will do.

Standard library only — `math`, `struct`, `wave`. Nothing to install, which is
the same rule the share card follows about ImageMagick.

## What it plays

A minor, 96 to the bar, and each cue is one of the storyboard's beats:

  settle   a low drone and a soft pulse. Nothing is happening yet, and the
           music should not pretend otherwise.
  rise     a pentatonic run climbing an octave, quickening as it goes, with a
           tick under it for the number counting up. The pitch rises because
           the bar does.
  pass     a bell, once, on the frame the amber bar clears the cream one.
           The only bright sound in the piece, because it is the moment the
           whole film is about.
  turn     a low swell, and the pulse stops. Something has gone wrong and the
           music notices before the character does.
  drop     a glide down an octave and a thud at the bottom.
  verdict  A minor, held, and a long fade. No resolution to a major chord:
           nothing about this was resolved for the pool it happened to.

## Why it is quiet

It plays under a picture that is doing the explaining. Peaks land at about
-6dBFS and the drone sits well below the cues, so a phone speaker gets the
bell and the thud and is not asked for anything else.
"""

import argparse
import math
import os
import struct
import subprocess
import sys
import tempfile
import wave

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from lesson_beats import seconds as story_seconds  # noqa: E402

RATE = 44_100

# A minor pentatonic, which is the scale that cannot be played wrongly.
A2 = 110.0
SCALE = [1.0, 6 / 5, 4 / 3, 3 / 2, 9 / 5]  # A C D E G, as ratios


def note(index: int) -> float:
    """A pentatonic degree as a frequency, counting up from A2."""
    octave, step = divmod(index, len(SCALE))
    return A2 * SCALE[step] * (2**octave)


class Track:
    """A stereo buffer that things get added to. Mixing is addition."""

    def __init__(self, length: float):
        self.frames = int(length * RATE)
        self.left = [0.0] * self.frames
        self.right = [0.0] * self.frames

    def add(self, at: float, samples, pan: float = 0.0):
        """`pan` runs -1 to 1; the width is small on purpose."""
        start = int(at * RATE)
        left_gain = math.sqrt((1.0 - pan) / 2.0)
        right_gain = math.sqrt((1.0 + pan) / 2.0)
        for offset, value in enumerate(samples):
            index = start + offset
            if 0 <= index < self.frames:
                self.left[index] += value * left_gain
                self.right[index] += value * right_gain

    def write(self, path: str):
        peak = max(
            max((abs(v) for v in self.left), default=0.0),
            max((abs(v) for v in self.right), default=0.0),
        )
        # Headroom rather than loudness: this plays under a voice-free picture
        # and should never be the reason somebody reaches for the volume.
        gain = (0.5 / peak) if peak > 0 else 1.0

        with wave.open(path, 'wb') as out:
            out.setnchannels(2)
            out.setsampwidth(2)
            out.setframerate(RATE)
            data = bytearray()
            for left, right in zip(self.left, self.right):
                for value in (left * gain, right * gain):
                    clamped = max(-1.0, min(1.0, value))
                    data += struct.pack('<h', int(clamped * 32_767))
            out.writeframes(bytes(data))


def envelope(length: int, attack: float, decay: float, sustain=0.0, release=0.0):
    """An amplitude curve, in samples, that never clicks at either end."""
    attack_n = max(1, int(attack * RATE))
    decay_n = max(1, int(decay * RATE))
    release_n = max(1, int(release * RATE))
    out = []
    for i in range(length):
        if i < attack_n:
            out.append(i / attack_n)
        elif i < attack_n + decay_n:
            through = (i - attack_n) / decay_n
            out.append(1.0 - (1.0 - sustain) * through)
        elif i > length - release_n:
            out.append(sustain * max(0.0, (length - i) / release_n))
        else:
            out.append(sustain)
    return out


def tone(freq, length, level=0.3, attack=0.01, decay=0.3, sustain=0.0,
         release=0.05, harmonics=(1.0, 0.35, 0.12), detune=0.0):
    """One note: a few harmonics under an envelope. A pluck by default."""
    count = int(length * RATE)
    shape = envelope(count, attack, decay, sustain, release)
    samples = []
    for i in range(count):
        t = i / RATE
        value = 0.0
        for partial, weight in enumerate(harmonics, start=1):
            value += weight * math.sin(2 * math.pi * freq * partial * t)
            if detune:
                value += weight * 0.6 * math.sin(
                    2 * math.pi * (freq * partial + detune) * t
                )
        samples.append(value * shape[i] * level)
    return samples


def glide(start_freq, end_freq, length, level=0.3):
    """A note that slides, for the one moment something falls."""
    count = int(length * RATE)
    shape = envelope(count, 0.02, length * 0.9, sustain=0.15, release=0.08)
    samples = []
    phase = 0.0
    for i in range(count):
        through = i / count
        freq = start_freq * ((end_freq / start_freq) ** (through**1.6))
        phase += 2 * math.pi * freq / RATE
        samples.append(
            (math.sin(phase) + 0.3 * math.sin(2 * phase)) * shape[i] * level
        )
    return samples


def thud(length=0.55, level=0.55):
    """The seat landing: a sine dropping to nothing, and no click."""
    count = int(length * RATE)
    samples = []
    phase = 0.0
    for i in range(count):
        through = i / count
        freq = 90.0 * (1.0 - 0.55 * through)
        phase += 2 * math.pi * freq / RATE
        samples.append(math.sin(phase) * math.exp(-5.0 * through) * level)
    return samples


def bell(freq, length=2.2, level=0.34):
    """The pass: bright, inharmonic, and gone by the next beat."""
    count = int(length * RATE)
    partials = ((1.0, 1.0), (2.76, 0.5), (5.4, 0.25), (8.9, 0.12))
    samples = []
    for i in range(count):
        t = i / RATE
        value = 0.0
        for ratio, weight in partials:
            value += weight * math.sin(2 * math.pi * freq * ratio * t) * math.exp(
                -2.4 * ratio * t / 3.0
            )
        samples.append(value * level)
    return samples


def drone(length, freq=A2 / 2, level=0.12):
    """Two oscillators a few cents apart, which is what makes it breathe."""
    count = int(length * RATE)
    shape = envelope(count, 1.2, 0.1, sustain=1.0, release=1.6)
    samples = []
    for i in range(count):
        t = i / RATE
        wobble = 1.0 + 0.004 * math.sin(2 * math.pi * 0.13 * t)
        samples.append(
            (
                math.sin(2 * math.pi * freq * t)
                + 0.7 * math.sin(2 * math.pi * freq * 1.003 * t * wobble)
                + 0.3 * math.sin(2 * math.pi * freq * 2 * t)
            )
            * shape[i]
            * level
        )
    return samples


def compose() -> Track:
    """The score, cue by cue, against the storyboard both halves read."""
    marks = story_seconds()
    end = marks['end']
    track = Track(end + 1.2)

    # Under everything, from the first frame to the last.
    track.add(0.0, drone(end + 0.8))

    # Settle: a soft pulse, two to the second, saying nothing is wrong yet.
    beat = 60.0 / 96.0
    at = 0.35
    while at < marks['rise_start']:
        track.add(at, tone(note(7), 0.5, level=0.13, decay=0.45), pan=-0.15)
        at += beat

    # The rise: a run up an octave, quickening, because the bar is climbing.
    span = marks['rise_end'] - marks['rise_start']
    steps = 14
    for step in range(steps):
        through = step / steps
        # Quadratic spacing: the notes crowd together as the bar nears the top.
        at = marks['rise_start'] + span * (through**1.35)
        track.add(
            at,
            tone(note(4 + step), 0.42, level=0.16 + 0.1 * through, decay=0.36),
            pan=0.2 * (through - 0.5),
        )

    # The counter ticking under it, quiet enough to feel rather than hear.
    ticks = 24
    for tick in range(ticks):
        at = marks['rise_start'] + span * (tick / ticks)
        track.add(at, tone(note(12), 0.06, level=0.05, decay=0.05), pan=0.35)

    # The pass: one bell, on the frame the amber bar clears the cream one.
    track.add(marks['rise_end'], bell(note(9)))

    # The turn: a low swell, and the pulse does not come back.
    track.add(
        marks['turn_start'] - 0.15,
        tone(
            note(0), 1.5, level=0.22, attack=0.5, decay=0.2,
            sustain=0.6, release=0.7, harmonics=(1.0, 0.5, 0.2), detune=0.7,
        ),
    )

    # The drop, and the landing.
    track.add(marks['drop_start'], glide(note(7), note(0), 1.0, level=0.3))
    track.add(marks['drop_end'] - 0.05, thud())

    # The verdict: A minor, held, unresolved.
    for index, freq in enumerate((note(0), note(2), note(3))):
        track.add(
            marks['drop_end'] + 0.25,
            tone(
                freq, end - marks['drop_end'] + 0.9, level=0.16,
                attack=0.35, decay=0.3, sustain=0.7, release=1.1,
                harmonics=(1.0, 0.3, 0.1),
            ),
            pan=-0.25 + 0.25 * index,
        )

    return track


def video_seconds(video: str) -> float:
    """How long the picture runs, so the sound can be made to end with it."""
    result = subprocess.run(
        [
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1', video,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def mux(video: str, audio: str, out: str) -> None:
    """
    Video as it is, sound alongside it, and the last note faded out.

    The tail of the chord runs on past the last frame — a score should not stop
    the instant a picture does — so `-shortest` would cut it mid-decay, which
    is a click. Instead the audio is faded across the last three quarters of a
    second and trimmed to the picture's own length.
    """
    length = video_seconds(video)
    fade = 0.75
    subprocess.run(
        [
            'ffmpeg', '-y', '-i', video, '-i', audio,
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
            '-af', f'afade=t=out:st={max(0.0, length - fade):.3f}:d={fade}',
            '-t', f'{length:.3f}',
            '-movflags', '+faststart', out,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main():
    parser = argparse.ArgumentParser(prog='lesson_score')
    parser.add_argument('--out', default='/tmp/lesson-score.wav')
    parser.add_argument('--video', default=None, help='mux the score into this')
    args = parser.parse_args()

    track = compose()
    track.write(args.out)
    print(f'lesson_score: {args.out} — {track.frames / RATE:.1f}s')

    if args.video:
        scored = tempfile.mktemp(suffix='.mp4')
        mux(args.video, args.out, scored)
        os.replace(scored, args.video)
        print(f'lesson_score: scored {args.video}')


if __name__ == '__main__':
    main()
