"""
The music for the film: a small orchestra, written here rather than licensed.

    python3 scripts/lesson/lesson_score.py --out /tmp/score.wav
    python3 scripts/lesson/lesson_score.py --video public/lessons/seat-price-142.mp4

"Royalty free" is a promise about somebody else's file that somebody else can
withdraw. This is arithmetic that makes a WAV, so there is no licence to keep
track of, no attribution line to lose, and nothing to take down. It also means
the score is written against `lesson_beats.py` beside it and lands on the frame it is
meant to land on, which no library track will do.

Standard library only — `math`, `struct`, `wave`, `random` — and seeded, so
the same file comes out every time. Nothing to install, which is the rule the
share card already follows about ImageMagick.

## What makes it sound like an orchestra rather than a synthesiser

Three things, and none of them is the notes:

  the timbre    a violin is not a sine. Each instrument here is a wavetable
                built from a named harmonic series — strings rich and
                sawtooth-ish, horns hollow in the middle, flutes almost only
                odd harmonics — and read back with interpolation, which is
                also what makes this fast enough to be pure Python.

  the players   twelve violins are never in tune with each other, and that is
                the sound. Every part is played by several voices a few cents
                apart and a few milliseconds late, which is where the width
                and the shimmer come from. One player is a synthesiser; five
                are a section.

  the hall      a Schroeder reverb — four combs into two allpasses, a little
                longer on the right than the left. Without it the best
                timbre in the world sounds like it was recorded in a cupboard.

## The arrangement

A minor, 96 to the bar, one cue per beat of the storyboard:

  settle   celli and basses hold the tonic; a harp turns a figure over the
           top. Nothing has happened yet and nothing should sound as if it has.
  rise     violins climb an octave, quickening, over a viola pedal, with the
           harp ticking for the counter and a timpani roll swelling underneath.
  pass     a tubular bell and a horn stab on the frame the amber bar clears
           the cream one. It is the only bright moment in the piece.
  turn     the horns swell and the strings go to tremolo. The music notices
           before the character does.
  drop     the whole string section slides down an octave; timpani at the
           bottom.
  verdict  tutti A minor across three octaves, held, fading. Not resolved to a
           major chord: nothing about this was resolved for the pool it
           happened to.

## Why it is quiet

It plays under a picture that is doing the explaining. Peaks sit near -6dBFS
and the strings sit well below the cues, so a phone speaker gets the bell and
the timpani and is not asked for anything else.
"""

import argparse
import math
import os
import random
import struct
import subprocess
import sys
import tempfile
import wave

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from lesson_beats import seconds as story_seconds  # noqa: E402

RATE = 44_100
TABLE = 2_048

# Seeded: a score that came out differently every run could not be reviewed.
DICE = random.Random(20_260_830)

# A minor pentatonic, which is the scale that cannot be played wrongly.
A2 = 110.0
SCALE = [1.0, 6 / 5, 4 / 3, 3 / 2, 9 / 5]  # A C D E G, as ratios


def note(index: int) -> float:
    """A pentatonic degree as a frequency, counting up from A2."""
    octave, step = divmod(index, len(SCALE))
    return A2 * SCALE[step] * (2**octave)


def wavetable(weights) -> list:
    """
    One cycle of a waveform, from the amplitude of each harmonic.

    Built once per instrument and then read back by every note it plays. The
    alternative — summing a dozen sines per sample per player — is the same
    sound and about twenty times the arithmetic, which is the difference
    between this file taking seconds and taking minutes.
    """
    cycle = []
    for i in range(TABLE):
        value = 0.0
        for harmonic, weight in enumerate(weights, start=1):
            value += weight * math.sin(2 * math.pi * harmonic * i / TABLE)
        cycle.append(value)
    peak = max(abs(v) for v in cycle) or 1.0
    return [v / peak for v in cycle]


