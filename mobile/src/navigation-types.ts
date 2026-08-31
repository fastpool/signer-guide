import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * Every screen, and what it needs to be opened.
 *
 * One list for both tabs. The pool and contract screens are reached from the
 * stake flow and from the browse-everything tab alike, and registering them
 * once means a pool opened from either place is the same screen with the same
 * history.
 */
export type RootStackParamList = {
  /** First launch only: what this is, in three sentences and a number. */
  Welcome: undefined;
  Home: undefined;
  /** Staking with every choice already made but the amount. */
  Start: undefined;
  /** The contracts, most-used first — the first choice a new staker makes. */
  ChooseContract: undefined;
  /** One contract: what it does, and the pools running it. */
  Contract: { profileId: string; choosing?: boolean };
  /** One pool. */
  Pool: { contractId: string };
  /** The stake form. `contractId` is the pool being staked with. */
  Stake: { contractId: string };
  /** After a broadcast. */
  Sent: { txid: string; contractId: string; kind: 'stake' | 'unstake' };
  /**
   * Connecting a wallet, or watching an address.
   *
   * `contractId` is what the person was doing when they asked for one. It is
   * only used to decide which page of the guide the wallet's browser opens on:
   * somebody two taps into choosing a pool should not be handed a list of
   * forty-five and asked to start again.
   */
  Wallet: { contractId?: string } | undefined;
  /** Appearance, language, and which address the app is looking at. */
  Preferences: undefined;
  /** Everything else: the full pool list, the payout history, the data. */
  Pools: undefined;
  /** Who is behind the signer set, largest share of the vote first. */
  Groups: undefined;
  /** One entity, and every signer node behind it. */
  Group: { groupId: string };
  History: undefined;
  DataStatus: undefined;
};

export type ScreenProps<Name extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, Name>;
