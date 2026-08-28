#!/usr/bin/env node
/**
 * The card a shared link unfurls into — `public/share-card.png`, 1200×630.
 *
 * Grape ground, the guide's mark and wordmark top-left, the claim in the
 * middle, and a translucent panel on the right carrying the two counts the
 * guide is actually about. The language is the redesign handoff's share card
 * (mock `B4b`); the geometry is this file's.
 *
 * **Nothing here is a figure that moves weekly.** The rate belongs on the page,
 * not on this card: an `og:image` is fetched once and cached hard by every
 * crawler and chat client that sees it, so a rate baked in here is a rate that
 * cannot be corrected. The pool and contract counts move a few times a year and
 * are read from the committed data below, so re-running this after a refresh
 * keeps them honest.
 *
 * Drawn with ImageMagick rather than a headless browser so it needs nothing
 * this repository does not already build with — the same choice, and the same
 * `magick` invocation style, as `mobile/scripts/make-splash.mjs`.
 *
 *   pnpm generate:share-card
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const GRAPE = '#403374';
const CREAM = '#fdf8f3';
/** Amber lightened for a grape ground — display only, not a palette role. */
const AMBER_ON_GRAPE = '#f2c891';

const W = 1200;
const H = 630;
const PAD = 72;

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

const signers = read('src/data/signers.json').signers;
const pools = signers.length;
/*
 * Contracts counted the way the page counts them: by what the code hashes to,
 * which is the guide's whole claim. `profileId` is that identity once the
 * generator has resolved it; a signer with none is one the guide could not
 * place, and it is left out of the count rather than guessed at.
 */
const contracts = new Set(
  signers.map((s) => s.profileId).filter((id) => id !== null),
).size;

/** The mark, in a 32-unit box, scaled and placed. */
const MARK = 54;
const scale = MARK / 32;
const markX = PAD;
const markY = PAD;
const at = (u, origin) => Math.round(origin + u * scale);
const r = Math.round(5.4 * scale);
const stroke = Math.max(2, Math.round(2 * scale));

/** The panel on the right, which the counts sit inside. */
const PANEL_W = 380;
const panelLeft = W - PAD - PANEL_W;
const panelTop = 268;
const panelBottom = 488;

const target = path.join(root, 'public/share-card.png');

execFileSync('magick', [
  '-size', `${W}x${H}`, `xc:${GRAPE}`,

  // The mark: one filled circle, one outlined, overlapping.
  '-fill', CREAM, '-stroke', 'none',
  '-draw', `circle ${at(12.5, markX)},${at(16, markY)} ${at(12.5, markX)},${at(16, markY) - r}`,
  '-fill', 'none', '-stroke', CREAM, '-strokewidth', String(stroke),
  '-draw', `circle ${at(20.5, markX)},${at(16, markY)} ${at(20.5, markX)},${at(16, markY) - r}`,

  // Wordmark, beside the mark.
  '-stroke', 'none', '-fill', CREAM,
  '-font', 'Helvetica-Bold', '-pointsize', '30',
  '-annotate', `+${PAD + MARK + 20}+${markY + 40}`, 'Signer Guide',

  // The claim.
  '-font', 'Helvetica-Bold', '-pointsize', '78',
  '-annotate', `+${PAD}+${318}`, 'Lock STX.',
  '-fill', AMBER_ON_GRAPE,
  '-annotate', `+${PAD}+${404}`, 'Earn bitcoin.',

  // One line under it, at 72% white.
  '-fill', 'rgba(253,248,243,0.72)',
  '-font', 'Helvetica', '-pointsize', '27',
  '-annotate', `+${PAD}+${464}`, 'Your STX never leaves your wallet.',

  // The panel: a translucent fill with a hairline, as on the feature graphic.
  '-fill', 'rgba(255,255,255,0.08)',
  '-stroke', 'rgba(255,255,255,0.16)', '-strokewidth', '1',
  '-draw', `roundrectangle ${panelLeft},${panelTop} ${W - PAD},${panelBottom} 22,22`,

  // The two counts, which are what the guide reads off the chain.
  '-stroke', 'none', '-fill', CREAM,
  '-font', 'Helvetica-Bold', '-pointsize', '64',
  '-annotate', `+${panelLeft + 40}+${panelTop + 88}`, String(pools),
  '-fill', 'rgba(253,248,243,0.72)',
  '-font', 'Helvetica', '-pointsize', '22',
  '-annotate', `+${panelLeft + 40 + 20 + String(pools).length * 36}+${panelTop + 88}`,
  'pools on pox-5',

  '-fill', CREAM, '-font', 'Helvetica-Bold', '-pointsize', '64',
  '-annotate', `+${panelLeft + 40}+${panelTop + 178}`, String(contracts),
  '-fill', 'rgba(253,248,243,0.72)',
  '-font', 'Helvetica', '-pointsize', '22',
  '-annotate', `+${panelLeft + 40 + 20 + String(contracts).length * 36}+${panelTop + 178}`,
  'signer contracts',

  // The address, so a card seen without its link still says where it is from.
  '-fill', 'rgba(253,248,243,0.55)',
  '-font', 'Helvetica', '-pointsize', '21',
  '-annotate', `+${PAD}+${H - PAD + 8}`, 'signer-guide.fastpool.org',

  '-depth', '8', '-strip',
  target,
]);

console.log(
  `drew ${path.relative(process.cwd(), target)} — ${pools} pools, ${contracts} contracts`,
);