# The sections. The weights are what makes each one recognisable: strings
# carry every harmonic and fall away slowly, horns are hollow in the middle,
# flutes are nearly all odd, and a harp is bright at the start and simple after.
STRINGS = wavetable([1 / n for n in range(1, 15)])
CELLI = wavetable([1 / (n**1.4) for n in range(1, 11)])
HORNS = wavetable([1.0, 0.55, 0.75, 0.35, 0.28, 0.16, 0.1, 0.06])
FLUTE = wavetable([1.0, 0.06, 0.28, 0.03, 0.08, 0.02])
HARP = wavetable([1.0, 0.45, 0.3, 0.18, 0.12, 0.08, 0.05, 0.03])


class Track:
    """A stereo buffer that things get added to. Mixing is addition."""

    def __init__(self, length: float):
        self.frames = int(length * RATE)
        self.left = [0.0] * self.frames
        self.right = [0.0] * self.frames

    def add(self, at: float, samples, pan: float = 0.0):
        """`pan` runs -1 to 1. Sections sit where they sit on a stage."""
        start = int(at * RATE)
        left_gain = math.sqrt((1.0 - pan) / 2.0)
        right_gain = math.sqrt((1.0 + pan) / 2.0)
        for offset, value in enumerate(samples):
            index = start + offset
            if 0 <= index < self.frames:
                self.left[index] += value * left_gain
                self.right[index] += value * right_gain

    def reverb(self, wet: float = 0.34, room: float = 0.79):
        """
        A hall, by the oldest method there is.

        Four comb filters in parallel into two allpasses in series — Schroeder,
        1962 — with the right channel's delays a little longer than the left's,
        which is most of what makes a recording sound wide. This is the single
        biggest difference between "an orchestra" and "some oscillators".
        """
        def comb(signal, delay, feedback):
            out = list(signal)
            buffer = [0.0] * delay
            index = 0
            for i, value in enumerate(signal):
                delayed = buffer[index]
                buffer[index] = value + delayed * feedback
                index = (index + 1) % delay
                out[i] = delayed
            return out

        def allpass(signal, delay, gain=0.7):
            out = list(signal)
            buffer = [0.0] * delay
            index = 0
            for i, value in enumerate(signal):
                delayed = buffer[index]
                buffer[index] = value + delayed * gain
                out[i] = delayed - value * gain
                index = (index + 1) % delay
            return out

        for channel, spread in ((self.left, 1.0), (self.right, 1.031)):
            wet_sum = [0.0] * len(channel)
            for ms in (29.7, 37.1, 41.1, 43.7):
                delayed = comb(channel, int(ms * spread * RATE / 1000), room)
                for i, value in enumerate(delayed):
                    wet_sum[i] += value * 0.25
            for ms in (5.0, 1.7):
                wet_sum = allpass(wet_sum, int(ms * spread * RATE / 1000))
            for i, value in enumerate(wet_sum):
                channel[i] = channel[i] * (1.0 - wet * 0.5) + value * wet

    def write(self, path: str):
        peak = max(
            max((abs(v) for v in self.left), default=0.0),
            max((abs(v) for v in self.right), default=0.0),
        )
        # Headroom rather than loudness: this plays under a picture and should
        # never be the reason somebody reaches for the volume.
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
            # Not a straight line: a bow takes hold, it does not switch on.
            out.append((i / attack_n) ** 1.5)
        elif i < attack_n + decay_n:
            through = (i - attack_n) / decay_n
            out.append(1.0 - (1.0 - sustain) * through)
        elif i > length - release_n:
            out.append(sustain * ((length - i) / release_n) ** 1.4)
        else:
            out.append(sustain)
    return out


def play(table, freq, length, level=0.2, attack=0.12, decay=0.2, sustain=0.7,
         release=0.3, vibrato=0.0, vibrato_hz=5.2, glide_to=None):
    """One player: a wavetable read at a pitch, under an envelope."""
    count = int(length * RATE)
    shape = envelope(count, attack, decay, sustain, release)
    samples = [0.0] * count
    phase = 0.0
    for i in range(count):
        through = i / count
        pitch = freq if glide_to is None else freq * (
            (glide_to / freq) ** (through**1.5)
        )
        if vibrato:
            # Vibrato arrives after the note does, as a player's would.
            depth = vibrato * min(1.0, through * 3.0)
            pitch *= 1.0 + depth * math.sin(2 * math.pi * vibrato_hz * i / RATE)
        phase += pitch * TABLE / RATE
        while phase >= TABLE:
            phase -= TABLE
        low = int(phase)
        frac = phase - low
        value = table[low] * (1 - frac) + table[(low + 1) % TABLE] * frac
        samples[i] = value * shape[i] * level
    return samples


