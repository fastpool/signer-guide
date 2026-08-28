import { MAX_LOCK_CYCLES } from '@guide/lib/staking';
import { DEFAULT_LOCK_CYCLES, DEFAULT_REWARDS } from './stake-defaults';

/*
 * Two screens offer to make a stake, and they had drifted: the guided one said
 * two weeks and sBTC, the full form said ninety-six cycles and a Bitcoin
 * address — so the row saying "change this" led to a form that disagreed with
 * it. These hold the pair together.
 */
describe('the staking defaults', () => {
  it('locks for a period pox-5 will actually accept', () => {
    expect(DEFAULT_LOCK_CYCLES).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_LOCK_CYCLES).toBeLessThanOrEqual(MAX_LOCK_CYCLES);
  });

  it('takes the whole of that maximum, since a stake can be ended early anyway', () => {
    expect(DEFAULT_LOCK_CYCLES).toBe(MAX_LOCK_CYCLES);
  });

  it('asks for no Bitcoin address, because a mistyped one cannot be recovered', () => {
    expect(DEFAULT_REWARDS).toBe('sbtc');
  });
});
