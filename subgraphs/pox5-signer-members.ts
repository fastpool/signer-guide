/**
 * Every staker and amount for a signer in a cycle, as one table.
 *
 * A secondlayer subgraph (https://www.secondlayer.tools/p/subgraphs) that
 * keeps a copy of pox-5's `staker-signer-cycle-memberships` map: one row per
 * staker per cycle, saying which signer contract they were with and for how
 * much. That map is what `get-signer-cycle-membership` reads, one staker at a
 * time, and what `generate:history` spends up to 2,000 calls a run asking
 * about. Here it is one request per signer and cycle:
 *
 *   GET /v1/subgraphs/pox5-signer-members/memberships?signer=<contract>&cycle=147
 *
 * The rules for what each print does live in scripts/pox5-membership.ts,
 * shared with the replay that checked them against the chain. Replayed over
 * every pox-5 event, they matched every closed-cycle member list the chain had
 * confirmed. They also caught one the committed history had wrong.
 *
 * Deploy:
 *   secondlayer subgraphs test subgraphs/pox5-signer-members.ts --from 8665700 --to 8700000
 *   secondlayer subgraphs deploy subgraphs/pox5-signer-members.ts
 *
 * Cost: indexing reads pox-5's prints, about 20k rows so far plus a few
 * hundred a day, against a free tier of 1M a month. Reading the table is free.
 */

import { defineSubgraph } from '@secondlayer/subgraphs';
import {
  MEMBERSHIP_TOPICS,
  membershipChange,
} from '../scripts/pox5-membership';

const POX5 = 'SP000000000000000000002Q6VF78.pox-5';

/** The block before pox-5's first print (grant-signer-key at 8,665,732). */
const START_BLOCK = 8_665_700;

type Ctx = {
  delete: (table: string, where: Record<string, unknown>) => unknown;
  upsert: (
    table: string,
    key: Record<string, unknown>,
    row: Record<string, unknown>,
  ) => unknown;
};

/** One handler for every topic: the rules decide what each one writes. */
const handle =
  (topic: (typeof MEMBERSHIP_TOPICS)[number]) =>
  async (event: { data: Record<string, unknown> }, ctx: Ctx) => {
    const change = membershipChange({ topic, data: event.data });
    if (!change) return;

    if (change.drop) {
      for (let cycle = change.drop.from; cycle < change.drop.to; cycle += 1) {
        await ctx.delete('memberships', { staker: change.staker, cycle });
      }
    }
    for (const row of change.set) {
      await ctx.upsert(
        'memberships',
        { staker: change.staker, cycle: row.cycle },
        {
          staker: change.staker,
          cycle: row.cycle,
          signer: row.signer,
          ustx: row.ustx,
          kind: row.kind,
        },
      );
    }
  };

const sources = Object.fromEntries(
  MEMBERSHIP_TOPICS.map((topic) => [
    topic,
    { type: 'print_event', contractId: POX5, topic },
  ]),
);

const handlers = Object.fromEntries(
  MEMBERSHIP_TOPICS.map((topic) => [topic, handle(topic)]),
);

export default defineSubgraph({
  name: 'pox5-signer-members',
  startBlock: START_BLOCK,
  sources,
  schema: {
    memberships: {
      columns: {
        staker: { type: 'principal', indexed: true },
        cycle: { type: 'uint', indexed: true },
        signer: { type: 'principal', indexed: true },
        ustx: { type: 'uint' },
        // 'stake' for STX-only, 'bond' for a protocol bond. pox-5 counts both
        // in `get-amount-delegated-for-signer`.
        kind: { type: 'text' },
      },
      // pox-5's own key: a staker is with one signer per cycle.
      uniqueKeys: [['staker', 'cycle']],
    },
  },
  handlers,
});
