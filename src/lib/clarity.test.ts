import { describe, expect, it } from 'vitest';
import {
  decodeStacksAddress,
  parseUint,
  serializeContractPrincipal,
  serializeUint,
} from './clarity';

/*
 * The expected hex is not hand-written: it is what `serializeCV` from
 * @stacks/transactions produces for the same value. If this file ever
 * disagrees with the library, this file is wrong.
 *
 *   serializeCV(contractPrincipalCV(address, name))
 *
 * Five of the registered signers, chosen for different addresses and
 * different name lengths.
 */
const REFERENCE: [string, string][] = [
  [
    'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.juice-pool-stx-signer',
    '06163699883a5bd5324eb8975e56bec8a9f843409b4e156a756963652d706f6f6c2d7374782d7369676e6572',
  ],
  [
    'SP21YTSM60CAY6D011EZVEVNKXVW8FVZE198XEFFP.fastpool-1-signer-manager',
    '061683ed66860315e334010bbfb76eb3eef887efee0a1966617374706f6f6c2d312d7369676e65722d6d616e61676572',
  ],
  [
    'SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.xverse-signer-manager-1',
    '0616111984c0f34b08f6c64ee0a0698755e41e918de0177876657273652d7369676e65722d6d616e616765722d31',
  ],
  [
    'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.signer-manager-stacking-dao-v1',
    '0616099fb88926d82f30b2f40eaf3ee423cb725bdb3b1e7369676e65722d6d616e616765722d737461636b696e672d64616f2d7631',
  ],
  [
    'SPWJG9ZQT7VG8F3YS9TK0YN3VK34M76NYDZMTCWT.signer-manager',
    '0616392827f7d1f7043c7eca75307aa3dcc64a1cd5f30e7369676e65722d6d616e61676572',
  ],
];

describe('serializeContractPrincipal', () => {
  it.each(REFERENCE)('encodes %s as @stacks/transactions does', (id, hex) => {
    expect(serializeContractPrincipal(id)).toBe(hex);
  });

  it('refuses something that is not a contract id', () => {
    expect(() => serializeContractPrincipal('SPWJG9ZQ')).toThrow();
    expect(() =>
      serializeContractPrincipal('SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22'),
    ).toThrow();
  });

  it('refuses a contract name Clarity would not accept', () => {
    expect(() =>
      serializeContractPrincipal(
        'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.1-leading-digit',
      ),
    ).toThrow();
  });
});

describe('decodeStacksAddress', () => {
  it('reads the mainnet version off the address', () => {
    // 22 = mainnet single-sig, which every signer above is.
    const { version, hash160 } = decodeStacksAddress(
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22',
    );
    expect(version).toBe(22);
    expect(hash160).toHaveLength(20);
  });

  it('accepts the letters c32 treats as digits', () => {
    // O reads as 0, I and L as 1 — a person copying by hand may type either.
    const canonical = decodeStacksAddress(
      'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22',
    );
    const typed = decodeStacksAddress(
      'SPV9K2ITBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22',
    );
    expect(typed.hash160).toEqual(canonical.hash160);
  });

  it('refuses a string that is not an address at all', () => {
    expect(() => decodeStacksAddress('not-an-address')).toThrow();
  });
});

describe('serializeUint', () => {
  it('encodes as @stacks/transactions does', () => {
    expect(serializeUint(141)).toBe('010000000000000000000000000000008d');
    expect(serializeUint(0)).toBe('0100000000000000000000000000000000');
  });

  it('refuses a negative amount rather than wrapping it', () => {
    expect(() => serializeUint(-1)).toThrow();
  });
});

describe('parseUint', () => {
  it('reads a uint response', () => {
    expect(parseUint('0x010000000000000000000000000000008d')).toBe(141n);
  });

  it('returns null for anything that is not a uint', () => {
    // A wrong number on the page is worse than no number.
    expect(parseUint('0x08010000000000000000000000000000008d')).toBeNull();
    expect(parseUint('0x09')).toBeNull();
    expect(parseUint('')).toBeNull();
  });
});
