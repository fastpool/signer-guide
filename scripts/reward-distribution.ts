/**
 * How one pool's sBTC rewards were shared out, cycle by cycle, staker by staker.
 *
 * `report-unclaimed.ts` answers "how much is waiting, and for how many
 * people". This answers the question behind it: **did everybody get their
 * share?** For each member of a signer in a cycle it puts three numbers beside
 * each other —
 *
 *   staked      what pox-5 counted for them that cycle
 *   claimed     what they have taken, from the pool's own `claim-staker-rewards`
 *               prints, which are the only record there is
 *   still owed  `get-earned-staker-rewards`, which pox-5 zeroes as they take it
 *
 * — and adds the last two to get what the cycle earned them. Divided by their
 * stake, that is a rate per 1000 STX, and **every member of a cycle should have
 * the same one**. pox-5 pays per share, so a rate that differs by more than
 * rounding is either a fee taken somewhere or a bug, and either way it is the
 * thing worth finding. The report prints the spread and says which.
 *
 * Written for Stacking DAO's Native Pool — the ststxBTC product at
 * app.stackingdao.com — but it takes any pool the guide lists:
 *
 *   npx tsx scripts/reward-distribution.ts "native pool" 141 142
 *   npx tsx scripts/reward-distribution.ts native-pool --cycles 141 --json
 *
 *   --cycles A,B     the cycles to look at; also positional, in any order
 *   --top N          how many members to name (JSON is never truncated)
 *   --json           the whole answer as JSON
 *
 * ## Cycles before pox-5
 *
 * pox-5's first reward cycle is on chain as `get-first-pox-5-reward-cycle`,
 * and it answers 141. **Cycle 140 has no pox-5 rewards for anybody**: nothing
 * was staked with pox-5 until 141, `rewards-per-token-for-cycle` answers 0 for
 * it, and no `calculate-rewards` ever ran against it. A pool's stakers may well
 * have earned in 140 through whatever they were stacking with before, but that
 * is not in this contract and this script will not invent it. Ask for 140 and
 * it says so, once, and reads nothing.
 *
 * ## What it costs
 *
 * One call per member per cycle, and Native Pool has 165 members — so a two
 * cycle run is a few hundred reads and a couple of minutes anonymously. The
 * rosters come from `src/data/signers/` when the refresh has built them, which
 * is free; only the per-member reward reads have to be made.
 *
 * Reads STACKS_API_URL and HIRO_API_KEY — see scripts/node.ts.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cl, cvToHex } from '@stacks/transactions';
import { signerSlug, type SignerNode } from '../src/lib/signer-nodes.js';
import type {
  Signer,
  SignerCycleMembers,
  SignerData,
} from '../src/lib/types.js';
import { formatStx } from './format.js';
import { walkSignerMembers } from './members.js';
import { describeNode, sleep, SPACING_MS } from './node.js';
import { callReadOnly, fetchCurrentCycle, uintValue } from './pox5.js';
import { matchGroups, groupName } from './signer-members.js';
import { parseClaimEvent } from './unclaimed-rewards.js';
import { contractPrints } from './read-only.js';

const DATA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
);
const SIGNERS = path.join(DATA, 'signers.json');
const HISTORY = path.join(DATA, 'signers');

const USTX_PER_1000_STX = 1_000_000_000n;

export interface Options {
  query: string;
  cycles: number[];
  top: number;
  json: boolean;
}

export function parseArgs(argv: string[]): Options {
  const rest: string[] = [];
  const cycles: number[] = [];
  let top = 15;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--top') top = Number(argv[(i += 1)]);
    else if (arg === '--cycles') {
      for (const value of (argv[(i += 1)] ?? '').split(',')) {
        const cycle = Number(value.trim());
        if (Number.isFinite(cycle)) cycles.push(cycle);
      }
    } else if (/^\d+$/.test(arg)) cycles.push(Number(arg));
    else rest.push(arg);
  }

  return {
    query: rest.join(' ').trim(),
    cycles: [...new Set(cycles)].sort((a, b) => a - b),
    top: Number.isFinite(top) && top > 0 ? top : 15,
    json,
  };
}

/** One member's cycle: what they had in, and what came of it. */
export interface MemberReward {
  staker: string;
  ustx: bigint;
  claimedSats: bigint;
  /** Null when pox-5 would not answer — never zero, which is a fact. */
  owedSats: bigint | null;
  /** Claimed plus owed, or null while any part of it is unread. */
  earnedSats: bigint | null;
  /** Their rate, in sats per 1000 STX; null when unread or nothing staked. */
  rateSatsPer1000Stx: bigint | null;
}

