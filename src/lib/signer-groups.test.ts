/**
 * Who is behind which nodes, and what that adds up to.
 *
 * The most consequential claim the guide makes: that these three keys are one
 * company, so what looked like three signers at six percent is one at
 * nineteen. It rests on a hand-written file, so what can be checked has to be
 * — that every member names something real, that the arithmetic over a group
 * is the arithmetic over its parts, and that a contract in two groups is
 * counted once in each rather than twice in one.
 */

import { describe, expect, it } from 'vitest';
import realSigners from '../data/signers.json';
import realTotals from '../data/totals.json';
import {
  allGroups,
  groupById,
  groupContracts,
  groupNodes,
  groupUstx,
  groupVotingPowerBips,
  groupsForContract,
  groupsForNode,
  type SignerGroup,
} from './signer-groups';
import { nodeForContract, nodesBySignerKey } from './signer-nodes';
import type { LockedTotals, Signer, SignerData } from './types';

const signers = (realSigners as SignerData).signers;
const totals = realTotals as LockedTotals;

const KEY_A = '0x02aaaa';
const signer = (contractId: string, signerKey?: string): Signer =>
  ({ contractId, displayName: contractId, signerKey: signerKey ?? null }) as Signer;

const group = (members: SignerGroup['members']): SignerGroup => ({
  id: 'test',
  name: 'Test',
  kind: 'operator',
  summary: 'A group',
  source: 'A test',
  members,
});

describe('what a group covers', () => {
  const fleet = [
    signer('SP1.one', KEY_A),
    signer('SP1.two', KEY_A),
    signer('SP2.other', '0x02bbbb'),
  ];

  it('takes every contract on a key when the key is the member', () => {
    // An operator runs the key, so everything registered against it is its
    // own — including a contract somebody else's money is in.
    const covered = groupContracts(group([{ signerKey: KEY_A }]), fleet);
    expect(covered.map((s) => s.contractId)).toEqual(['SP1.one', 'SP1.two']);
  });

  it('takes one contract when the contract is the member', () => {
    // The stake case: the STX in this contract is the entity's, and the
    // node's other contracts are somebody else's business.
    const covered = groupContracts(group([{ contractId: 'SP1.one' }]), fleet);
    expect(covered.map((s) => s.contractId)).toEqual(['SP1.one']);
  });

  it('counts a contract once when the key and the contract are both named', () => {
    // By hand this will happen, and a double count inflates the one number on
    // the page that anybody acts on.
    const covered = groupContracts(
      group([{ signerKey: KEY_A }, { contractId: 'SP1.one' }]),
      fleet,
    );
    expect(covered.map((s) => s.contractId)).toEqual(['SP1.one', 'SP1.two']);
  });

  it('skips a member the guide has never seen', () => {
    // A group is only ever as big as the contracts on file. Inventing one
    // would invent weight along with it.
    const covered = groupContracts(
      group([{ contractId: 'SP9.ghost' }, { contractId: 'SP1.one' }]),
      fleet,
    );
    expect(covered.map((s) => s.contractId)).toEqual(['SP1.one']);
  });

  it('groups what it covers back into nodes', () => {
    const nodes = groupNodes(group([{ signerKey: KEY_A }]), fleet);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].contracts).toHaveLength(2);
  });
});

describe('what a group weighs', () => {
  const fleet = [signer('SP1.one', KEY_A), signer('SP2.other', '0x02bbbb')];

  it('is its share of the whole cycle, not of itself', () => {
    const ustx = { 'SP1.one': '250', 'SP2.other': '750' };
    expect(groupUstx(group([{ signerKey: KEY_A }]), fleet, ustx)).toBe(250n);
    expect(groupVotingPowerBips(group([{ signerKey: KEY_A }]), fleet, ustx)).toBe(
      2_500,
    );
  });

  it('is unknown, not zero, when nothing in it could be read', () => {
    // Zero here would say an entity has no say in the signer set, about one
    // that may hold a fifth of it.
    const ustx = { 'SP1.one': null, 'SP2.other': '750' };
    expect(groupUstx(group([{ signerKey: KEY_A }]), fleet, ustx)).toBeNull();
    expect(
      groupVotingPowerBips(group([{ signerKey: KEY_A }]), fleet, ustx),
    ).toBeNull();
  });

  it('says nothing rather than dividing by an empty cycle', () => {
    expect(
      groupVotingPowerBips(group([{ signerKey: KEY_A }]), fleet, {
        'SP1.one': '0',
      }),
    ).toBeNull();
  });
});

