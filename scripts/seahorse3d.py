#!/usr/bin/env -S blender -b -noaudio -P
"""
Fast Pool's seahorse, in three dimensions, from the mark the guide already has.

    blender -b -noaudio -P scripts/seahorse3d.py -- --out /tmp/seahorse.png
    blender -b -noaudio -P scripts/seahorse3d.py -- --help

The mark in `public/fastpool-logo.svg` is one path. This imports it as a curve,
gives it depth and a bevelled edge, lights it, and renders it — so the thing on
screen is the logo itself rather than a drawing of one. Nothing here is traced
by hand, which is the point: change the SVG and the character changes with it.

## Meant to be reused

Every choice a scene needs is an argument, so the next picture does not need a
new script — a different angle, a different colour, a floor or no floor, a
still or a spin. The card in `scripts/make-lesson-card.mjs` calls this with one
set of arguments; anything else can call it with another.

    --pose        upright | lean | dive | curl   how the character is held
    --angle       degrees around it, 0 is head-on
    --elevation   degrees above it
    --material    cream | grape | amber | glass
    --bg          a hex colour, or `none` for transparency
    --floor       draw a ground plane and let it catch the shadow
    --size        pixels, square unless --height is given
    --samples     more is cleaner and slower
    --engine      eevee (seconds) | cycles (minutes, softer light)
    --frames N    render a sequence instead of a still
    --spin D      degrees of turntable across those frames

## Video

The same script, with `--frames`. A turntable is the default motion because it
is the one every character needs; anything else is a matter of putting
different keyframes on the same object, in the block at the bottom of `main`.

    blender -b -noaudio -P scripts/seahorse3d.py -- \
      --out /tmp/spin/f --frames 96 --spin 360 --size 1280 --height 720
    ffmpeg -framerate 24 -i /tmp/spin/f%04d.png \
      -c:v libx264 -pix_fmt yuv420p -crf 20 spin.mp4

Measured on this machine: 96 frames at 1280x720 and 48 samples took 25 seconds
to render and one to mux, for a 4-second clip of 400KB. Rendering is not what
makes a video expensive — deciding what should move is.

## Why a curve and not a sculpt

The seahorse is a logo, and a logo extruded is still recognisably itself.
Modelling a creature would be prettier and would also be somebody's drawing
rather than Fast Pool's mark — and it could not be regenerated from the SVG
when the mark changes. Depth, a bevel and good light are enough to read as
three-dimensional, and they stay honest to the original.
"""

import argparse
import math
import os
import sys

import addon_utils
import bpy

HERE = os.path.dirname(os.path.realpath(__file__))
LOGO = os.path.join(HERE, '..', 'public', 'fastpool-logo.svg')

# The guide's palette, so a render drops into the site without a colour clash.
PALETTE = {
    'cream': '#fdf8f3',
    'grape': '#403374',
    'amber': '#f2c891',
    'ink': '#1c1630',
}

POSES = {
    # (x tilt, y tilt, z turn) in degrees, applied to the character itself.
    'upright': (0.0, 0.0, 0.0),
    'lean': (0.0, 0.0, -14.0),
    'dive': (0.0, 0.0, -38.0),
    'curl': (12.0, 0.0, 18.0),
}


def srgb_to_linear(component: float) -> float:
    """Blender works in linear light; hex colours are sRGB."""
    if component <= 0.04045:
        return component / 12.92
    return ((component + 0.055) / 1.055) ** 2.4


