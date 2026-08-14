import { describe, expect, it } from 'vitest';
import {
  isPrincipal,
  MAX_ADDRESSES,
  parseAddressList,
  takeAddresses,
} from './principals';

/*
 * A pasted list is the one input this guide takes from a person, and the two
 * ways it can go wrong are both about somebody's own money: an address quietly
 * dropped is one they are never told about, and a line read as a label is an
 * address they thought they had asked about.
 */

const A = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const B = 'SP3VRXVQ4XWJVGCJQCWQKX0FRTVHT2QHHFPWKJHJ';
const CONTRACT =
  'SPN4Y5QPGQA8882ZXW90ADC2DHYXMSTN8VAR8C3X.ccd014-pox5-staking-mia';

describe('isPrincipal', () => {
  it('takes an address and a contract on one', () => {
    expect(isPrincipal(A)).toBe(true);
    expect(isPrincipal(CONTRACT)).toBe(true);
  });

  it('takes an address somebody pasted in lower case', () => {
    // Explorers and chat clients lower-case them; the address half is c32 and
    // case-insensitive, so refusing it would be pedantry with a cost.
    expect(isPrincipal(A.toLowerCase())).toBe(true);
  });

  it('refuses what is not one', () => {
    for (const bad of ['', 'hello', 'SP123', '0x1234', 'bc1qxy', A + '!']) {
      expect(isPrincipal(bad), bad).toBe(false);
    }
  });
});

describe('parseAddressList', () => {
  it('reads one per line', () => {
    const { entries } = parseAddressList(`${A}\n${B}`);
    expect(entries.map((e) => e.address)).toEqual([A, B]);
  });

  it('reads a comma-separated line as several addresses', () => {
    // The paste-a-list case. Read as one address with a label, this loses
    // every address but the first — silently, which is the worst part.
    const { entries } = parseAddressList(`${A}, ${B}, ${CONTRACT}`);
    expect(entries.map((e) => e.address)).toEqual([A, B, CONTRACT]);
    expect(entries.every((e) => e.label === null)).toBe(true);
  });

  it('still keeps a name written beside a single address', () => {
    const { entries } = parseAddressList(`${A} # savings\n${B} treasury`);
    expect(entries[0]).toEqual({ address: A, label: 'savings' });
    expect(entries[1]).toEqual({ address: B, label: 'treasury' });
  });

  it('survives a list pasted out of JSON', () => {
    const { entries } = parseAddressList(`[\n  "${A}",\n  "${B}"\n]`);
    expect(entries.map((e) => e.address)).toEqual([A, B]);
  });

  it('names what it could not read rather than dropping it', () => {
    const { entries, rejected } = parseAddressList(
      `${A}\nnot-an-address\n${B}`,
    );
    expect(entries).toHaveLength(2);
    expect(rejected).toEqual(['not-an-address']);
  });

  it('does not take an address that is not the first thing on its line', () => {
    // "send 5 STX to SP…" is a sentence, not a list entry, and reading an
    // address out of the middle of one is a guess at what somebody meant.
    const { entries, rejected } = parseAddressList(`please check ${A}`);
    expect(entries).toEqual([]);
    expect(rejected).toHaveLength(1);
  });

  it('skips blank lines and the brackets a paste brings with it', () => {
    expect(parseAddressList('\n[\n]\n   \n').entries).toEqual([]);
    expect(parseAddressList('\n[\n]\n   \n').rejected).toEqual([]);
  });
});

describe('takeAddresses', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      address: `${A.slice(0, -2)}${String(i).padStart(2, '0')}`,
      label: null,
    }));

  it('drops a repeat rather than looking it up twice', () => {
    const { taken } = takeAddresses([
      { address: A, label: null },
      { address: A, label: null },
      { address: B, label: null },
    ]);
    expect(taken.map((e) => e.address)).toEqual([A, B]);
  });

  it('cuts to the limit and says how many it cut', () => {
    // Said, not silent: somebody who pasted thirty addresses and got twenty
    // answers should not have to count them to find that out.
    const { taken, dropped } = takeAddresses(many(25));
    expect(taken).toHaveLength(MAX_ADDRESSES);
    expect(dropped).toBe(5);
  });

  it('reports nothing dropped when everything fits', () => {
    expect(takeAddresses(many(3)).dropped).toBe(0);
  });

  it('counts duplicates out before the limit, not against it', () => {
    const duplicated = [...many(20), ...many(20)];
    const { taken, dropped } = takeAddresses(duplicated);
    expect(taken).toHaveLength(20);
    expect(dropped).toBe(0);
  });
});
