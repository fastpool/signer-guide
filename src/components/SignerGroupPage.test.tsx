/**
 * The page that says who is behind a set of signer nodes.
 *
 * It is the one page here whose headline number cannot be checked against the
 * chain — nothing on chain says who runs a key — so what it has to do instead
 * is show its work: the nodes it added together, the evidence for the claim,
 * and, where a contract is counted under two names, that it is.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignerGroupPage from './SignerGroupPage';
import signers from '../data/signers.json';
import totals from '../data/totals.json';
import { groupById } from '../lib/signer-groups';
import type { LockedTotals, SignerData } from '../lib/types';

const all = (signers as SignerData).signers;

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const render = (id: string) =>
  renderToStaticMarkup(
    <SignerGroupPage
      group={groupById(id)!}
      signers={all}
      totals={totals as LockedTotals}
      locale='en'
      onLocaleChange={() => {}}
    />,
  );

describe('an operator group', () => {
  it('adds its nodes up and names every one of them', () => {
    const html = render('xverse');
    expect(html).toContain('Xverse');
    expect(html).toContain('Runs these nodes');
    // Every node it claims is listed, so the total can be checked by hand.
    expect(html).toContain('Xverse 1');
    expect(html).toContain('Xverse 2');
    expect(html).toContain('Xverse 3');
    expect(html).toContain('of cycle 142');
  });

  it('shows what the claim rests on', () => {
    // A group is a hand-written assertion about who controls what. Publishing
    // it without its evidence is asking to be believed.
    const html = render('xverse');
    expect(html).toContain('What this is based on');
    expect(html).toContain('SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE');
  });
});

describe('a stake group', () => {
  it('says the nodes are not its own', () => {
    const html = render('stacking-dao');
    expect(html).toContain('Supplies the stake');
    expect(html).toContain('does not hold the keys that sign with it');
  });

  it('marks the contract it shares with another group', () => {
    // The Xverse 2 key signs for Xverse's own pools and for an invite-only
    // contract Stacking DAO delegates into. Both groups count that contract,
    // and a reader adding the two percentages up has to be told why.
    const html = render('stacking-dao');
    expect(html).toContain('Also counted in Xverse');
    expect(html).toContain('This contract only');
  });
});