def rgba(value: str, alpha: float = 1.0):
    """`#rrggbb` as the linear RGBA tuple Blender wants."""
    hex_value = PALETTE.get(value, value).lstrip('#')
    parts = [int(hex_value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[srgb_to_linear(p) for p in parts], alpha)


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog='seahorse3d',
        description="Render Fast Pool's mark as a 3D character.",
    )
    parser.add_argument('--out', default='/tmp/seahorse.png')
    parser.add_argument('--pose', default='lean', choices=sorted(POSES))
    parser.add_argument('--angle', type=float, default=22.0)
    parser.add_argument('--elevation', type=float, default=14.0)
    parser.add_argument('--material', default='cream')
    parser.add_argument('--bg', default='none')
    parser.add_argument('--floor', action='store_true')
    parser.add_argument('--size', type=int, default=1024)
    parser.add_argument('--height', type=int, default=0)
    parser.add_argument('--depth', type=float, default=0.22, help='extrusion')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--engine', default='eevee', choices=['eevee', 'cycles'])
    parser.add_argument('--frames', type=int, default=0)
    parser.add_argument('--spin', type=float, default=360.0)
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_mark(depth: float):
    """The logo as one solid object, centred on the origin and 2 units tall."""
    addon_utils.enable('io_curve_svg', default_set=False, persistent=True)
    bpy.ops.import_curve.svg(filepath=os.path.normpath(LOGO))

    curves = [o for o in bpy.data.objects if o.type == 'CURVE']
    if not curves:
        raise SystemExit('the logo did not import as a curve')

    mark = curves[0]
    # Selected, not merely active. `transform_apply` works on the selection, so
    # an active-but-unselected object keeps its scale as an object property —
    # and every length set afterwards is multiplied by it. That is a three
    # hundred times too deep extrusion and a render of nothing but slab.
    bpy.ops.object.select_all(action='DESELECT')
    for other in curves:
        other.select_set(True)
    bpy.context.view_layer.objects.active = mark
    if len(curves) > 1:
        bpy.ops.object.join()
    mark.select_set(True)

    # Flat and filled first: a 2D curve is what closes the outline, and it is
    # all the curve is needed for.
    data = mark.data
    data.dimensions = '2D'
    data.fill_mode = 'BOTH'
    data.resolution_u = 24

    # Baked to a mesh before anything is measured or moved. Blender will not
    # apply a rotation to a 2D curve, and a length set on a curve is multiplied
    # by whatever object scale is still hanging about — which is how a depth of
    # a fifth of a unit arrives three hundred times too deep and the render is
    # a slab seen edge-on. On a mesh every number below is in final units.
    bpy.ops.object.convert(target='MESH')
    mark = bpy.context.object
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    mark.location = (0.0, 0.0, 0.0)

    bpy.context.view_layer.update()
    tallest = max(mark.dimensions.x, mark.dimensions.y) or 1.0
    mark.scale = (2.0 / tallest,) * 3
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Depth and a rounded edge, as modifiers, so the light has something to
    # catch. Without the bevel it reads as a sticker however it is lit.
    solidify = mark.modifiers.new(name='depth', type='SOLIDIFY')
    solidify.thickness = depth
    solidify.offset = 0.0
    bevel = mark.modifiers.new(name='edge', type='BEVEL')
    bevel.width = depth * 0.12
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(40.0)
    bpy.ops.object.modifier_apply(modifier='depth')
    bpy.ops.object.modifier_apply(modifier='edge')

    # The SVG lands in the XY plane facing +Z; stand it up to face the camera.
    mark.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    mark.location = (0.0, 0.0, 0.0)

    # Smooth where the bevel curves, flat where the extrusion is flat.
    bpy.ops.object.shade_smooth()
    if hasattr(mark.data, 'use_auto_smooth'):
        mark.data.use_auto_smooth = True
        mark.data.auto_smooth_angle = math.radians(35.0)

    print(
        f'seahorse3d: mark is {mark.dimensions.x:.2f} x {mark.dimensions.y:.2f}'
        f' x {mark.dimensions.z:.2f} units'
    )
    return mark


def apply_material(mark, choice: str):
    material = bpy.data.materials.new(name=f'seahorse-{choice}')
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']

    if choice == 'glass':
        bsdf.inputs['Base Color'].default_value = rgba('cream')
        bsdf.inputs['Roughness'].default_value = 0.05
        bsdf.inputs['Transmission Weight'].default_value = 1.0
        bsdf.inputs['IOR'].default_value = 1.45
    else:
        bsdf.inputs['Base Color'].default_value = rgba(choice)
        bsdf.inputs['Roughness'].default_value = 0.34
        bsdf.inputs['Metallic'].default_value = 0.0
        # A clear coat gives the highlight that says "solid" more than any
        # amount of extrusion does.
        if 'Coat Weight' in bsdf.inputs:
            bsdf.inputs['Coat Weight'].default_value = 0.35
            bsdf.inputs['Coat Roughness'].default_value = 0.12

    mark.data.materials.append(material)
    return material


