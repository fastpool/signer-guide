#!/usr/bin/env node
/**
 * A lesson card — one thing the chain taught us, drawn to be shared.
 *
 *   pnpm card:lesson                     public/lessons/seat-price-142.png
 *   pnpm card:lesson --out /tmp/x.png    somewhere else
 *   pnpm card:lesson --quick             skip the render, reuse the last one
 *
 * The lesson here is cycle 142's: what it costs to hold a seat in the signer
 * set went up, and a pool that had not moved a single STX lost its seat
 * because of it.
 *
 * ## Why these numbers are written down rather than read
 *
 * `make-share-card.mjs` refuses to bake in anything that moves weekly, and it
 * is right to: an og:image is cached hard and a rate baked into one is a rate
 * nobody can correct. This card is the other kind. It is about two named
 * cycles that are over, so the figures cannot go stale — they are history the
 * moment they are true. What they came from is `src/data/signer-nodes.json`
 * for 142 and the same endpoint asked for 141; both are in the arguments so a
 * later cycle's lesson is a different invocation rather than a different file.
 *
 * ## The seahorse
 *
 * Rendered by `seahorse3d.py` beside it, which is Blender turning Fast Pool's
 * own mark into a solid object. It takes a few seconds and needs Blender on
 * the PATH; `--quick` reuses whatever it rendered last, for iterating on the
 * words without waiting on the picture.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const GRAPE = '#403374';
const CREAM = '#fdf8f3';
const AMBER = '#f2c891';
/** A deeper grape for the ground, so the character lifts off it. */
const DEEP = '#2a2140';

const W = 1200;
const H = 675;
const PAD = 76;

const root = path.resolve(import.meta.dirname, '..', '..');
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};

const target = arg('out', path.join(root, 'public/lessons/seat-price-142.png'));
const quick = argv.includes('--quick');
const render = '/tmp/seahorse-lesson.png';

/*
 * The lesson, as arguments. A later cycle's card is the same drawing with
 * different numbers rather than a copy of this file.
 */
const wasCycle = arg('was-cycle', '141');
const nowCycle = arg('now-cycle', '142');
const was = arg('was', '49,056');
const now = arg('now', '52,687');
const held = arg('held', '50,020');

if (!quick || !existsSync(render)) {
  console.log('rendering the seahorse …');
  execFileSync(
    'blender',
    [
      '-b', '-noaudio', '-P', path.join(root, 'scripts/lesson/seahorse3d.py'), '--',
      '--out', render,
      '--size', '900',
      '--samples', '96',
      '--bg', 'none',
      '--angle', '30',
      '--elevation', '20',
      '--depth', '0.34',
      '--pose', 'lean',
      '--material', 'cream',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

mkdirSync(path.dirname(target), { recursive: true });

/** The character, sized and placed on the left. */
const FIG = 520;
const figX = PAD - 30;
const figY = Math.round((H - FIG) / 2) + 10;

/** Everything else lives to the right of it. */
const textX = figX + FIG - 10;
const textW = W - PAD - textX;

const arrowY = 366;
const arrowX = textX + 232;

execFileSync('magick', [
  '-size', `${W}x${H}`,
  // A soft vertical fall from deep to grape, so the card has some air in it.
  `gradient:${DEEP}-${GRAPE}`,

  // The character first, so every word sits over it rather than under.
  '(', render, '-resize', `${FIG}x${FIG}`, ')',
  '-geometry', `+${figX}+${figY}`, '-composite',

  // Who is teaching, and about what.
  '-stroke', 'none', '-fill', AMBER,
  '-font', 'DejaVu-Sans-Bold', '-pointsize', '22',
  '-annotate', `+${textX}+${PAD + 84}`, `CYCLE ${nowCycle} · WHAT A SEAT COSTS`,

  // The lesson, in as few words as it can be put.
  '-fill', CREAM, '-font', 'DejaVu-Sans-Bold', '-pointsize', '54',
  '-annotate', `+${textX}+${PAD + 158}`, 'The price of a',
  '-annotate', `+${textX}+${PAD + 222}`, 'signer seat rose.',

  // The two figures, with the old one quietened and struck through.
  '-fill', 'rgba(253,248,243,0.45)',
  '-font', 'DejaVu-Sans-Bold', '-pointsize', '46',
  '-annotate', `+${textX}+${arrowY}`, was,
  '-stroke', 'rgba(253,248,243,0.45)', '-strokewidth', '3',
  '-draw', `line ${textX},${arrowY - 15} ${textX + 152},${arrowY - 15}`,

  '-stroke', 'none', '-fill', 'rgba(253,248,243,0.55)',
  '-font', 'DejaVu-Sans', '-pointsize', '38',
  '-annotate', `+${arrowX}+${arrowY}`, '→',

  '-fill', AMBER, '-font', 'DejaVu-Sans-Bold', '-pointsize', '54',
  '-annotate', `+${arrowX + 56}+${arrowY}`, now,
  '-fill', 'rgba(253,248,243,0.72)', '-font', 'DejaVu-Sans', '-pointsize', '26',
  '-annotate', `+${arrowX + 56 + now.length * 34 + 20}+${arrowY}`, 'STX',

  '-fill', 'rgba(253,248,243,0.55)', '-font', 'DejaVu-Sans', '-pointsize', '20',
  '-annotate', `+${textX}+${arrowY + 34}`,
  `cycle ${wasCycle}                    cycle ${nowCycle}`,

  // Why, in the fewest words that are still true.
  '-fill', 'rgba(253,248,243,0.86)', '-font', 'DejaVu-Sans', '-pointsize', '23',
  '-annotate', `+${textX}+${arrowY + 92}`,
  'Slots are shared in proportion, then rounded.',
  '-annotate', `+${textX}+${arrowY + 126}`,
  'Under half a slot is no seat at all.',

  '-fill', 'rgba(253,248,243,0.62)', '-font', 'DejaVu-Sans', '-pointsize', '21',
  '-annotate', `+${textX}+${arrowY + 176}`,
  `One pool sat on ${held} STX and did not move it.`,
  '-annotate', `+${textX}+${arrowY + 206}`,
  `Seated in ${wasCycle} at 0.5097 slots. Out in ${nowCycle} at 0.4746.`,

  // Where it came from, so a card seen without its note still says. Under
  // the character rather than under the words, which the last line of the
  // explanation was already sitting on.
  '-fill', 'rgba(253,248,243,0.5)', '-font', 'DejaVu-Sans', '-pointsize', '21',
  '-annotate', `+${PAD}+${H - PAD + 10}`, 'signer-guide.fastpool.org',

  '-depth', '8', '-strip',
  target,
]);

console.log(
  `drew ${path.relative(process.cwd(), target)} — ${was} → ${now} STX ` +
    `between cycles ${wasCycle} and ${nowCycle}`,
);
