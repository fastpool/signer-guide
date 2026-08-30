#!/usr/bin/env -S blender -b -noaudio -P
"""
The lesson as a film: what a signer seat cost, and the pool that lost one.

    blender -b -noaudio -P scripts/seahorse-explainer.py -- --out /tmp/lesson.mp4
    blender -b -noaudio -P scripts/seahorse-explainer.py -- --draft   # fast look

Same story as `scripts/make-lesson-card.mjs` draws as a still, told in the
order somebody would tell it: nothing moved, the bar rose, and the seat went.

## The storyboard

Nine seconds, five beats, and every one of them is a fact from cycle 142:

  1  settle    the seahorse stands on its seat. Two bars beside it: what the
               pool holds, and what half a slot costs. The first is taller.
  2  the rise  half a slot climbs from 49,056 STX to 52,687 while the number
               counts up with it. The pool's bar does not move, because the
               pool did not move it.
  3  the pass  the amber bar goes by the cream one. This is the whole lesson
               and it is given a second on its own to land.
  4  the turn  the seahorse turns to face what has happened, and the seat
               shrinks under it — a share of a slot, getting smaller.
  5  the drop  the seat falls away. 0.4746 slots is not a seat.

The numbers are arguments, so cycle 143's version is a different invocation
rather than a fork of this file.

## How the counting works

Text cannot be keyframed the way a position can, so the number is rewritten
on every frame by a `frame_change_pre` handler. That is the one piece of this
worth knowing before editing it: the scene is not fully described until the
frame is being drawn.

## Cost

The measurement from `seahorse3d.py` holds — 96 frames at 720p took 25
seconds — so nine seconds of this is about a minute. What a video costs is
the storyboard above, not the rendering.
"""

import argparse
import importlib.util
import math
import os
import shutil
import subprocess
import sys
import tempfile

import bpy

HERE = os.path.dirname(os.path.realpath(__file__))

# The character is built by the other script rather than copied out of it: one
# definition of the seahorse, so a change to the mark reaches the film too.
_spec = importlib.util.spec_from_file_location(
    'seahorse3d', os.path.join(HERE, 'seahorse3d.py')
)
seahorse3d = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seahorse3d)

rgba = seahorse3d.rgba
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

FPS = 24


