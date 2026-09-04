/**
 * The section that says whether the node behind a pool turns up.
 *
 * It is the first thing on this site that judges a signer rather than
 * describing it, so what is tested is the wording as much as the arithmetic:
 * that a signer which was never there is not called slow, that a rotation is
 * explained rather than shown as a hole, and that an unfinished cycle says it
 * is unfinished.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignerConductSection from './SignerConductSection';
import signers from '../data/signers.json';
import { lastRotation, ROTATIONS } from '../lib/key-rotations';
import { answeredRate, neverAnswered } from '../lib/performance';
import { performanceFor, PERFORMANCE } from '../lib/performance-data';
import type { Signer, SignerData } from '../lib/types';

const all = (signers as SignerData).signers;
const find = (id: string) => all.find((s) => s.contractId === id)!;

/*
 * The row the section will actually show for a pool: its own key's, or —
 * once it has rotated and the new key holds nothing yet — the row of the key
 * that kept the seat. The same fallback the component makes, so that tests
 * can pick a signer by what a reader would see rather than by name.
 */
const shownRow = (signer: Signer) => {
  const own = performanceFor(signer.signerKey);
  if (own !== null) return own;
  const rotation = lastRotation(signer.contractId);
  return rotation === null ? null : performanceFor(rotation.from);
};

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const render = (signer: Signer) =>
  renderToStaticMarkup(<SignerConductSection signer={signer} locale='en' />);

describe('a signer that answers', () => {
  const busiest = Object.entries(PERFORMANCE.signers).sort(
    ([, a], [, b]) => b.weightPercent - a.weightPercent,
  )[0];
  const signer = all.find((s) => (s.signerKey ?? '').endsWith(busiest[0]))!;

  it('leads with the share it answered, not the share it accepted', () => {
    const html = render(signer);
    const rate = answeredRate(performanceFor(signer.signerKey)!)!;
    expect(html).toContain(`${(rate * 100).toFixed(2)}%`);
    expect(html).toContain('How it answers the miners');
  });

  it('says the cycle is still running', () => {
    // Counts are cumulative, so an open cycle is a cycle so far. A hundred
    // missed blocks two hours in is not a hundred missed in a fortnight.
    expect(render(signer)).toContain('still running');
  });

  it('gives the middle of the set, so one number has a scale', () => {
    expect(render(signer)).toContain('The middle of the signer set is');
  });
});

describe('a pool whose key was rotated', () => {
  const rotation = ROTATIONS[ROTATIONS.length - 1];
  const signer = find(rotation.contractId);

  it('explains the rotation rather than showing a hole', () => {
    const html = render(signer);
    expect(html).toContain('changed its signer key on');
    expect(html).toContain(rotation.observedAt.slice(0, 10));
  });

  it('falls back to the key that actually held the seat', () => {
    // The new key holds nothing until the next set is computed. Saying
    // "nothing on file" would hide the fortnight a reader most needs.
    const html = render(signer);
    expect(html).toContain('the key that was rotated away from');
  });

});

describe('a signer that never answered', () => {
  /*
   * Seated when the cycle was locked in, asked about every block, never heard
   * from. The API reports its mean response as 0 ms, which would read as the
   * quickest node on the network.
   *
   * Found by the absence rather than by name: a rotation makes one of these
   * for a fortnight, but not every rotation does — a pool that rotated half
   * way through a cycle leaves behind a key that answered most of it — and an
   * operator who registered and never started the node makes one without ever
   * rotating anything.
   */
  const silent = all.find((s) => {
    const row = shownRow(s);
    return row !== null && neverAnswered(row);
  });

  it('is in the data at all', () => {
    expect(silent).toBeDefined();
  });

  it('is called absent, not fast', () => {
    const html = render(silent!);
    expect(html).toContain('Never answered');
    expect(html).not.toContain('0.0 s');
  });
});

describe('a key with no record', () => {
  it('says so plainly', () => {
    // Nothing on file means nothing to fall back on either: a rotated pool
    // has no row for its own key and is still not this case.
    const unseated = all.find(
      (s) => s.signerKey !== null && shownRow(s) === null,
    )!;
    expect(unseated).toBeDefined();
    expect(render(unseated)).toContain('Nothing on file for this key');
  });
});
