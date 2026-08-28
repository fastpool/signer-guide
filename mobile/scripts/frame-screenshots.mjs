#!/usr/bin/env node
/**
 * Turning device screenshots into the store's carousel.
 *
 * `e2e/screenshots.yaml` captures the app running, at whatever the phone's
 * resolution is — 1080×2340 on the device these were made on. Two things are
 * wrong with a raw capture as a store asset: it is 1:2.17, which is taller
 * than Google Play accepts (it wants between 1:2 and 2:1), and it carries the
 * phone's own furniture — a status bar with a USB-debugging icon, a white
 * navigation bar under a dark app.
 *
 * So each one is cropped, captioned and bled into a 1080×1920 frame. The bands
 * alternate grape and cream so the strip reads as a set rather than as eight
 * unrelated pictures, and each caption makes one claim.
 *
 *   maestro test e2e/screenshots.yaml     # capture
 *   node scripts/frame-screenshots.mjs    # frame, and draw the feature graphic
 *
 * Needs ImageMagick 7 (`magick`) on the PATH.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const raw = path.join(root, 'store/screenshots/raw');
const out = path.join(root, 'store/screenshots/play');

/* The web guide's palette, which the app now shares. */
const GRAPE = '#403374';
const CREAM = '#fdf8f3';
const INK = '#2c2a35';
const AMBER_ON_GRAPE = '#f2c891';
const WHITE = '#ffffff';

const BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const BOOK = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const WIDTH = 1080;
const HEIGHT = 1920;
const BAND = 470;

/*
 * The phone's own furniture, cropped off. Measured on the 1080×2340 device
 * these were captured from — a phone with different bars needs different
 * numbers, which is the sort of thing that should be a constant with its
 * provenance written down rather than a magic number in a command line.
 */
const STATUS_BAR = 74;
const NAVIGATION_BAR = 130;

/**
 * One claim each, in the order somebody scrolls a store listing: what they
 * get, then how little it takes, then what it looks like running.
 */
const CAPTIONS = {
  '01-welcome': {
    index: '01 · THE NUMBER',
    headline: 'What a staked STX\nis earning, right now',
    sub: 'Per payout, with the period written out — not a\nyear’s rate dressed up as a week’s.',
  },
  '02-start': {
    index: '02 · TWO SCREENS',
    headline: 'Pick a wallet,\nsay how much',
    sub: 'The pool, the rewards and the lock are already set,\nshown to you, and every one of them changeable.',
  },
  '03-your-stake': {
    index: '03 · YOUR STAKE',
    headline: 'Your STX stays\nin your own wallet',
    sub: 'Locked, not sent. Watch any address without\nconnecting anything at all.',
  },
  '04-contracts': {
    index: '04 · THE CHOICE',
    headline: '45 pools run\n6 pieces of code',
    sub: 'Each one read, hashed and written up in plain\nlanguage. Pick the rules, then the pool.',
  },
  '05-pools': {
    index: '05 · EVERY POOL',
    headline: 'Identified by its code,\nnot by its name',
    sub: 'Anyone can deploy a contract called signer-manager.\nOnly the hash says whose it is.',
  },
  '06-payouts': {
    index: '06 · THE RECEIPTS',
    headline: 'What every payout\nactually paid',
    sub: 'Cycle by cycle, from pox-5’s own numbers. The\nestimate is shown against the record it came from.',
  },
  '07-the-data': {
    index: '07 · NOTHING HIDDEN',
    headline: 'Where every number\ncomes from',
    sub: 'Which file, when it was generated, which node was\nasked. Made by a pool that lists its rivals the same way.',
  },
  '08-preferences': {
    index: '08 · YOURS TO SET',
    headline: 'Light or dark,\nEnglish or 한국어',
    sub: 'Including the contract descriptions, which the guide\nhad already translated.',
  },
};

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function frame(file, caption, onGrape) {
  const key = path.basename(file, '.png');
  const ground = onGrape ? GRAPE : CREAM;
  const headlineColor = onGrape ? WHITE : GRAPE;
  const indexColor = onGrape ? AMBER_ON_GRAPE : '#8a5a2b';
  const subColor = onGrape ? '#cdc6e0' : '#6b6577';
  const shot = path.join(raw, file);
  const target = path.join(out, `${key}.png`);

  /*
   * Two passes rather than one long command.
   *
   * The device capture is cropped and resized on its own, then composited onto
   * a captioned ground. Doing it in one command meant `-gravity`, set for the
   * composite, was still in force for the `-crop` that followed it, and the
   * whole frame came out blank — a class of bug that only exists because the
   * settings are global.
   */
  const prepared = path.join(out, `.${key}.device.png`);
  magick([
    shot,
    '-gravity', 'North', '-chop', `0x${STATUS_BAR}`,
    '-gravity', 'South', '-chop', `0x${NAVIGATION_BAR}`,
    '-resize', `${WIDTH - 176}x`,
    prepared,
  ]);

  magick([
    '-size', `${WIDTH}x${HEIGHT}`, `xc:${ground}`,
    '-gravity', 'NorthWest',

    '-font', BOLD, '-pointsize', '30', '-fill', indexColor,
    '-annotate', '+72+120', caption.index,

    '-font', BOLD, '-pointsize', '60', '-fill', headlineColor,
    '-interline-spacing', '16',
    '-annotate', '+72+200', caption.headline,

    '-font', BOOK, '-pointsize', '27', '-fill', subColor,
    '-interline-spacing', '10',
    '-annotate', `+72+${BAND - 96}`, caption.sub,

    // Bled off the bottom: a whole phone shrunk to fit would put the app at a
    // size nobody can read.
    prepared, '-geometry', `+88+${BAND}`, '-composite',
    target,
  ]);

  rmSync(prepared, { force: true });
  console.log(`framed ${key}`);
}