def light_scene(bg: str, floor: bool):
    world = bpy.data.worlds.new('world')
    bpy.context.scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (
        rgba('#2a2140') if bg == 'none' else rgba(bg)
    )
    background.inputs['Strength'].default_value = 0.55

    def add_light(name, kind, location, energy, size, rotation=(0, 0, 0)):
        data = bpy.data.lights.new(name=name, type=kind)
        data.energy = energy
        if kind == 'AREA':
            data.size = size
        obj = bpy.data.objects.new(name=name, object_data=data)
        obj.location = location
        obj.rotation_euler = rotation
        bpy.context.collection.objects.link(obj)
        return obj

    # Three lights and no more: a key that models the form, a fill that keeps
    # the shadow side readable, and a rim that separates it from the ground.
    key = add_light('key', 'AREA', (3.4, -4.2, 4.0), 900.0, 6.0)
    key.rotation_euler = (math.radians(48), 0.0, math.radians(38))
    fill = add_light('fill', 'AREA', (-4.0, -3.0, 1.2), 220.0, 8.0)
    fill.rotation_euler = (math.radians(80), 0.0, math.radians(-52))
    rim = add_light('rim', 'AREA', (-1.6, 3.8, 2.6), 500.0, 4.0)
    rim.rotation_euler = (math.radians(115), 0.0, math.radians(-160))

    if floor:
        bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -1.35))
        plane = bpy.context.object
        material = bpy.data.materials.new(name='floor')
        material.use_nodes = True
        bsdf = material.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = rgba(
            '#2a2140' if bg == 'none' else bg
        )
        bsdf.inputs['Roughness'].default_value = 0.9
        plane.data.materials.append(material)


def place_camera(angle: float, elevation: float, distance: float = 7.6):
    theta = math.radians(angle)
    phi = math.radians(elevation)
    location = (
        distance * math.cos(phi) * math.sin(theta),
        -distance * math.cos(phi) * math.cos(theta),
        distance * math.sin(phi),
    )
    camera_data = bpy.data.cameras.new('camera')
    camera_data.lens = 85.0
    camera = bpy.data.objects.new('camera', camera_data)
    camera.location = location
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    # Aim it at the middle of the character rather than solving the angles by
    # hand: a constraint keeps pointing at it through a turntable too.
    target = bpy.data.objects.new('target', None)
    target.location = (0, 0, 0)
    bpy.context.collection.objects.link(target)
    track = camera.constraints.new(type='TRACK_TO')
    track.target = target
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    return camera


def configure_render(args):
    scene = bpy.context.scene
    scene.render.engine = (
        'CYCLES' if args.engine == 'cycles' else 'BLENDER_EEVEE'
    )
    if args.engine == 'cycles':
        scene.cycles.samples = args.samples
        scene.cycles.use_denoising = True
    else:
        scene.eevee.taa_render_samples = args.samples
        scene.eevee.use_gtao = True
        scene.eevee.use_ssr = True

    scene.render.resolution_x = args.size
    scene.render.resolution_y = args.height or args.size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = args.bg == 'none'
    scene.view_settings.view_transform = 'Standard'


def main():
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    args = parse_args(argv)

    clear_scene()
    mark = import_mark(args.depth)
    apply_material(mark, args.material)

    tilt_x, tilt_y, turn_z = POSES[args.pose]
    mark.rotation_euler = (
        mark.rotation_euler.x + math.radians(tilt_x),
        math.radians(tilt_y),
        math.radians(turn_z),
    )

    light_scene(args.bg, args.floor)
    place_camera(args.angle, args.elevation)
    configure_render(args)

    scene = bpy.context.scene
    if args.frames > 0:
        # A turntable by default, and any other motion is a matter of putting
        # different keyframes on the same object.
        scene.frame_start = 1
        scene.frame_end = args.frames
        start = mark.rotation_euler.z
        mark.rotation_euler.z = start
        mark.keyframe_insert('rotation_euler', index=2, frame=1)
        mark.rotation_euler.z = start + math.radians(args.spin)
        mark.keyframe_insert('rotation_euler', index=2, frame=args.frames)
        for curve in mark.animation_data.action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = 'LINEAR'

        scene.render.filepath = args.out
        bpy.ops.render.render(animation=True)
        print(f'seahorse3d: {args.frames} frames to {args.out}####.png')
    else:
        scene.render.filepath = args.out
        bpy.ops.render.render(write_still=True)
        print(f'seahorse3d: {args.out}')


if __name__ == '__main__':
    main()
