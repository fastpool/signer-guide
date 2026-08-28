#!/usr/bin/env node
/**
 * The splash mark: the app's icon, inverted, on grape.
 *
 * `app.json` paints the ground (`splash.backgroundColor: #403374`), so this
 * draws only what sits on it — a white rounded tile with the grape mark inside
 * — on transparency. Inverted rather than the launcher icon repeated: the
 * launcher icon is a grape tile, and a grape tile on a grape ground is a mark
 * floating with no container at all.
 *
 * Geometry is the hand-off's, in a 32-unit box, scaled — the same numbers
 * `src/components/Mark.tsx` draws from, so the splash and the in-app mark
 * cannot drift.
 *
 *   node scripts/make-splash.mjs
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const GRAPE = '#403374';
const CANVAS = 1024;

/** The white tile, as a fraction of the canvas, and the mark within it. */
const TILE = 0.43;
const MARK_IN_TILE = 0.62;

const tile = CANVAS * TILE;
const tileLeft = (CANVAS - tile) / 2;
const tileRight = tileLeft + tile;
const tileRadius = tile * 0.27;

const mark = tile * MARK_IN_TILE;
const scale = mark / 32;
const origin = (CANVAS - mark) / 2;

const at = (u) => Math.round(origin + u * scale);
const r = Math.round(5.4 * scale);
const stroke = Math.round(2 * scale);

const target = path.resolve(
  import.meta.dirname,
  '..',
  'assets/splash-icon.png',
);

execFileSync('magick', [
  '-size', `${CANVAS}x${CANVAS}`, 'xc:none',

  '-fill', '#ffffff', '-stroke', 'none',
  '-draw',
  `roundrectangle ${Math.round(tileLeft)},${Math.round(tileLeft)} ` +
    `${Math.round(tileRight)},${Math.round(tileRight)} ` +
    `${Math.round(tileRadius)},${Math.round(tileRadius)}`,

  '-fill', GRAPE,
  '-draw', `circle ${at(12.5)},${at(16)} ${at(12.5)},${at(16) - r}`,

  '-fill', 'none', '-stroke', GRAPE, '-strokewidth', String(stroke),
  '-draw', `circle ${at(20.5)},${at(16)} ${at(20.5)},${at(16) - r}`,

  target,
]);

console.log(`drew ${path.relative(process.cwd(), target)}`);