describe('the committed groups', () => {
  it('name only contracts and keys the guide has on file', () => {
    // A member naming nothing is a group quietly smaller than it claims.
    const contracts = new Set(signers.map((s) => s.contractId));
    const keys = new Set(signers.map((s) => s.signerKey));
    for (const entry of allGroups()) {
      for (const member of entry.members) {
        if (member.contractId) {
          expect(contracts.has(member.contractId), member.contractId).toBe(true);
        }
        if (member.signerKey) {
          expect(keys.has(member.signerKey), member.signerKey).toBe(true);
        }
      }
    }
  });

  it('say what each of them is based on', () => {
    // The file is written by hand and claims who controls what. Every entry
    // has to carry its evidence or it is just an assertion on a page.
    for (const entry of allGroups()) {
      expect(entry.source.length, entry.id).toBeGreaterThan(20);
      expect(entry.id, entry.name).toMatch(/^[a-z0-9-]+$/);
      expect(['operator', 'stake']).toContain(entry.kind);
    }
  });

  it('add up to more than any of their nodes on their own', () => {
    // The point of the file. Xverse's three keys are three ordinary signers
    // until they are one company.
    const xverse = groupById('xverse');
    expect(xverse).not.toBeNull();

    const nodes = groupNodes(xverse!, signers);
    expect(nodes.length).toBeGreaterThan(1);

    const whole = groupVotingPowerBips(xverse!, signers, totals.ustx);
    const largest = Math.max(
      ...nodes.map(
        (node) =>
          groupVotingPowerBips(
            group(node.contracts.map((c) => ({ contractId: c.contractId }))),
            signers,
            totals.ustx,
          ) ?? 0,
      ),
    );
    expect(whole).not.toBeNull();
    expect(whole!).toBeGreaterThan(largest);
  });

  it('put the shared Xverse key in both the groups it belongs to', () => {
    // The case the whole shape exists for: one key signs for Xverse's own
    // pools and for an invite-only contract Stacking DAO delegates into. The
    // node is Xverse's; that one contract's stake is Stacking DAO's.
    const shared =
      'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.signer-manager-xverse-v1';
    const node = nodeForContract(signers, shared);
    expect(node).not.toBeNull();

    expect(groupsForContract(shared, node!.signerKey).map((g) => g.id)).toEqual([
      'xverse',
      'stacking-dao',
    ]);
    expect(groupsForNode(node!).map((g) => g.id)).toEqual([
      'xverse',
      'stacking-dao',
    ]);

    // And the node's other contract is Xverse's alone.
    const own = node!.contracts.find((c) => c.contractId !== shared);
    expect(own).toBeDefined();
    expect(groupsForContract(own!.contractId, node!.signerKey).map((g) => g.id))
      .toEqual(['xverse']);
  });

  it('never claim more of a cycle than there is', () => {
    // Groups overlap on purpose — an operator signs with a contract whose
    // stake somebody else supplied — so they may sum past 100% between them.
    // No single one may.
    for (const entry of allGroups()) {
      const bips = groupVotingPowerBips(entry, signers, totals.ustx);
      if (bips === null) continue;
      expect(bips, entry.id).toBeGreaterThan(0);
      expect(bips, entry.id).toBeLessThanOrEqual(10_000);
    }
  });

  it('leaves most of the network ungrouped, and says so by omission', () => {
    // Nobody has written down who runs the rest, and the guide does not guess.
    const grouped = new Set(
      allGroups().flatMap((entry) =>
        groupContracts(entry, signers).map((s) => s.contractId),
      ),
    );
    const nodes = nodesBySignerKey(signers);
    const ungrouped = nodes.filter((node) =>
      node.contracts.every((c) => !grouped.has(c.contractId)),
    );
    expect(ungrouped.length).toBeGreaterThan(0);
  });
});
