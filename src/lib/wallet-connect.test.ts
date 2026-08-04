import { describe, expect, it } from 'vitest';
import { forgetWallet, walletOptions } from './wallet-connect';

/*
 * Xverse on mobile connected, the user approved, and then it failed with no
 * addresses and a complaint about a bip method being unavailable. The cause
 * was the default config: it negotiates two namespaces, `stacks` and
 * `bip122`, and Xverse does not serve bip122 `getAccountAddresses` over
 * WalletConnect.
 *
 * Nothing here needs the Bitcoin namespace, so asking for it can only cost a
 * session. These pin that down, since the failure only shows up on a phone.
 */

describe('what the app asks a WalletConnect wallet for', () => {
  const networks = walletOptions().walletConnect?.networks ?? [];

  it('asks for the Stacks namespace and nothing else', () => {
    expect(networks.map((n) => n.namespace)).toEqual(['stacks']);
  });

  it('never asks for bip122, which is what Xverse could not answer', () => {
    const asked = JSON.stringify(networks);
    expect(asked).not.toContain('bip122');
    expect(asked).not.toContain('getAccountAddresses');
  });

  it('still asks for the two methods staking actually uses', () => {
    const methods = networks.flatMap((n) => n.methods ?? []);
    expect(methods).toContain('stx_getAddresses');
    expect(methods).toContain('stx_signTransaction');
  });

  it('carries a project id, or the picker would not offer WalletConnect', () => {
    expect(walletOptions().walletConnect?.projectId).toMatch(/^[0-9a-f]{32}$/);
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
