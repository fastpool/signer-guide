"""
The storyboard, as seconds, with nothing else in it.

Two things read this: `seahorse-explainer.py`, which moves objects, and
`lesson_score.py`, which makes the sound. They have to agree about when the
bar passes and when the seat goes — a score that resolves half a second after
the drop is worse than no score — so the timings live here rather than in
either of them.

Pure standard library on purpose. The picture is built inside Blender and the
sound is not, so anything imported here would have to exist in both.
"""

# Beats in seconds from the first frame.
STORY = {
    'settle_end': 1.6,
    'rise_start': 1.6,
    'rise_end': 4.6,
    'pass_end': 5.4,
    'turn_start': 5.4,
    'turn_end': 6.4,
    'drop_start': 6.6,
    'drop_end': 7.6,
    'end': 9.0,
}


def frames(fps: int) -> dict:
    """The same marks as whole frames, for anything keyframing to them."""
    return {name: int(round(seconds * fps)) for name, seconds in STORY.items()}


def seconds() -> dict:
    """The marks as they are written, for anything working in time."""
    return dict(STORY)
