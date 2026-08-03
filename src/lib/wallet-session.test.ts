import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearWalletSession,
  getWalletSession,
  sessionFromAddresses,
  setWalletSession,
} from './wallet-session';

/*
 * The public key is why this store exists. localStorage strips it out, so a
 * page that only had localStorage to go on had to reconnect — a second wallet
 * popup — at the moment somebody pressed Stake. These are the rules that keep
 * that from coming back.
 */

const STX = 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR';
const BTC = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

afterEach(() => {
  clearWalletSession();
  vi.restoreAllMocks();
});

describe('sessionFromAddresses', () => {
  it('keeps the public key beside the address it belongs to', () => {
    expect(
      sessionFromAddresses([
        { address: BTC },
        { address: STX, publicKey: 'aa' },
      ]),
    ).toEqual({ stxAddress: STX, publicKey: 'aa', btcAddress: BTC });
  });

  it('refuses a wallet answer with no public key in it', () => {
    // Half a session is worse than none: it would look connected and then
    // fail at signing time, which is the wrong moment to find out.
    expect(sessionFromAddresses([{ address: STX }])).toBeNull();
    expect(sessionFromAddresses([])).toBeNull();
  });

  it('ignores an entry that is not a Stacks address', () => {
    expect(
      sessionFromAddresses([{ address: BTC, publicKey: 'aa' }]),
    ).toBeNull();
  });

  it('takes the BTC address only when the wallet gave one', () => {
    expect(sessionFromAddresses([{ address: STX, publicKey: 'aa' }])).toEqual({
      stxAddress: STX,
      publicKey: 'aa',
      btcAddress: null,
    });
  });
});

describe('the session store', () => {
  it('is shared, so connecting on one pool connects for all of them', () => {
    expect(getWalletSession()).toBeNull();
    setWalletSession({ stxAddress: STX, publicKey: 'aa', btcAddress: null });
    expect(getWalletSession()?.publicKey).toBe('aa');
    clearWalletSession();
    expect(getWalletSession()).toBeNull();
  });

  it('never reaches localStorage — the key lives for the tab only', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null });
    setWalletSession({ stxAddress: STX, publicKey: 'aa', btcAddress: null });
    expect(setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