def section(track, table, freq, length, at, level=0.2, players=5, spread=0.004,
            pan=0.0, **kwargs):
    """
    A part, played by several people who are not quite together.

    The detune and the ragged entries are the whole trick. A single voice is a
    synthesiser however good its waveform is; five voices four cents apart and
    a few milliseconds late are a string section.
    """
    for player in range(players):
        cents = spread * (DICE.random() - 0.5) * 2
        late = DICE.random() * 0.03
        seat = pan + (player - (players - 1) / 2) * 0.09
        track.add(
            at + late,
            play(table, freq * (1 + cents), length, level=level / players**0.6,
                 **kwargs),
            pan=max(-1.0, min(1.0, seat)),
        )


def timpani(freq=73.0, length=1.6, level=0.5):
    """A drum: a pitched thump, two inharmonic partials, and a little skin."""
    count = int(length * RATE)
    samples = []
    phase = 0.0
    for i in range(count):
        through = i / count
        decay = math.exp(-4.2 * through)
        pitch = freq * (1.0 + 0.12 * math.exp(-30.0 * through))
        phase += 2 * math.pi * pitch / RATE
        value = math.sin(phase) + 0.28 * math.sin(phase * 1.59) + 0.12 * math.sin(
            phase * 2.14
        )
        # The stick, which is over almost before it starts.
        if through < 0.02:
            value += (DICE.random() - 0.5) * 2.4 * (1 - through / 0.02)
        samples.append(value * decay * level)
    return samples


def bell(freq, length=3.0, level=0.4):
    """The pass: a tubular bell, bright and inharmonic and gone by the next bar."""
    count = int(length * RATE)
    partials = ((1.0, 1.0), (2.76, 0.62), (5.4, 0.32), (8.93, 0.18), (13.3, 0.08))
    samples = []
    for i in range(count):
        t = i / RATE
        value = 0.0
        for ratio, weight in partials:
            value += weight * math.sin(2 * math.pi * freq * ratio * t) * math.exp(
                -0.8 * ratio * t / 3.0
            )
        samples.append(value * level)
    return samples