/** Sats per 1000 STX, rounded down, or null when there is no stake to divide by. */
export function rateFor(sats: bigint, ustx: bigint): bigint | null {
  if (ustx <= 0n) return null;
  return (sats * USTX_PER_1000_STX) / ustx;
}

export interface CycleSummary {
  cycle: number;
  members: MemberReward[];
  stakedUstx: bigint;
  claimedSats: bigint;
  /** Null when any member went unread: a short total is worse than none. */
  owedSats: bigint | null;
  earnedSats: bigint | null;
  /** How many members have taken anything at all. */
  claimedCount: number;
  /** Members pox-5 would not answer for, which is why a total can be null. */
  unreadCount: number;
  /** The rate the cycle paid overall: everything earned over everything staked. */
  poolRateSatsPer1000Stx: bigint | null;
  /** The lowest and highest member rate, for the spread. */
  lowestRate: bigint | null;
  highestRate: bigint | null;
}

/**
 * Add a cycle's members up, and work out whether they were treated alike.
 *
 * The spread is the point. Every member of a cycle is paid out of one
 * rewards-per-token figure, so once everything is read their rates differ only
 * by the sat each division rounds away. A wider spread is a fee taken from
 * some and not others, a member who was not in the cycle for all of it — or a
 * claim this report could not match to its cycle.
 *
 * One unread member and the totals are null. A cycle report that quietly
 * counted a rate limit as somebody earning nothing would understate what the
 * pool owes and name the wrong people as unpaid, which is the whole subject.
 */
export function summariseCycle(
  cycle: number,
  members: MemberReward[],
): CycleSummary {
  const stakedUstx = members.reduce((sum, m) => sum + m.ustx, 0n);
  const claimedSats = members.reduce((sum, m) => sum + m.claimedSats, 0n);
  const unread = members.filter((m) => m.owedSats === null);
  const owedSats = unread.length
    ? null
    : members.reduce((sum, m) => sum + (m.owedSats ?? 0n), 0n);
  const earnedSats = owedSats === null ? null : claimedSats + owedSats;
  const rates = members
    .map((m) => m.rateSatsPer1000Stx)
    .filter((rate): rate is bigint => rate !== null);

  return {
    cycle,
    members,
    stakedUstx,
    claimedSats,
    owedSats,
    earnedSats,
    claimedCount: members.filter((m) => m.claimedSats > 0n).length,
    unreadCount: unread.length,
    poolRateSatsPer1000Stx:
      earnedSats === null ? null : rateFor(earnedSats, stakedUstx),
    lowestRate: rates.length ? rates.reduce((a, b) => (b < a ? b : a)) : null,
    highestRate: rates.length ? rates.reduce((a, b) => (b > a ? b : a)) : null,
  };
}

// ---------------------------------------------------------------------------
// The parts that ask
// ---------------------------------------------------------------------------

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** The first cycle pox-5 could have rewards for. Null when it would not say. */
async function firstPox5Cycle(): Promise<number | null> {
  const answer = await callReadOnly('get-first-pox-5-reward-cycle', []);
  return answer === null ? null : Number(uintValue(answer));
}

/** A cycle's roster: from the committed file if there is one, else the chain. */
async function rosterFor(
  node: SignerNode,
  cycle: number,
): Promise<Map<string, bigint> | null> {
  const file = readJson<SignerCycleMembers>(
    path.join(HISTORY, signerSlug(node), `${cycle}.json`),
  );
  if (file?.members) {
    return new Map(file.members.map((m) => [m.staker, BigInt(m.ustx)]));
  }

  const walked = await walkSignerMembers(
    node.contracts.map((c) => c.contractId),
    cycle,
  );
  if (!walked?.members) return null;
  // Only the ones with a position in this cycle: the index also turns up
  // people who have moved on, and they staked nothing here to be paid for.
  return new Map(
    walked.members.flatMap((member) =>
      member.position.kind === 'member'
        ? [[member.staker, member.position.ustx] as [string, bigint]]
        : [],
    ),
  );
}