def beats(fps: int):
    """The storyboard in frames, so the timings are read rather than counted."""
    second = lambda s: int(round(s * fps))  # noqa: E731
    return {
        'settle_end': second(1.6),
        'rise_start': second(1.6),
        'rise_end': second(4.6),
        'pass_end': second(5.4),
        'turn_start': second(5.4),
        'turn_end': second(6.4),
        'drop_start': second(6.6),
        'drop_end': second(7.6),
        'end': second(9.0),
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(prog='seahorse-explainer')
    parser.add_argument(
        '--out',
        default=os.path.join(HERE, '..', 'public', 'lessons', 'seat-price-142.mp4'),
    )
    parser.add_argument('--was', type=int, default=49056, help='half a slot, before')
    parser.add_argument('--now', type=int, default=52687, help='half a slot, after')
    parser.add_argument('--held', type=int, default=50020, help='what the pool held')
    parser.add_argument('--was-cycle', default='141')
    parser.add_argument('--now-cycle', default='142')
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--fps', type=int, default=FPS)
    parser.add_argument('--samples', type=int, default=48)
    parser.add_argument('--draft', action='store_true', help='small and rough')
    parser.add_argument('--frames-only', action='store_true')
    return parser.parse_args(argv)


# The camera sits this far round from head-on, and the words are turned to
# match so they read square rather than in perspective.
CAMERA_ANGLE = 13.0


def text(body, size, colour, location, align='LEFT', lean=0.0):
    """
    A word in the scene, standing up and facing the camera.

    Blender lays a new text object flat in the XY plane, pointing at the
    ceiling — which renders as a bright edge and nothing else. Every string
    here is turned upright and then round to meet the lens.
    """
    rotation = (
        math.radians(90.0 + lean),
        0.0,
        math.radians(CAMERA_ANGLE),
    )
    bpy.ops.object.text_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.data.body = body
    obj.data.size = size
    obj.data.align_x = align
    obj.data.extrude = size * 0.02
    if os.path.exists(FONT):
        obj.data.font = bpy.data.fonts.load(FONT)

    material = bpy.data.materials.new(name=f'text-{body[:8]}')
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = rgba(colour)
    bsdf.inputs['Roughness'].default_value = 0.5
    obj.data.materials.append(material)
    return obj


def block(name, colour, location, size):
    """One of the two bars: a box that scales from its foot, not its middle."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    material = bpy.data.materials.new(name=f'bar-{name}')
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = rgba(colour)
    bsdf.inputs['Roughness'].default_value = 0.38
    if 'Coat Weight' in bsdf.inputs:
        bsdf.inputs['Coat Weight'].default_value = 0.3
    obj.data.materials.append(material)
    return obj


def ease(obj, prop, frames, values, index=-1):
    """Keyframes with a soft start and stop, which is most of what motion is."""
    for frame, value in zip(frames, values):
        if index == -1:
            setattr(obj, prop, value)
            obj.keyframe_insert(prop, frame=frame)
        else:
            getattr(obj, prop)[index] = value
            obj.keyframe_insert(prop, index=index, frame=frame)

    if obj.animation_data and obj.animation_data.action:
        for curve in obj.animation_data.action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = 'BEZIER'
                point.easing = 'EASE_IN_OUT'


def frame_camera(distance=14.5, angle=13.0, elevation=9.0, lens=50.0,
                 aim=(-0.7, 0.0, 0.5)):
    """
    A camera for a set, not for an object.

    `seahorse3d.place_camera` frames one character at the origin on an 85mm
    lens, which is right for a portrait and much too tight for this: the film
    is eight units wide and the words are at one end of it. So this one is
    wider, further back, and aimed at the middle of the action rather than at
    zero.
    """
    theta = math.radians(angle)
    phi = math.radians(elevation)
    camera_data = bpy.data.cameras.new('camera')
    camera_data.lens = lens
    camera = bpy.data.objects.new('camera', camera_data)
    camera.location = (
        aim[0] + distance * math.cos(phi) * math.sin(theta),
        aim[1] - distance * math.cos(phi) * math.cos(theta),
        aim[2] + distance * math.sin(phi),
    )
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    target = bpy.data.objects.new('aim', None)
    target.location = aim
    bpy.context.collection.objects.link(target)
    track = camera.constraints.new(type='TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    return camera


def build(args):
    """The whole set, then the motion. Nothing here reads the frame."""
    marks = beats(args.fps)
    seahorse3d.clear_scene()

    mark = seahorse3d.import_mark(0.34)
    seahorse3d.apply_material(mark, 'cream')
    # Standing on the seat, not floating over it: the seat's top face is at
    # -0.72, and the mark is two units tall about its own middle.
    mark.location = (-2.5, 0.0, 0.30)
    mark.scale = (1.0,) * 3
    # Upright already — `import_mark` stands the SVG up and bakes it in, so a
    # second ninety degrees here lays the character on its back.
    mark.rotation_euler = (0.0, 0.0, math.radians(-14.0))

    seahorse3d.light_scene('#2a2140', floor=True)
    camera = frame_camera()

    # The seat: a disc the character stands on, which is the thing it loses.
    bpy.ops.mesh.primitive_cylinder_add(
        radius=1.15, depth=0.28, location=(-2.5, 0.0, -0.86)
    )
    seat = bpy.context.object
    seat.name = 'seat'
    seat_material = bpy.data.materials.new(name='seat')
    seat_material.use_nodes = True
    seat_bsdf = seat_material.node_tree.nodes['Principled BSDF']
    seat_bsdf.inputs['Base Color'].default_value = rgba('amber')
    seat_bsdf.inputs['Roughness'].default_value = 0.4
    seat.data.materials.append(seat_material)

    # The two bars. Cream is what the pool holds and never moves; amber is
    # what half a slot costs, and it is the only thing in the scene that rises.
    held_height = 2.0
    held_bar = block(
        'held', 'cream', (1.35, 0.0, -1.0 + held_height / 2), (0.55, 0.55, held_height)
    )
    price_height_was = held_height * args.was / args.held
    price_height_now = held_height * args.now / args.held
    price_bar = block(
        'price', 'amber', (2.85, 0.0, -1.0 + price_height_was / 2),
        (0.55, 0.55, price_height_was),
    )

    # Labels under each bar, and the count above the rising one.
    # In front of the floor, not under it: the ground plane sits at -1.35.
    text('the pool holds', 0.24, '#fdf8f3', (1.35, -1.0, -1.28), align='CENTER')
    text('half a slot', 0.24, '#f2c891', (2.85, -1.0, -1.28), align='CENTER')

    # The count rides just above the bar it belongs to.
    counter = text(
        f'{args.was:,}', 0.42, '#f2c891', (2.85, -0.4, 1.35), align='CENTER'
    )
    counter.name = 'counter'
    held_label = text(
        f'{args.held:,}', 0.36, '#fdf8f3', (1.35, -0.4, 1.28), align='CENTER'
    )
    held_label.name = 'held-label'

    # The words, which only appear when the picture has earned them.
    cycle_title = text(
        f'CYCLE {args.was_cycle}', 0.34, '#f2c891', (-5.2, -0.6, 2.45)
    )
    verdict = text('0.4746 slots.\nNo seat.', 0.46, '#fdf8f3', (-5.2, -0.6, 1.55))
    verdict.scale = (0.0,) * 3

    # Where it came from, so a clip reposted without its note still says.
    source = text(
        'signer-guide.fastpool.org', 0.2, '#fdf8f3', (-5.2, -0.6, -1.28)
    )
    source.scale = (0.0,) * 3

    # ---- motion -----------------------------------------------------------
    # The bar rises. Everything else in the film is a consequence of this.
    ease(
        price_bar, 'scale',
        [marks['rise_start'], marks['rise_end']],
        [price_height_was, price_height_now],
        index=2,
    )
    ease(
        price_bar, 'location',
        [marks['rise_start'], marks['rise_end']],
        [-1.0 + price_height_was / 2, -1.0 + price_height_now / 2],
        index=2,
    )
    ease(
        counter, 'location',
        [marks['rise_start'], marks['rise_end']],
        [1.35, 1.35 + (price_height_now - price_height_was)],
        index=2,
    )

    # The turn: the character looks at what has just gone past it.
    ease(
        mark, 'rotation_euler',
        [marks['turn_start'], marks['turn_end']],
        [math.radians(-14.0), math.radians(46.0)],
        index=2,
    )

    # The seat shrinks to the share that is left, then goes.
    ease(
        seat, 'scale',
        [marks['turn_start'], marks['turn_end'], marks['drop_start']],
        [1.0, 0.62, 0.48],
        index=0,
    )
    ease(
        seat, 'scale',
        [marks['turn_start'], marks['turn_end'], marks['drop_start']],
        [1.0, 0.62, 0.48],
        index=1,
    )
    ease(
        seat, 'location',
        [marks['drop_start'], marks['drop_end']],
        [-0.86, -7.0],
        index=2,
    )
    ease(
        mark, 'location',
        [marks['drop_start'], marks['drop_start'] + 4, marks['drop_end']],
        [0.35, 0.5, -5.4],
        index=2,
    )

    # And the verdict, which arrives after the drop rather than during it.
    ease(
        verdict, 'scale',
        [marks['drop_end'], marks['drop_end'] + 8],
        [0.0, 1.0],
        index=0,
    )
    for index in (1, 2):
        ease(
            verdict, 'scale',
            [marks['drop_end'], marks['drop_end'] + 8],
            [0.0, 1.0],
            index=index,
        )

    for index in (0, 1, 2):
        ease(
            source, 'scale',
            [marks['drop_end'] + 6, marks['drop_end'] + 14],
            [0.0, 1.0],
            index=index,
        )

    # A slow push in, so the frame tightens as the story does.
    ease(
        camera, 'location',
        [1, marks['end']],
        [camera.location.y, camera.location.y * 0.86],
        index=1,
    )

    return {'counter': counter, 'title': cycle_title, 'marks': marks}


def install_counter(counter, title, marks, args):
    """
    The number, rewritten every frame.

    Text bodies cannot be keyframed, so this is a handler rather than a curve.
    It runs before each frame is drawn, which is also why the scene is not
    fully described by `build` alone.
    """

    def on_frame(scene):
        frame = scene.frame_current
        span = max(1, marks['rise_end'] - marks['rise_start'])
        through = min(1.0, max(0.0, (frame - marks['rise_start']) / span))
        # The same ease the bar uses, so the digits and the height agree.
        eased = through * through * (3.0 - 2.0 * through)
        value = args.was + (args.now - args.was) * eased
        counter.data.body = f'{int(round(value)):,}'
        title.data.body = (
            f'CYCLE {args.was_cycle}'
            if frame < marks['rise_end']
            else f'CYCLE {args.now_cycle}'
        )

    bpy.app.handlers.frame_change_pre.append(on_frame)
    on_frame(bpy.context.scene)


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    args = parse_args(argv)
    if args.draft:
        args.width, args.height, args.samples = 640, 360, 16

    scene_parts = build(args)
    install_counter(
        scene_parts['counter'], scene_parts['title'], scene_parts['marks'], args
    )

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = args.samples
    scene.eevee.use_gtao = True
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.fps = args.fps
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    scene.frame_start = 1
    scene.frame_end = scene_parts['marks']['end']

    frames_dir = tempfile.mkdtemp(prefix='seahorse-explainer-')
    scene.render.filepath = os.path.join(frames_dir, 'f')
    bpy.ops.render.render(animation=True)

    if args.frames_only:
        print(f'seahorse-explainer: frames in {frames_dir}')
        return

    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        print(f'seahorse-explainer: no ffmpeg; frames are in {frames_dir}')
        return

    # Muxed here rather than in Blender's own encoder: one fewer thing to be
    # wrong about pixel formats, and the same invocation the docs suggest.
    subprocess.run(
        [
            ffmpeg, '-y', '-framerate', str(args.fps),
            '-i', os.path.join(frames_dir, 'f%04d.png'),
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
            '-movflags', '+faststart', args.out,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    shutil.rmtree(frames_dir, ignore_errors=True)
    seconds = scene.frame_end / args.fps
    print(
        f'seahorse-explainer: {args.out} — {seconds:.1f}s, '
        f'{args.width}x{args.height}, {scene.frame_end} frames'
    )


if __name__ == '__main__':
    main()
