import { WALLET_CONNECT_PROVIDER } from '@stacks/connect';
import { describe, expect, it } from 'vitest';
import {
  forgetWallet,
  walletConnectConfig,
  walletOptions,
} from './wallet-connect';

/*
 * Xverse on mobile connected, the user approved, and it came back with no
 * addresses and a complaint that a bip address method was unavailable.
 *
 * The obvious-looking fix — ask only for the `stacks` namespace — was wrong
 * twice over, and these exist so it is not tried again:
 *
 *  - AppKit builds its wallet list from `networks.flatMap(n => n.chains)`, so
 *    narrowing the namespaces narrows the picker. Xverse stopped being offered
 *    at all.
 *  - `UniversalConnector.connect` passes everything as `optionalNamespaces`,
 *    so naming bip122 never required a wallet to support it. It was never the
 *    cause.
 *
 * The cause is downstream, in what a WalletConnect session can answer with at
 * all — not in which method asks. See WALLETCONNECT.md, which is also why
 * WalletConnect is switched off for now.
 */

describe('WalletConnect is not on offer', () => {
  const options = walletOptions();

  it('is not configured, so no connector is created', () => {
    // The library creates the connector, and appends the picker entry, whenever
    // this key is present — it never looks at the id first, so an empty config
    // would not do.
    expect(options.walletConnect).toBeUndefined();
  });

  it('is taken out of the picker, where it is listed by default', () => {
    // The catch: WALLET_CONNECT_PROVIDER is in DEFAULT_PROVIDERS already, so
    // dropping the option above is not enough on its own — the entry stays in
    // the picker and leads to a connector nothing initialised.
    const offered = options.defaultProviders?.map((p) => p.id) ?? [];
    expect(offered).not.toContain(WALLET_CONNECT_PROVIDER.id);
    expect(offered).toContain('LeatherProvider');
    expect(offered).toContain('XverseProviders.BitcoinProvider');
  });
});

/*
 * The config itself, checked apart from whether it is currently handed over.
 * These guard what was learnt the hard way, so that uncommenting the project
 * id puts back something that works rather than something that has quietly
 * rotted in the meantime.
 */
describe('what the app would ask a WalletConnect wallet for', () => {
  const config = walletConnectConfig('0'.repeat(32));
  const networks = config.networks ?? [];

  it('offers every wallet the library knows, not just Stacks ones', () => {
    // Narrowing this is what made Xverse vanish from the picker.
    expect(networks.map((n) => n.namespace).sort()).toEqual([
      'bip122',
      'stacks',
    ]);
  });

  it('asks for the two methods staking actually uses', () => {
    const methods = networks.flatMap((n) => n.methods ?? []);
    expect(methods).toContain('stx_getAddresses');
    expect(methods).toContain('stx_signTransaction');
  });

  it('tells the wallet where to send the user back to', () => {
    // Without this the wallet has nothing to open when it is done, and an
    // approval on a phone leaves the page waiting behind the wallet.
    //
    // AppKit's `Metadata` type omits `redirect`, though the WalletConnect core
    // type it is handed to carries it — so this reads it through that shape
    // rather than AppKit's narrower one.
    const metadata = config.metadata as
      | { url?: string; redirect?: { universal?: string; linkMode?: boolean } }
      | undefined;
    expect(metadata?.redirect).toBeDefined();
    expect(metadata?.redirect?.universal).toBe(metadata?.url);
    // linkMode needs a verified domain and a .well-known file; without those
    // it makes the round trip worse rather than better.
    expect(metadata?.redirect?.linkMode).toBeFalsy();
  });

  it('passes the project id through, since the picker needs one', () => {
    expect(config.projectId).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('forgetWallet', () => {
  it('is safe to call when there is nothing to forget', () => {
    // It runs on every connect attempt, including the first, and after a
    // failed one — so it has to be callable from any state.
    expect(() => forgetWallet()).not.toThrow();
    expect(() => forgetWallet()).not.toThrow();
  });
});