/** What pox-5 still owes one staker for one cycle. Null when it would not say. */
async function owedToStaker(
  signer: string,
  staker: string,
  cycle: number,
): Promise<bigint | null> {
  const answer = await callReadOnly(
    'get-earned-staker-rewards',
    [Cl.address(signer), Cl.uint(cycle), Cl.none(), Cl.address(staker)].map(
      (arg) => cvToHex(arg),
    ),
  );
  return answer === null ? null : uintValue(answer);
}

/** Every claim print of every contract in the signer, by staker and cycle. */
async function claimsByCycle(
  node: SignerNode,
): Promise<Map<string, Map<number, bigint>>> {
  const byStaker = new Map<string, Map<number, bigint>>();

  for (const contract of node.contracts) {
    const prints = await contractPrints(contract.contractId, SPACING_MS);
    if (prints === null) continue;
    for (const repr of prints) {
      const claim = parseClaimEvent(repr);
      if (!claim) continue;
      const cycles = byStaker.get(claim.staker) ?? new Map<number, bigint>();
      cycles.set(
        claim.cycle,
        (cycles.get(claim.cycle) ?? 0n) + claim.earnedSats,
      );
      byStaker.set(claim.staker, cycles);
    }
  }

  return byStaker;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const signers = (readJson<SignerData>(SIGNERS)?.signers ?? []) as Signer[];
  if (!options.query) {
    console.error(
      'Name a pool: npx tsx scripts/reward-distribution.ts "native pool" 141 142',
    );
    process.exitCode = 1;
    return;
  }

  const nodes = matchGroups(options.query, signers);
  if (nodes.length !== 1) {
    console.error(
      nodes.length === 0
        ? `No pool matches "${options.query}".`
        : `"${options.query}" names ${nodes.length} signers: ${nodes
            .map((g) => groupName(g))
            .join(', ')}. Be more specific.`,
    );
    process.exitCode = 1;
    return;
  }
  const node = nodes[0];

  const current = await fetchCurrentCycle();
  const first = await firstPox5Cycle();
  const asked = options.cycles.length
    ? options.cycles
    : current !== null
      ? [current - 1, current]
      : [];

  // Cycles pox-5 never had are said once and then left alone, rather than read
  // as a page of zeros that looks like a pool that paid nobody.
  const before = first === null ? [] : asked.filter((c) => c < first);
  const cycles = first === null ? asked : asked.filter((c) => c >= first);

  console.log(
    `${groupName(node)} — reward distribution, from ${describeNode()}\n`,
  );
  if (first === null) {
    // Without it, a cycle from before pox-5 cannot be told from one nobody
    // has staked in, and both would print as a pool that paid nobody.
    console.log(
      'pox-5 would not say which cycle was its first, so a cycle with nothing' +
        ' in it below may be one that predates pox-5 rather than one nobody' +
        ' used. Re-run to be sure.',
    );
  } else {
    console.log(`pox-5's first reward cycle is ${first}.`);
  }
  for (const cycle of before) {
    console.log(
      `  Cycle ${cycle} is before it: pox-5 has no rewards for anybody in that` +
        ' cycle, so there is nothing here to share out. Whatever these stakers' +
        ' earned then was earned somewhere else.',
    );
  }
  if (!cycles.length) {
    console.log('\nNo cycle left to look at.');
    return;
  }

  const claims = await claimsByCycle(node);
  const summaries: CycleSummary[] = [];

  for (const cycle of cycles) {
    const roster = await rosterFor(node, cycle);
    if (!roster) {
      console.log(`\nCycle ${cycle}: the roster could not be read.`);
      continue;
    }
    if (roster.size === 0) {
      // Nobody on file is not the same as nobody paid, and a summary of no
      // members would print as a pool that earned zero.
      console.log(
        `\nCycle ${cycle}: no members on file — nobody staked with this signer` +
          ' that cycle, or no roster has been built for it.',
      );
      continue;
    }

    console.log(`\nCycle ${cycle}: asking about ${roster.size} member(s) …`);
    const stakers = [...roster.keys()];
    const members: MemberReward[] = [];

    for (const staker of stakers) {
      // One at a time, spaced. Asking these together earns a 429 for most of
      // them — anonymously the limit is about fifty a minute — and a refusal
      // that landed as a zero would name a paid staker as unpaid.
      let owedSats: bigint | null = null;
      for (const contract of node.contracts) {
        const answer = await owedToStaker(contract.contractId, staker, cycle);
        // Null is "the node would not say", and one of those makes this
        // member's figure unknown rather than smaller.
        if (answer === null) {
          owedSats = null;
          break;
        }
        owedSats = (owedSats ?? 0n) + answer;
        await sleep(SPACING_MS);
      }

      const ustx = roster.get(staker) ?? 0n;
      const claimedSats = claims.get(staker)?.get(cycle) ?? 0n;
      const earnedSats = owedSats === null ? null : claimedSats + owedSats;
      members.push({
        staker,
        ustx,
        claimedSats,
        owedSats,
        earnedSats,
        rateSatsPer1000Stx:
          earnedSats === null ? null : rateFor(earnedSats, ustx),
      });
    }

    summaries.push(summariseCycle(cycle, members));
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          signer: groupName(node),
          contracts: node.contracts.map((c) => c.contractId),
          firstPox5Cycle: first,
          cyclesBeforePox5: before,
          cycles: summaries.map((summary) => ({
            ...summary,
            stakedUstx: summary.stakedUstx.toString(),
            claimedSats: summary.claimedSats.toString(),
            owedSats: summary.owedSats?.toString() ?? null,
            earnedSats: summary.earnedSats?.toString() ?? null,
            poolRateSatsPer1000Stx:
              summary.poolRateSatsPer1000Stx?.toString() ?? null,
            lowestRate: summary.lowestRate?.toString() ?? null,
            highestRate: summary.highestRate?.toString() ?? null,
            members: summary.members.map((member) => ({
              ...member,
              ustx: member.ustx.toString(),
              claimedSats: member.claimedSats.toString(),
              owedSats: member.owedSats?.toString() ?? null,
              earnedSats: member.earnedSats?.toString() ?? null,
              rateSatsPer1000Stx: member.rateSatsPer1000Stx?.toString() ?? null,
            })),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const summary of summaries) {
    printCycle(summary, options.top);
  }
}

function printCycle(summary: CycleSummary, top: number) {
  const sats = (value: bigint | null) =>
    value === null ? 'not known' : `${value.toLocaleString('en-US')} sats`;

  console.log(`\n─── Cycle ${summary.cycle} ───`);
  console.log(
    `  ${summary.members.length} member(s), ${formatStx(summary.stakedUstx)} staked`,
  );
  console.log(
    `  earned ${sats(summary.earnedSats)} — ${sats(summary.claimedSats)} taken by ` +
      `${summary.claimedCount} of them, ${sats(summary.owedSats)} still waiting`,
  );
  if (summary.unreadCount > 0) {
    // Named as a gap, not folded into the totals above, which are null for
    // exactly this reason.
    console.log(
      `  ${summary.unreadCount} member(s) went unread, so the totals above are` +
        ' incomplete rather than low. Re-run — anonymous requests get' +
        ' rate-limited.',
    );
  }
  if (summary.poolRateSatsPer1000Stx !== null) {
    console.log(
      `  ${summary.poolRateSatsPer1000Stx} sats per 1000 STX across the pool`,
    );
  }
  if (summary.lowestRate !== null && summary.highestRate !== null) {
    const spread = summary.highestRate - summary.lowestRate;
    console.log(
      `  member rates run ${summary.lowestRate} to ${summary.highestRate} ` +
        `(${spread} apart)` +
        (spread <= 1n
          ? ' — one sat is what the division rounds away, so everybody was paid alike.'
          : ' — worth explaining. pox-5 pays per share, so a real spread is a fee' +
            ' taken from some and not others, a member who was not in the whole' +
            ' cycle, or a claim this report could not match to its cycle.'),
    );
  }

  const named = [...summary.members]
    .sort((a, b) => ((b.earnedSats ?? 0n) > (a.earnedSats ?? 0n) ? 1 : -1))
    .slice(0, top);
  for (const member of named) {
    console.log(
      `    ${sats(member.earnedSats).padStart(16)}  ` +
        `${member.rateSatsPer1000Stx ?? '—'} per 1000 STX  ` +
        `${formatStx(member.ustx).padStart(18)}  ${member.staker}` +
        (member.owedSats !== null && member.owedSats > 0n
          ? `  (${sats(member.owedSats)} unclaimed)`
          : ''),
    );
  }
  if (summary.members.length > named.length) {
    console.log(
      `    … ${summary.members.length - named.length} more, --json for all`,
    );
  }
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
