/**
 * A pool's own member list for a cycle, as a third way to settle who was with
 * a signer — after the event copy, before a walk.
 *
 * Fast Pool freezes its members per cycle in a repository of its own,
 * `fastpool-data` (`members/members-<cycle>.json`), and pays out from that
 * list. It is taken here on the same terms as the event copy and no others:
 * **every contract of the signer has to add up to exactly what the chain holds
 * for it**. A file that does not is not used, and a signer the file does not
 * know simply fails that test, so nothing has to say which signers are "the
 * pool's" — the amounts do.
 *
 * The file lists the depositors inside a bond staker contract one by one,
 * which is what the pool's readers want. pox-5 knows only the contract, and so
 * does the guide, so they are summed back into it under its bond index.
 *
 * Where the repository is: `FASTPOOL_DATA_DIR`, or `../fastpool-data` beside
 * this one. Absent, this answers null and the generator carries on as before.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CycleMember } from '../src/lib/types.js';

export interface PoolMemberRow {
  stacker: string;
  amount: number | string;
  signer: string;
  bond?: { staker: string; bondIndex: number | string };
}

export interface PoolMembersFile {
  cycle: number;
  members: PoolMemberRow[];
}

const DEFAULT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fastpool-data',
);

/** The pool's file for a cycle, or null when there is none to read. */
export function readPoolMembersFile(
  cycle: number,
  dir: string = process.env.FASTPOOL_DATA_DIR ?? DEFAULT_DIR,
): PoolMembersFile | null {
  const file = path.join(dir, 'members', `members-${cycle}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as PoolMembersFile;
    return parsed.cycle === cycle && Array.isArray(parsed.members)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * The signer's members out of the pool's file, or null unless each of its
 * contracts adds up to the chain's amount for it.
 */
export function membersFromPool(
  file: PoolMembersFile | null,
  contractIds: readonly string[],
  ustx: Record<string, string | null>,
): CycleMember[] | null {
  if (!file) return null;
  const members: CycleMember[] = [];
  for (const contractId of contractIds) {
    const onChain = ustx[contractId];
    if (typeof onChain !== 'string') return null;
    const byLeg = new Map<string, CycleMember & { sum: bigint }>();
    let sum = 0n;
    for (const row of file.members) {
      if (row.signer !== contractId) continue;
      const amount = BigInt(row.amount);
      sum += amount;
      const staker = row.bond ? row.bond.staker : row.stacker;
      const key = row.bond ? `${staker}#${row.bond.bondIndex}` : staker;
      const seen = byLeg.get(key);
      if (seen) seen.sum += amount;
      else {
        byLeg.set(key, {
          staker,
          ustx: '0',
          contractId,
          ...(row.bond ? { bondIndex: Number(row.bond.bondIndex) } : {}),
          sum: amount,
        });
      }
    }
    if (sum !== BigInt(onChain)) return null;
    for (const { sum: total, ...member } of byLeg.values()) {
      members.push({ ...member, ustx: total.toString() });
    }
  }
  if (members.length === 0) return null;
  // The walk's order: largest first, then by address.
  members.sort((a, b) => {
    const left = BigInt(a.ustx);
    const right = BigInt(b.ustx);
    if (left === right) return a.staker.localeCompare(b.staker);
    return right > left ? 1 : -1;
  });
  return members;
}
