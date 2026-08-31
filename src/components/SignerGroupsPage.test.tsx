/**
 * The index of who is behind the signer set.
 *
 * Its job is an order, not a list: the reader who lands here wants to know who
 * would have to agree before the signer set could move, and that is the top of
 * the page. So what is tested is that the order is by weight, that a group
 * with no name still shows up with its share, and that the page says out loud
 * how much of the cycle nobody here has grouped at all.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignerGroupsPage from './SignerGroupsPage';
import signers from '../data/signers.json';
import totals from '../data/totals.json';
import {
  allGroups,
  groupVotingPowerBips,
  ungroupedContracts,
  ungroupedVotingPowerBips,
} from '../lib/signer-groups';
import type { LockedTotals, SignerData } from '../lib/types';

const all = (signers as SignerData).signers;
const locked = totals as LockedTotals;

beforeEach(() => {
  vi.stubGlobal('navigator', { language: 'en-GB' });
});

const html = () =>
  renderToStaticMarkup(
    <SignerGroupsPage
      signers={all}
      totals={locked}
      locale='en'
      onLocaleChange={() => {}}
    />,
  );

describe('the group index', () => {
  it('names every group and links to it', () => {
    const page = html();
    for (const group of allGroups()) {
      expect(page, group.id).toContain(group.name);
      expect(page, group.id).toContain(`#/group/${group.id}`);
    }
  });

  it('puts the largest share of the vote first', () => {
    // The order is the argument. A file order would bury whoever matters.
    const page = html();
    const ranked = allGroups()
      .map((group) => ({
        name: group.name,
        bips: groupVotingPowerBips(group, all, locked.ustx) ?? -1,
      }))
      .sort((a, b) => b.bips - a.bips)
      .map((row) => page.indexOf(row.name));

    expect(ranked).toEqual([...ranked].sort((a, b) => a - b));
  });

  it('carries what no group here claims as a row of its own', () => {
    // Without it the page reads as a map of the whole signer set, and it is a
    // map of the part somebody has written down. As a row rather than a
    // footnote because it is the size of a large group.
    const page = html();
    const bips = ungroupedVotingPowerBips(all, locked.ustx)!;
    expect(page).toContain('Not grouped');
    expect(page).toContain(`${(bips / 100).toFixed(2)}%`);
    expect(page).toContain(`${ungroupedContracts(all).length} contracts`);
    expect(page).toContain('nobody here has grouped');
  });

  it('keeps that row below every group', () => {
    // It is not an entity, and a reader scanning for who holds the vote should
    // not meet it in the middle of the list — where its share would put it.
    const page = html();
    const last = Math.max(...allGroups().map((g) => page.indexOf(g.name)));
    expect(page.indexOf('Not grouped')).toBeGreaterThan(last);
  });

  it('names the cycle its percentages are of', () => {
    expect(html()).toContain(`cycle ${locked.cycle}`);
  });
});
