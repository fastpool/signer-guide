import { fireEvent, screen } from '@testing-library/react-native';
import {
  allGroups,
  groupVotingPowerBips,
  ungroupedVotingPowerBips,
} from '@guide/lib/signer-groups';
import { isHighFee } from '@guide/lib/pool-filters';
import { renderApp } from '../test/harness';
import { installFetch } from '../test/network';
import { resetChain } from '../test/chain';
import { BUNDLED } from '../data/snapshot';

jest.mock('@stacks/bitcoin-staking', () =>
  require('../test/chain').stakingPackageMock(),
);

/*
 * Who is behind the signer set, on a phone.
 *
 * The one screen in this app whose headline number the chain cannot check, so
 * what is tested is the same thing the screen itself has to do: show its work.
 * The figures come from the guide's own `signer-groups` rather than from
 * numbers typed in here — the data file is rewritten hourly and committed, so
 * a hard-coded percentage is a test that goes red on its own.
 */

const signers = BUNDLED.signers.signers;
const ustx = BUNDLED.totals.ustx;

const share = (bips: number | null) =>
  bips === null ? 'not known' : `${(bips / 100).toFixed(2)}%`;

beforeEach(() => {
  resetChain();
  installFetch();
});

describe('the group index', () => {
  it('is one tap from home, with the rest of the guide', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('more-groups'));
    expect(await screen.findByTestId('groups-screen')).toBeOnTheScreen();
  });

  it('gives every group its share of the cycle', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('more-groups'));
    await screen.findByTestId('groups-screen');

    for (const group of allGroups()) {
      expect(screen.getByTestId(`groups-row-${group.id}`)).toBeOnTheScreen();
      expect(screen.getByTestId(`groups-share-${group.id}`)).toHaveTextContent(
        share(groupVotingPowerBips(group, signers, ustx)),
      );
    }
  });

  it('says what no group claims, rather than reading as the whole network', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('more-groups'));
    await screen.findByTestId('groups-screen');

    expect(screen.getByTestId('groups-ungrouped')).toBeOnTheScreen();
    expect(screen.getByTestId('groups-ungrouped-share')).toHaveTextContent(
      share(ungroupedVotingPowerBips(signers, ustx)),
    );
  });
});

describe('one group', () => {
  const biggest = [...allGroups()].sort(
    (a, b) =>
      (groupVotingPowerBips(b, signers, ustx) ?? -1) -
      (groupVotingPowerBips(a, signers, ustx) ?? -1),
  )[0];

  it('opens from the index and shows the evidence for the claim', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('more-groups'));
    fireEvent.press(await screen.findByTestId(`groups-row-${biggest.id}`));

    expect(await screen.findByTestId('group-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('group-name')).toHaveTextContent(biggest.name);
    expect(screen.getByTestId('group-share')).toHaveTextContent(
      share(groupVotingPowerBips(biggest, signers, ustx)),
    );
    // A claim about who controls a third of the signer set, published without
    // what it rests on, is asking to be believed.
    expect(screen.getByText(biggest.source)).toBeOnTheScreen();
  });

  it('names every pool it added together, and each opens', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('more-groups'));
    fireEvent.press(await screen.findByTestId(`groups-row-${biggest.id}`));
    await screen.findByTestId('group-screen');

    const first = biggest.members[0].contractId!;
    fireEvent.press(screen.getByTestId(`group-pool-${first}`));
    expect(await screen.findByTestId('pool-screen')).toBeOnTheScreen();
    // And back the other way: the pool says who is behind it.
    expect(screen.getByTestId(`pool-group-${biggest.id}`)).toBeOnTheScreen();
  });
});

describe('a fee that keeps almost everything', () => {
  const steep = signers.filter(isHighFee);

  it('is marked on the row rather than left as a grey number', async () => {
    // Four pools charge 99.99% while holding about a million STX each. In the
    // list they used to look exactly like a pool charging five.
    expect(steep.length).toBeGreaterThan(0);

    renderApp();
    fireEvent.press(await screen.findByTestId('more-pools'));
    await screen.findByTestId('pools-screen');

    expect(await screen.findByTestId('pools-steep-filter')).toHaveTextContent(
      `Fee of 95% or more (${steep.length})`,
    );
  });

  it('narrows the list to exactly those pools, and back again', async () => {
    renderApp();
    fireEvent.press(await screen.findByTestId('more-pools'));
    const toggle = await screen.findByTestId('pools-steep-filter');

    fireEvent.press(toggle);
    for (const signer of steep) {
      expect(
        await screen.findByTestId(`pools-row-${signer.contractId}`),
      ).toBeOnTheScreen();
    }
    const cheap = signers.find((s) => s.feeBips === 0)!;
    expect(
      screen.queryByTestId(`pools-row-${cheap.contractId}`),
    ).not.toBeOnTheScreen();

    fireEvent.press(toggle);
    expect(
      await screen.findByTestId(`pools-row-${cheap.contractId}`),
    ).toBeOnTheScreen();
  });
});
