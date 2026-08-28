import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Text } from 'react-native';
import { useWallet, WalletProvider } from './context';
import { mockWallet } from './mock';
import { WalletCancelled, type ContractCallRequest, type Wallet } from './types';

/*
 * Who the app is looking at, and whether it can sign for them.
 *
 * Two states, kept apart on purpose. An address can be watched without a
 * wallet behind it — worth having, and the only way to see a position on a
 * phone with no wallet installed. Treating "connected" as one flag made the
 * app offer to sign with a session that was not there.
 */

const ADDRESS = 'SP1N8F8BBBC60XF6HJBNJHKPRGJ7WZBRGNDJX4YDR';
const OTHER = 'SP206Y7BR5NFCR517VGVX04BSGNA5425GM6DMF9H';

const CALL: ContractCallRequest = {
  contract: 'SP000000000000000000002Q6VF78.pox-5',
  functionName: 'stake',
  functionArgs: [],
  postConditions: [],
  postConditionMode: 'deny',
  network: 'mainnet',
};

let api: ReturnType<typeof useWallet>;

function Probe() {
  api = useWallet();
  return (
    <>
      <Text testID='address'>{api.account?.stxAddress ?? 'none'}</Text>
      <Text testID='can-sign'>{String(api.canSign)}</Text>
      <Text testID='error'>{api.error ?? ''}</Text>
      <Button title='noop' onPress={() => {}} />
    </>
  );
}

function mount(factory?: (id: never) => Wallet) {
  return render(
    <WalletProvider factory={factory as never}>
      <Probe />
    </WalletProvider>,
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('connecting', () => {
  it('takes the address the wallet named, and can sign with it', async () => {
    mount(() => mockWallet());
    await act(async () => {
      await api.connect('xverse');
    });
    expect(screen.getByTestId('address')).toHaveTextContent(ADDRESS);
    expect(screen.getByTestId('can-sign')).toHaveTextContent('true');
  });

  it('hands a call to the wallet that was connected', async () => {
    const calls: ContractCallRequest[] = [];
    mount(() => mockWallet({ calls }));
    await act(async () => {
      await api.connect('xverse');
    });
    await act(async () => {
      await api.callContract(CALL);
    });
    expect(calls).toEqual([CALL]);
  });

  it('reports a wallet that broke, and stays disconnected', async () => {
    mount(() => mockWallet({ failWith: new Error('relay unreachable') }));
    await act(async () => {
      await api.connect('xverse');
    });
    expect(screen.getByTestId('error')).toHaveTextContent('relay unreachable');
    expect(screen.getByTestId('address')).toHaveTextContent('none');
    expect(screen.getByTestId('can-sign')).toHaveTextContent('false');
  });

  it('says nothing at all when somebody pressed reject', async () => {
    mount(() => mockWallet({ failWith: new WalletCancelled() }));
    await act(async () => {
      await api.connect('xverse');
    });
    // A rejection is a decision, not a fault. Reporting it as one leaves an
    // error on screen that the person meant to cause.
    expect(screen.getByTestId('error')).toHaveTextContent('');
    expect(screen.getByTestId('address')).toHaveTextContent('none');
  });

  it('treats a wallet’s own rejection wording as a cancellation too', async () => {
    mount(() => mockWallet({ failWith: new Error('User rejected the request') }));
    await act(async () => {
      await api.connect('xverse');
    });
    expect(screen.getByTestId('error')).toHaveTextContent('');
  });
});

describe('watching', () => {
  it('shows an address with no wallet behind it, and will not sign', async () => {
    mount(() => mockWallet());
    await act(async () => {
      await api.watch(OTHER);
    });
    expect(screen.getByTestId('address')).toHaveTextContent(OTHER);
    expect(screen.getByTestId('can-sign')).toHaveTextContent('false');
  });

  it('refuses to sign rather than failing silently', async () => {
    mount(() => mockWallet());
    await act(async () => {
      await api.watch(OTHER);
    });
    await expect(api.callContract(CALL)).rejects.toThrow(/No wallet is connected/);
  });

  it('normalises what was typed, since an address is upper case', async () => {
    mount(() => mockWallet());
    await act(async () => {
      await api.watch('  sp206y7br5nfcr517vgvx04bsgna5425gm6dmf9h ');
    });
    expect(screen.getByTestId('address')).toHaveTextContent(OTHER);
  });
});

describe('what survives a restart', () => {
  it('remembers the address', async () => {
    mount(() => mockWallet());
    await act(async () => {
      await api.watch(OTHER);
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('signer-guide:address:v1')).toBe(OTHER),
    );
  });

  it('comes back read-only, because a session is not restored silently', async () => {
    await AsyncStorage.setItem('signer-guide:address:v1', OTHER);
    mount(() => mockWallet());
    await waitFor(() =>
      expect(screen.getByTestId('address')).toHaveTextContent(OTHER),
    );
    // The pairing behind it is gone, whatever the address says.
    expect(screen.getByTestId('can-sign')).toHaveTextContent('false');
  });

  it('forgets it when the wallet is disconnected', async () => {
    mount(() => mockWallet());
    await act(async () => {
      await api.connect('xverse');
    });
    await act(async () => {
      await api.disconnect();
    });
    expect(screen.getByTestId('address')).toHaveTextContent('none');
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('signer-guide:address:v1')).toBeNull(),
    );
  });
});
