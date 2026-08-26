import { describe, expect, it } from 'vitest';
import {
  buildRecoveryPlan,
  summarise,
  type FailedDistribution,
} from './failed-distributions';

/*
 * The plan is applied to mainnet by hand, so the thing worth pinning is the
 * file itself: the right contract, the right request id, the right sender.
 * A wrong id here is a call that fails; a wrong contract is a call that fails
 * against somebody else's money. Both are cheap to test and expensive to find
 * out about from `clarinet deployments apply`.
 */

const FASTPOOL =
  'SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager';
const STAKER = 'SP1CVX61FP54EJV8TF9V65GH7EFSEPGFW95QZBGZ1';
const OTHER_STAKER = 'SP2VZP5KQ6TQF0ZKDQF3WTRWA8DYXXXA8M5B57R2D';

/** Request 2620 as the registry actually holds it. */
const REJECTED_2620: FailedDistribution = {
  requestId: 2620,
  pool: FASTPOOL,
  staker: STAKER,
  amountSats: 173_911n,
  maxFeeSats: 1n,
  recoverableSats: 173_912n,
};

const SECOND: FailedDistribution = {
  requestId: 2634,
  pool: 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR.signer-manager',
  staker: OTHER_STAKER,
  amountSats: 1_000n,
  maxFeeSats: 379n,
  recoverableSats: 1_379n,
};

describe('buildRecoveryPlan', () => {
  it('writes one reclaim per rejection, against the pool holding it', () => {
    const plan = buildRecoveryPlan([REJECTED_2620]);
    expect(plan).toContain(`contract-id: ${FASTPOOL}`);
    expect(plan).toContain('method: reclaim-failed-withdrawal');
    expect(plan).toContain('- u2620');
    // The whole point of the argument: `reclaim-failed-withdrawal` takes the
    // request id and nothing else, and refuses one that is not rejected.
    expect(plan.match(/- contract-call:/g)).toHaveLength(1);
  });

  it('expects each transaction from the staker it pays, by default', () => {
    // Honest about whose money it is, and needs their key to send.
    expect(buildRecoveryPlan([REJECTED_2620])).toContain(
      `expected-sender: ${STAKER}`,
    );
  });

  it('rewrites every sender when an operator runs the whole plan', () => {
    // Permissionless, and the contract pays the staker whoever sends it — so
    // this changes who pays the fee, not who gets the sats.
    const operator = 'SP3RNAZMADES3GWQZTZ53M5XCWCXMQXXP1KWM75X4';
    const plan = buildRecoveryPlan([REJECTED_2620, SECOND], {
      sender: operator,
    });
    expect(plan.match(/expected-sender: SP\w+/g)).toEqual([
      `expected-sender: ${operator}`,
      `expected-sender: ${operator}`,
    ]);
    // The stakers are still named — in the comments, as who each call pays.
    // Losing that would make the plan unreviewable.
    expect(plan).toContain(`sats back to ${STAKER}`);
    expect(plan).toContain(`sats back to ${OTHER_STAKER}`);
  });

  it('says what each call recovers, so the plan can be read before it is run', () => {
    expect(buildRecoveryPlan([REJECTED_2620])).toContain(
      `# request 2620 · 173,912 sats back to ${STAKER}`,
    );
  });

  it('splits into batches, each carrying its own epoch', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({
      ...REJECTED_2620,
      requestId: 3000 + index,
    }));
    const plan = buildRecoveryPlan(many, { batchSize: 2, epoch: '3.2' });
    expect(plan.match(/^    - id: \d+$/gm)).toEqual([
      '    - id: 0',
      '    - id: 1',
      '    - id: 2',
    ]);
    expect(plan.match(/epoch: "3\.2"/g)).toHaveLength(3);
  });

  it('orders by request id, so an unchanged chain gives an unchanged file', () => {
    const forwards = buildRecoveryPlan([REJECTED_2620, SECOND]);
    const backwards = buildRecoveryPlan([SECOND, REJECTED_2620]);
    expect(forwards).toBe(backwards);
    expect(forwards.indexOf('u2620')).toBeLessThan(forwards.indexOf('u2634'));
  });

  it('writes an empty plan rather than a broken one when there is nothing to do', () => {
    // Not an error: everybody having been paid is the good case, and the file
    // still has to parse.
    const plan = buildRecoveryPlan([]);
    expect(plan).toContain('  batches:\n    []');
    expect(plan).not.toContain('contract-call');
  });
});

describe('summarise', () => {
  it('totals per pool, heaviest first', () => {
    expect(summarise([SECOND, REJECTED_2620, { ...SECOND, requestId: 2635 }]))
      .toEqual([
        { pool: FASTPOOL, count: 1, sats: 173_912n },
        { pool: SECOND.pool, count: 2, sats: 2_758n },
      ]);
  });
});
