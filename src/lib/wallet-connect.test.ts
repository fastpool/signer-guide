import { describe, expect, it } from 'vitest';
import { forgetWallet, walletOptions } from './wallet-connect';

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
 * The cause is downstream, in which method is used to ask for addresses, and
 * is handled by the `stx_getAddresses` fallback in `requestAddresses`.
 */

describe('what the app asks a WalletConnect wallet for', () => {
  const config = walletOptions().walletConnect;
  const networks = config?.networks ?? [];

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
    const metadata = config?.metadata as
      | { url?: string; redirect?: { universal?: string; linkMode?: boolean } }
      | undefined;
    expect(metadata?.redirect).toBeDefined();
    expect(metadata?.redirect?.universal).toBe(metadata?.url);
    // linkMode needs a verified domain and a .well-known file; without those
    // it makes the round trip worse rather than better.
    expect(metadata?.redirect?.linkMode).toBeFalsy();
  });

  it('carries a project id, or the picker would not offer WalletConnect', () => {
    expect(config?.projectId).toMatch(/^[0-9a-f]{32}$/);
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
