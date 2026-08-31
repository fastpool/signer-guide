import { fireEvent, screen } from '@testing-library/react-native';
import { lastRotation } from '@guide/lib/key-rotations';
import type { SignerCyclePerformance } from '@guide/lib/types';
import { renderApp } from '../test/harness';
import { installFetch } from '../test/network';
import { resetChain } from '../test/chain';
import { BUNDLED } from '../data/snapshot';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * Whether the node behind a pool turns up, on a phone.
 *
 * The figures are somebody else's observation fetched at runtime, so what is
 * tested is the reading of them rather than the arithmetic — which is shared
 * with the website and tested there. Three things have to hold: a signer that
 * was never heard from is not called fast, a pool that rotated its key shows
 * the key that actually holds the seat, and a file that will not load costs
 * this card and nothing else on the screen.
 */

const bare = (key: string) => key.toLowerCase().replace(/^0x/, '');
const signers = BUNDLED.signers.signers;

const row = (over: Partial<SignerCyclePerformance> = {}): SignerCyclePerformance => ({
  cycle: 142,
  accepted: 33890,
  rejected: 776,
  missed: 156,
  responseMs: 5386,
  lastSeen: '2026-08-31T07:42:40.276Z',
  weight: 785,
  weightPercent: 19.625,
  final: false,
  ...over,
});

/** A pool with a key, no rotation, and something to say about it. */
const plain = signers.find(
  (s) => s.signerKey && !lastRotation(s.contractId),
)!;

beforeEach(() => {
  resetChain();
});

/**
 * Open one pool from the list.
 *
 * `narrow` presses the steep-fee switch on the way, which is how a pool
 * outside the first screenful is reached: the list is a FlatList and only
 * renders what is near the viewport. It is not a detour for its own sake —
 * the pool that rotated its key is also one of the four charging 99.99%.
 */
const openPool = async (contractId: string, narrow = false) => {
  renderApp();
  fireEvent.press(await screen.findByTestId('more-pools'));
  if (narrow) fireEvent.press(await screen.findByTestId('pools-steep-filter'));
  fireEvent.press(await screen.findByTestId(`pools-row-${contractId}`));
  return screen.findByTestId('pool-screen');
};

describe('a signer that answers', () => {
  it('leads with the share it answered, not the share it accepted', async () => {
    installFetch({
      performance: {
        [bare(plain.signerKey!)]: {
          signerKey: bare(plain.signerKey!),
          cycles: [row(), row({ cycle: 141, final: true })],
        },
      },
    });
    await openPool(plain.contractId);

    // 34,666 of 34,822 answered — accepted or refused, both are turning up.
    expect(await screen.findByTestId('conduct-answered')).toHaveTextContent(
      '99.55%',
    );
    expect(screen.getByTestId('conduct-response')).toHaveTextContent('5.4 s');
    expect(screen.getByText(/still running/)).toBeOnTheScreen();
  });

  it('shows the cycles behind it once there is more than one', async () => {
    installFetch({
      performance: {
        [bare(plain.signerKey!)]: {
          signerKey: bare(plain.signerKey!),
          cycles: [row(), row({ cycle: 141, final: true })],
        },
      },
    });
    await openPool(plain.contractId);
    expect(await screen.findByTestId('conduct-history')).toBeOnTheScreen();
  });
});

describe('a pool that rotated its key', () => {
  const rotation = lastRotation(
    signers.find((s) => lastRotation(s.contractId))!.contractId,
  )!;

  it('reads the key that actually holds the seat', async () => {
    /*
     * The new key holds nothing until the next set is worked out, so its file
     * 404s. Stopping at "nothing on file" would hide the fortnight in which
     * the old key sat on a seat and answered none of it.
     */
    installFetch({
      performance: {
        [bare(rotation.from!)]: {
          signerKey: bare(rotation.from!),
          cycles: [
            row({ accepted: 0, rejected: 0, missed: 33976, responseMs: null, lastSeen: null }),
          ],
        },
      },
    });
    await openPool(rotation.contractId, true);

    expect(await screen.findByTestId('conduct-never')).toBeOnTheScreen();
    expect(screen.getByTestId('pool-rotated')).toHaveTextContent(
      /Changed its signer key on/,
    );
    // Never answered is an absence, not a time. The API calls it 0 ms.
    expect(screen.queryByText('0.0 s')).toBeNull();
  });
});

describe('when the record will not load', () => {
  it('costs the card and nothing else on the screen', async () => {
    installFetch({}); // every performance file 404s
    await openPool(plain.contractId);

    expect(await screen.findByTestId('conduct-card')).toBeOnTheScreen();
    expect(screen.getByTestId('pool-staked')).toBeOnTheScreen();
    expect(screen.getByTestId('pool-fee')).toBeOnTheScreen();
  });
});
