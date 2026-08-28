#!/usr/bin/env node
/**
 * Turning device screenshots into the sizes the stores will take.
 *
 * `e2e/screenshots.yaml` captures the app running, at whatever the phone's
 * resolution is — 1080×2340 on the device these were made on. That is a 1:2.17
 * aspect ratio, which is taller than Google Play accepts (it wants between 1:2
 * and 2:1), so a raw device screenshot is rejected without ever being looked
 * at. This letterboxes each one onto a 1080×1920 canvas in the app's own
 * background colour and writes a caption above it.
 *
 * Zapstore takes the raw ones: it is a nostr relay with a manifest, not a
 * review queue with a spec.
 *
 * The App Store is not written here, and cannot be from Linux — Apple requires
 * screenshots at iPhone resolutions from an iOS build. See store/README.md.
 *
 *   maestro test e2e/screenshots.yaml   # capture
 *   node scripts/frame-screenshots.mjs  # frame
 *
 * Needs ImageMagick 7 (`magick`) on the PATH.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const raw = path.join(root, 'store/screenshots/raw');
const out = path.join(root, 'store/screenshots/play');

const BACKGROUND = '#0B0D12';
const ACCENT = '#F7931A';
const TEXT = '#E8ECF3';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const WIDTH = 1080;
const HEIGHT = 1920;
const CAPTION_HEIGHT = 300;

/*
 * The phone's own furniture, cropped off.
 *
 * The status bar carries a USB-debugging icon that says more about how the
 * screenshot was made than about the app, and Android's white navigation bar
 * sits under a dark app looking like a rendering fault. Both are the device's,
 * not the app's, and neither belongs in a store listing.
 *
 * Measured on the 1080×2340 device these were captured from. A phone with
 * different bars needs different numbers — which is the sort of thing that
 * should be a constant with its provenance written down rather than a magic
 * number in a command line.
 */
const STATUS_BAR = 74;
const NAVIGATION_BAR = 130;

/**
 * What each screenshot is for.
 *
 * Ordered as the store shows them, which is the order somebody scrolls: what
 * they get, then how little it takes, then what it looks like once it is
 * running.
 */
const CAPTIONS = {
  '01-welcome': 'Lock STX.\nEarn bitcoin.',
  '02-start': 'Two screens\nto your first stake',
  '03-your-stake': 'What you have staked,\nand what it earns',
  '04-contracts': 'Every contract,\nin plain language',
  '05-pools': 'Every pool,\nand what it holds',
  '06-payouts': 'What each payout\nactually paid',
  '07-the-data': 'Where every number\ncomes from',
  '08-preferences': 'Light or dark,\nEnglish or 한국어',
};

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

if (!existsSync(raw)) {
  console.error(`No screenshots in ${raw}. Run: maestro test e2e/screenshots.yaml`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });

const files = readdirSync(raw)
  .filter((name) => name.endsWith('.png'))
  .sort();

if (files.length === 0) {
  console.error(`No PNGs in ${raw}.`);
  process.exit(1);
}

for (const file of files) {
  const key = path.basename(file, '.png');
  const caption = CAPTIONS[key];
  if (!caption) {
    console.warn(`No caption for ${key} — skipped. Add one to CAPTIONS.`);
    continue;
  }

  const shotHeight = HEIGHT - CAPTION_HEIGHT;
  const target = path.join(out, `${key}.png`);

  magick([
    '-size', `${WIDTH}x${HEIGHT}`,
    `xc:${BACKGROUND}`,

    // The caption, left-aligned on the same margin the app uses.
    '-font', FONT,
    '-pointsize', '62',
    '-fill', TEXT,
    '-annotate', '+72+140', caption,

    // A rule under it, in the colour the app uses for anything paid in sats.
    '-fill', ACCENT,
    '-draw', `rectangle 72,${CAPTION_HEIGHT - 46} 200,${CAPTION_HEIGHT - 40}`,

    // The screenshot itself: the phone's bars cropped away, then scaled to
    // fit what the caption leaves and centred.
    '(', path.join(raw, file),
    '-gravity', 'North',
    '-chop', `0x${STATUS_BAR}`,
    '-gravity', 'South',
    '-chop', `0x${NAVIGATION_BAR}`,
    '-resize', `${WIDTH - 144}x${shotHeight - 40}`,
    ')',
    '-gravity', 'South',
    '-geometry', '+0+20',
    '-composite',

    target,
  ]);

  console.log(`framed ${key}`);
}

console.log(`\n${files.length} screenshots in store/screenshots/play`);
