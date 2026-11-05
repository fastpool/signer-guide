import { describe, expect, it } from 'vitest';
import type { Signer } from '../lib/types';
import { searchTarget, suggestionsFor } from './SiteHeader';

const POOL =
  'SP21D6BW36TSGWAZS8K4JAJVTNXWKQN9G3TH5MG6A.signer-manager-bd-contract';
const signers = [{ contractId: POOL } as Signer];

describe('searchTarget', () => {
  it('opens the pool page for a signer manager the guide knows', () => {
    expect(searchTarget(POOL, signers)).toBe(`#/signer/${POOL}`);
  });

  it('reads a lower-cased address half as the same pool', () => {
    const [address, name] = POOL.split('.');
    expect(searchTarget(`${address.toLowerCase()}.${name}`, signers)).toBe(
      `#/signer/${POOL}`,
    );
  });

  it('looks up any other address or BNS name', () => {
    expect(searchTarget('friedger.btc', signers)).toBe('#/status/friedger.btc');
    expect(
      searchTarget('SP21D6BW36TSGWAZS8K4JAJVTNXWKQN9G3TH5MG6A', signers),
    ).toBe('#/status/SP21D6BW36TSGWAZS8K4JAJVTNXWKQN9G3TH5MG6A');
  });

  it('sends anything else to the empty box', () => {
    expect(searchTarget('hello', signers)).toBe('#/status');
    expect(searchTarget('', signers)).toBe('#/status');
  });
});

describe('suggestionsFor', () => {
  const pools = [
    { contractId: 'SP1.fastpool-max500', displayName: 'Fast Pool Max500' },
    { contractId: 'SP2.signer-manager-pox5', displayName: 'Pox5' },
    { contractId: 'SP3.breakfast-pool', displayName: 'Breakfast' },
  ] as Signer[];

  it('offers nothing for a single letter', () => {
    expect(suggestionsFor('f', pools)).toEqual([]);
  });

  it('puts a name that starts with the text before one that contains it', () => {
    const labels = suggestionsFor('fast', pools)
      .filter((s) => s.kind === 'pool')
      .map((s) => s.label);
    expect(labels).toEqual(['Fast Pool Max500', 'Breakfast']);
  });

  it('matches the contract name as well as the display name', () => {
    expect(suggestionsFor('pox5', pools)[0]).toMatchObject({
      label: 'Pox5',
      href: '#/signer/SP2.signer-manager-pox5',
    });
  });
});
