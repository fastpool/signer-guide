import { accountFromSession, foregroundUrl, pairingUrl, WALLET_LINKS } from './walletconnect';
import { WalletUnusable } from './types';

/*
 * The half of the WalletConnect route that can be tested without a relay: how
 * a wallet is opened, and what is read out of an approved session.
 *
 * The second of those is the one that matters. WALLETCONNECT.md records the
 * web page failing here — it needed a public key in the session and the
 * wallets do not put one there. This app must not need it, and the tests below
 * are what hold that line: a session with no public key in it still produces a
 * usable account.
 */

describe('pairingUrl', () => {
  const uri = 'wc:topic@2?relay-protocol=irn&symKey=abc';

  it('opens a named wallet on its own scheme, at its own path', () => {
    expect(pairingUrl('xverse', uri)).toBe(
      `xverse://wc?uri=${encodeURIComponent(uri)}`,
    );
    expect(pairingUrl('leather', uri)).toBe(
      `leather://wc?uri=${encodeURIComponent(uri)}`,
    );
    // OKX routes through `main/`, which is why the path is per wallet and not
    // one rule with the scheme swapped.
    expect(pairingUrl('okx', uri)).toBe(
      `okx://main/wc?uri=${encodeURIComponent(uri)}`,
    );
  });

  it('hands the raw URI to the system when no wallet was named', () => {
    expect(pairingUrl('any', uri)).toBe(uri);
  });

  it('escapes the URI, which carries characters a query string would eat', () => {
    expect(pairingUrl('xverse', uri)).not.toContain('&relay-protocol');
  });
});

describe('foregroundUrl', () => {
  it('brings a paired wallet forward without a URI on it', () => {
    expect(foregroundUrl('xverse')).toBe('xverse://');
    expect(foregroundUrl('leather')).toBe('leather://');
    expect(foregroundUrl('okx')).toBe('okx://');
  });

  it('has nothing to open when the wallet was never named', () => {
    expect(foregroundUrl('any')).toBeNull();
  });

  it('names a route for every wallet it offers', () => {
    expect(Object.keys(WALLET_LINKS)).toEqual(['xverse', 'leather', 'okx', 'any']);
  });
});

describe('accountFromSession', () => {
  const session = {
    namespaces: {
      stacks: { accounts: ['stacks:1:SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR'] },
    },
  };

  it('reads the address out of a CAIP-10 account', () => {
    expect(accountFromSession(session).stxAddress).toBe(
      'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR',
    );
  });

  it('is usable without a public key — the whole reason this app works', () => {
    const account = accountFromSession(session);
    expect(account.publicKey).toBeUndefined();
    expect(account.stxAddress).toBeTruthy();
  });

  it('takes a public key when the wallet volunteered one', () => {
    const account = accountFromSession({
      ...session,
      sessionProperties: {
        stacks_getAddresses: JSON.stringify([
          {
            address: 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR',
            publicKey: '02aabb',
          },
        ]),
      },
    });
    expect(account.publicKey).toBe('02aabb');
  });

  it('ignores published properties it cannot parse', () => {
    const account = accountFromSession({
      ...session,
      sessionProperties: { stacks_getAddresses: 'not json' },
    });
    expect(account.publicKey).toBeUndefined();
    expect(account.stxAddress).toBeTruthy();
  });

  it('takes the Bitcoin address beside it when the session has one', () => {
    const account = accountFromSession({
      namespaces: {
        ...session.namespaces,
        bip122: { accounts: ['bip122:000:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'] },
      },
    });
    expect(account.btcAddress).toBe('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
  });

  it('refuses a session with no Stacks address rather than half a one', () => {
    expect(() => accountFromSession({ namespaces: {} })).toThrow(WalletUnusable);
  });
});
