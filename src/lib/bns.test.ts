import { describe, expect, it } from 'vitest';
import { isBnsName } from './bns';
import { isLookupTarget, isPrincipal, parseAddressList } from './principals';

/*
 * A name and a contract principal both have a dot in them, and this page turns
 * whichever it is given into an address it then reports somebody's stake for.
 * Reading one as the other would look up the wrong thing and say nothing about
 * having done so, so telling them apart is the part worth pinning down.
 */

const NAME = 'friedger.btc';
const ADDRESS = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const CONTRACT =
  'SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X.ccd014-pox5-staking-mia';

describe('isBnsName', () => {
  it('takes a name in a namespace', () => {
    expect(isBnsName(NAME)).toBe(true);
    expect(isBnsName('example.id')).toBe(true);
    expect(isBnsName('a.b')).toBe(true);
    expect(isBnsName('with-hyphen_and_underscore.btc')).toBe(true);
  });

  it('does not take a contract principal for a name', () => {
    // The collision that matters. A Stacks address is upper-case c32 and a
    // name is lower case, which is what keeps these apart.
    expect(isBnsName(CONTRACT)).toBe(false);
    expect(isBnsName(ADDRESS)).toBe(false);
  });

  it('refuses what the registry could not be asked about', () => {
    for (const bad of [
      '',
      'nodot',
      '.btc',
      'name.',
      'a.b.c',
      'UPPER.btc',
      'name.BTC',
      'spaced name.btc',
      `${'x'.repeat(49)}.btc`,
      `name.${'y'.repeat(21)}`,
    ]) {
      expect(isBnsName(bad), bad).toBe(false);
    }
  });
});

describe('names and principals together', () => {
  it('never reads one as the other', () => {
    expect(isPrincipal(NAME)).toBe(false);
    expect(isBnsName(CONTRACT)).toBe(false);
    expect(isLookupTarget(NAME)).toBe(true);
    expect(isLookupTarget(CONTRACT)).toBe(true);
    expect(isLookupTarget('neither')).toBe(false);
  });

  it('takes a list that mixes them', () => {
    const { entries, rejected } = parseAddressList(
      `${NAME}\n${ADDRESS}\n${CONTRACT}`,
    );
    expect(entries.map((e) => e.address)).toEqual([NAME, ADDRESS, CONTRACT]);
    expect(rejected).toEqual([]);
  });

  it('takes names comma-separated on one line', () => {
    const { entries } = parseAddressList(`${NAME}, example.id`);
    expect(entries.map((e) => e.address)).toEqual([NAME, 'example.id']);
  });

  it('keeps a label written beside a name', () => {
    const { entries } = parseAddressList(`${NAME} # mine`);
    expect(entries[0]).toEqual({ address: NAME, label: 'mine' });
  });
});