def compose() -> Track:
    """The score, cue by cue, against the storyboard both halves read."""
    marks = story_seconds()
    end = marks['end']
    track = Track(end + 1.4)

    # -- settle: the low strings take the tonic and hold it -----------------
    section(track, CELLI, note(0) / 2, end + 0.6, 0.0, level=0.3, players=4,
            spread=0.006, pan=-0.3, attack=1.1, decay=0.4, sustain=0.85,
            release=1.6, vibrato=0.002)
    section(track, CELLI, note(2), marks['turn_start'], 0.15, level=0.2,
            players=3, spread=0.005, pan=0.25, attack=1.3, decay=0.5,
            sustain=0.7, release=1.2, vibrato=0.0025)

    # A harp over the top, turning a figure while nothing else happens.
    for step, degree in enumerate((7, 9, 10, 9)):
        section(track, HARP, note(degree), 1.1, 0.3 + step * 0.33, level=0.13,
                players=2, spread=0.002, pan=0.4, attack=0.004, decay=0.9,
                sustain=0.05, release=0.2)

    # -- rise: violins climb, violas hold, timpani builds -------------------
    span = marks['rise_end'] - marks['rise_start']
    section(track, STRINGS, note(4), span + 0.9, marks['rise_start'], level=0.16,
            players=3, spread=0.005, pan=-0.2, attack=0.8, decay=0.4,
            sustain=0.75, release=0.8, vibrato=0.003)

    steps = 14
    for step in range(steps):
        through = step / steps
        # Quadratic spacing: the notes crowd as the bar nears the top.
        at = marks['rise_start'] + span * (through**1.35)
        section(
            track, STRINGS, note(6 + step), 0.62, at,
            level=0.12 + 0.3 * through**1.6, players=4, spread=0.004,
            pan=-0.35 + 0.7 * through, attack=0.06 + 0.05 * (1 - through),
            decay=0.3, sustain=0.45, release=0.28, vibrato=0.004,
        )

    # A swell that peaks where the bar passes. Without it the run climbs in
    # pitch and stays level in weight, which is a scale rather than a build.
    section(track, STRINGS, note(9), span + 0.3, marks['rise_start'] + 0.2,
            level=0.26, players=4, spread=0.005, pan=0.25, attack=span * 0.9,
            decay=0.15, sustain=0.9, release=0.7, vibrato=0.003)

    # The counter, on the harp, quiet enough to feel rather than hear.
    for tick in range(24):
        at = marks['rise_start'] + span * (tick / 24)
        track.add(at, play(HARP, note(14), 0.12, level=0.05, attack=0.002,
                           decay=0.1, sustain=0.0, release=0.02), pan=0.45)

    # A roll under it, getting closer together and louder as the bar climbs.
    hit = marks['rise_start'] + 0.4
    while hit < marks['rise_end']:
        through = (hit - marks['rise_start']) / span
        # Loud in the middle and out of the way by the end: the bell is the
        # point of the next bar and a drum roll on top of it is a mess.
        shape = math.sin(math.pi * min(1.0, through / 0.85))
        track.add(hit, timpani(length=0.5, level=0.04 + 0.15 * shape), pan=-0.1)
        hit += 0.19 - 0.1 * through

    # -- pass: the bell, and the horns underneath it ------------------------
    track.add(marks['rise_end'], bell(note(11), level=0.75), pan=0.15)
    track.add(marks['rise_end'], bell(note(11) / 2, length=3.4, level=0.3), pan=-0.2)
    section(track, HORNS, note(4), 1.4, marks['rise_end'], level=0.46, players=3,
            spread=0.004, pan=-0.15, attack=0.04, decay=0.5, sustain=0.35,
            release=0.7, vibrato=0.002)

    # -- turn: the horns swell, the strings go to tremolo --------------------
    section(track, HORNS, note(0), 1.5, marks['turn_start'] - 0.2, level=0.26,
            players=4, spread=0.005, pan=0.1, attack=0.7, decay=0.3,
            sustain=0.7, release=0.6)
    tremolo = marks['turn_start']
    while tremolo < marks['drop_start']:
        section(track, STRINGS, note(5), 0.11, tremolo, level=0.1, players=2,
                spread=0.004, pan=-0.3, attack=0.02, decay=0.06, sustain=0.2,
                release=0.03)
        tremolo += 0.075

    # -- drop: the section slides an octave, and the drum lands -------------
    for part, (table, degree, pan) in enumerate(
        ((STRINGS, 12, -0.25), (STRINGS, 10, 0.2), (CELLI, 5, 0.0))
    ):
        section(
            track, table, note(degree), 1.05, marks['drop_start'] + part * 0.03,
            level=0.22, players=3, spread=0.004, pan=pan, attack=0.04,
            decay=0.5, sustain=0.4, release=0.3,
            glide_to=note(degree - 5),
        )
    # The landing, and the only other moment allowed to be as big as the bell.
    track.add(marks['drop_end'] - 0.05, timpani(length=2.2, level=0.95))
    track.add(marks['drop_end'] - 0.04, timpani(freq=55.0, length=2.6, level=0.5),
              pan=-0.2)

    # -- verdict: tutti A minor, held, unresolved ---------------------------
    tail = end - marks['drop_end'] + 1.0
    chord = ((note(0) / 2, CELLI, -0.35), (note(0), CELLI, -0.1),
             (note(2), STRINGS, 0.15), (note(3), STRINGS, 0.35),
             (note(5), STRINGS, 0.0))
    for freq, table, pan in chord:
        section(track, table, freq, tail, marks['drop_end'] + 0.3, level=0.18,
                players=4, spread=0.005, pan=pan, attack=0.5, decay=0.4,
                sustain=0.72, release=1.5, vibrato=0.003)
    section(track, HORNS, note(0) / 2, tail * 0.8, marks['drop_end'] + 0.45,
            level=0.14, players=2, spread=0.004, pan=0.0, attack=0.8,
            decay=0.4, sustain=0.6, release=1.2)

    track.reverb()
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