/**
 * The Play feature graphic — 1024×500, and no screenshot inside it.
 *
 * Play crops and overlays this asset hard, so anything small in it is lost.
 * What survives is the mark, one claim, and one figure.
 */
function featureGraphic(rate) {
  const target = path.join(root, 'store/play/en-US/images/featureGraphic.png');
  mkdirSync(path.dirname(target), { recursive: true });

  magick([
    '-size', '1024x500', `xc:${GRAPE}`,

    // The mark: one filled circle and one outlined, overlapping.
    '-fill', WHITE, '-draw', 'circle 74,66 74,83',
    '-fill', 'none', '-stroke', WHITE, '-strokewidth', '6',
    '-draw', 'circle 116,66 116,83', '-stroke', 'none',

    '-font', BOLD, '-pointsize', '30', '-fill', WHITE,
    '-annotate', '+150+78', 'Signer Guide',

    '-font', BOLD, '-pointsize', '62', '-fill', WHITE,
    '-interline-spacing', '10',
    '-annotate', '+74+210', 'Lock STX.\nEarn bitcoin.',

    '-font', BOOK, '-pointsize', '26', '-fill', 'rgba(255,255,255,0.72)',
    '-interline-spacing', '8',
    '-annotate', '+74+390',
    'Staked in your own wallet. Paid in bitcoin,\nevery week. 45 pools, read and hashed.',

    // A translucent panel holding the figure.
    '-fill', 'rgba(255,255,255,0.08)', '-stroke', 'rgba(255,255,255,0.16)',
    '-strokewidth', '1',
    '-draw', 'roundrectangle 640,110 960,390 22,22', '-stroke', 'none',

    '-font', BOLD, '-pointsize', '22', '-fill', 'rgba(255,255,255,0.65)',
    '-annotate', '+676+176', 'EARNING NOW',
    '-font', BOLD, '-pointsize', '92', '-fill', AMBER_ON_GRAPE,
    '-annotate', '+676+272', rate,
    '-font', BOOK, '-pointsize', '24', '-fill', 'rgba(255,255,255,0.78)',
    '-interline-spacing', '6',
    '-annotate', '+676+320', 'sats per 1,000 STX,\neach payout',

    target,
  ]);
  console.log('drew store/play/en-US/images/featureGraphic.png');
}

if (!existsSync(raw)) {
  console.error(`No screenshots in ${raw}. Run: maestro test e2e/screenshots.yaml`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });

const files = readdirSync(raw).filter((n) => n.endsWith('.png')).sort();
if (files.length === 0) {
  console.error(`No PNGs in ${raw}.`);
  process.exit(1);
}

let index = 0;
for (const file of files) {
  const caption = CAPTIONS[path.basename(file, '.png')];
  if (!caption) {
    console.warn(`No caption for ${file} — skipped. Add one to CAPTIONS.`);
    continue;
  }
  frame(file, caption, index % 2 === 0);
  index += 1;
}

/* The published figure, so the graphic cannot claim a rate nobody is paying. */
const calculations = JSON.parse(
  await import('node:fs/promises').then((fs) =>
    fs.readFile(path.join(root, '../src/data/stx-only-calculations.json'), 'utf8'),
  ),
);
featureGraphic(calculations.rateSatsPer1000Stx ?? '—');

console.log(`\n${index} screenshots in store/screenshots/play`);
