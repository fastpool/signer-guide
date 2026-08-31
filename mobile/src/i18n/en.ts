/**
 * English — the source of truth for the phone app's own copy.
 *
 * Kept here rather than in `src/locales` with the web guide's catalogue, and
 * that is a deliberate cost: the guide ships its bundle to every reader on
 * every page load, and two hundred strings only a phone renders would be paid
 * for by everybody. What *is* shared is everything both apps say — amounts,
 * durations, the contract profiles — which the screens reach through
 * `@guide/lib/amounts` and `@guide/lib/profile-i18n` by passing the locale.
 *
 * Every other language file is typed against `Messages`, so a key added here
 * and forgotten there is a build error rather than a sentence that quietly
 * shows up in the wrong language.
 *
 * Placeholders are `{name}`.
 */

const messages = {
  // --------------------------------------------------------------- common --
  'common.open': 'Open',
  'common.change': 'Change',
  'common.details': 'Details',
  'common.copy': 'Copy',
  'common.tryAgain': 'Try again',
  'common.forget': 'Forget',
  'common.max': 'Max',
  'common.done': 'Done',
  'common.notKnown': 'not known',
  'common.cycle': 'cycle {cycle}',

  // ----------------------------------------------------------------- home --
  'home.title': 'Signer Guide',
  'home.tagline': 'Where your STX is staked, and what it earns.',
  'home.loadingPosition': 'Reading your position from the chain',
  'home.chainError': 'The chain would not answer',
  'home.preferences': 'Preferences',

  'home.connect.label': 'Your stake',
  'home.connect.hint': 'Connect a wallet, or watch an address',
  'home.connect.button': 'Connect a wallet',

  'home.notStaking.label': 'Your stake',
  'home.notStaking.title': 'Nothing staked yet',
  'home.notStaking.body':
    'Staking locks your STX where it already is — in your own wallet — and puts its weight behind a signer, which is what earns the bitcoin. Started this way, the pool and the settings are already chosen and shown to you; choosing them yourself is the line underneath.',
  'home.notStaking.start': 'Start staking',
  'home.notStaking.chooseYourself': 'Choose a contract and pool yourself',

  'home.more.title': 'The rest of the guide',
  'home.more.contracts': 'Signer contracts',
  'home.more.contractsHint': 'The contracts the pools run, in plain language',
  'home.more.pools': 'Every pool',
  'home.more.poolsHint': 'All {count}, with what each holds',
  'home.more.history': 'What each payout paid',
  'home.more.historyHint': 'Cycle by cycle, sats per 1,000 STX',
  'home.more.groups': 'Who holds the vote',
  'home.more.groupsHint': 'The entities behind the signer keys, largest first',
  'home.more.data': 'Where these numbers come from',
  'home.more.dataUpdated': 'Updated {when}',
  'home.more.dataStale': 'Showing a saved copy — the branch did not answer',

  // ----------------------------------------------------------------- rate --
  'rate.label': 'Earning now',
  'rate.cycle': 'CYCLE {cycle}',
  'rate.sats': 'sats',
  'rate.unit': 'per 1,000 STX, each payout',
  'rate.apy': 'A year',
  'rate.next': 'Next payout',
  'rate.nextIn': 'in {duration}',
  'rate.last': 'Last paid',
  'rate.historyLink': 'What each payout paid →',
  'rate.unreadable': 'The published figure could not be read this time.',

  // ------------------------------------------------------------- position --
  'position.label': 'Your stake',
  'position.active': 'staking',
  'position.account': 'My stake',
  'position.earnings':
    'Earning about {payout} a payout — roughly {year} a year at today’s rate.',
  'position.earningsUnknown':
    'What this earns cannot be worked out without the published rate.',
  'position.stakedWith': 'Staked with',
  'position.contractNamed': '{name} contract',
  'position.unreviewed': 'Contract not reviewed here',
  'position.lockedUntil': 'Locked until',
  'position.alreadyUnlocked': 'already unlocked',
  'position.endsThisCycle': 'ends when this cycle does',
  'position.moreCycles': '{count} more, about {duration}',
  'position.rewardsGoTo': 'Rewards go to',
  'position.sbtc': 'This wallet, in sBTC',
  'position.sbtcHint': 'No Bitcoin address on file, so they arrive as sBTC on Stacks.',
  'position.btcTo': '{address}, in BTC',
  'position.btcHint': 'Withdrawn to Bitcoin, with up to {fee} of each payout going on the transaction fee.',
  'position.payoutUnknown': 'The pool would not say where it sends them.',
  'position.change': 'Add, extend or move',

  // --------------------------------------------------------------- wallet --
  'wallet.title': 'Your wallet',
  'wallet.intro':
    'Your wallet lives in its own app. Pick the one you use and it will open, ask if this is alright, and bring you back here. Connecting signs nothing and moves nothing.',
  'wallet.connected': 'Connected',
  'wallet.watching': 'Watching',
  'wallet.readOnly':
    'Read-only. This address was typed in, not connected, so nothing here can be signed for it.',
  'wallet.canSign': 'Connected through {wallet}. Signing happens there.',
  'wallet.copyLink': 'Copy a connection link',
  'wallet.testWallet': 'Test wallet',
  'wallet.connectBody':
    'WalletConnect is the last resort here, and it is honest about why. Leather does not support it — the integration is an open request on its own tracker. Xverse gets as far as its lock screen and no further has been confirmed. So what is offered is the pairing link itself, which works in whatever wallet you actually have.',
  'wallet.connectHeading': 'Connect a wallet',
  'wallet.connecting': 'Waiting for your wallet',
  'wallet.linkCopied': 'Connection link copied. Paste it into your wallet — any wallet that takes a WalletConnect link will do.',
  'wallet.stopWaiting': 'Stop waiting',
  'wallet.browserHeading': 'Open the guide in your wallet',
  'wallet.browserBody':
    'Leather and Xverse each have a browser of their own, and a page opened inside one can talk to the wallet directly. This is how Leather is reached — it does not do WalletConnect at all.',
  'wallet.openIn': 'Open in {wallet}',
  'wallet.browserReturn':
    'The guide opens there with the whole staking flow. Come back here afterwards and watch your address to see the result.',
  'wallet.watchHeading': 'Watch an address',
  'wallet.watchBody':
    'See what any address has staked and what it earns, without connecting anything. A BNS name works too — it is resolved against the registry, not an indexer. Read-only: it cannot stake or change a stake.',
  'wallet.addressLabel': 'Stacks address or BNS name',
  'wallet.addressPlaceholder': 'SP… or name.btc',
  'wallet.nameUnregistered': 'Nobody owns {name}.',
  'wallet.nameLookupFailed':
    'The node would not answer, so the name could not be looked up. That is not the same as it being unregistered.',
  'wallet.watchSubmit': 'Watch this address',
  'wallet.keys':
    'Your wallet builds, signs and broadcasts every transaction. This app never sees a key, and never asks for one.',
  'wallet.notInstalled':
    'If nothing opens, the wallet is probably not installed on this phone.',

  // ---------------------------------------------------------- preferences --
  'prefs.title': 'Preferences',
  'prefs.appearance': 'Appearance',
  'prefs.appearance.light': 'Light',
  'prefs.appearance.dark': 'Dark',
  'prefs.appearance.system': 'System',
  'prefs.appearance.hint':
    'System follows the phone, which already knows whether it is being held in the sun.',
  'prefs.language': 'Language',
  'prefs.language.hint':
    'The contract descriptions are translated too, where a translation exists.',
  'prefs.wallet': 'Wallet',
  'prefs.wallet.nothing': 'Status',
  'prefs.wallet.none': 'Nothing connected',
  'prefs.wallet.manage': 'Connect or watch an address',
  'prefs.about': 'About',
  'prefs.about.data': 'Where these numbers come from',
  'prefs.about.source': 'Read the source',
  'prefs.version': 'Version {version}',

  // ------------------------------------------------------------- onboarding --
  'welcome.eyebrow': 'SIGNER GUIDE',
  'welcome.headline': 'Lock STX.\nEarn bitcoin.',
  'welcome.earning': 'Stakers are earning',
  'welcome.aYear': 'a year',
  'welcome.rateNote':
    'Paid in bitcoin, every week, at the rate the last payouts actually paid. It moves — this is what it is now, not a promise.',
  'welcome.step1.title': 'Your STX stays yours',
  'welcome.step1.body':
    'It is locked in your wallet, not sent anywhere. Nobody can move it, spend it or lend it out.',
  'welcome.step2.title': 'A pool signs on your behalf',
  'welcome.step2.body':
    'Signing is what earns the bitcoin, and your STX gives a pool more signing power. You can change the signer you back every two weeks.',
  'welcome.step3.title': 'You can stop',
  'welcome.step3.body':
    'Locked STX earns until the end of the period you chose. You can also stop early, without penalty — the lock ends at the close of the cycle.',
  'welcome.start': 'Start staking',
  'welcome.skip': 'Just show me the guide',
  'welcome.wallets':
    'You will need Leather, Xverse or OKX on this phone. Signing happens there — this app never sees a key.',

  // ------------------------------------------------------------------ start --
  'start.title': 'Start staking',
  'start.intro':
    'Everything below is already set. Change any of it, or just say how much.',
  'start.noPool':
    'No pool in this copy of the data is registered and open to everyone, so there is nothing to offer. The full list is under “Every pool”.',
  'start.alreadyStaking': 'You are already staking',
  'start.alreadyStakingBody':
    'Adding to it, extending it or moving it is the same form, opened on the pool you are with.',
  'start.changeStake': 'Change your stake',
  'start.step1': 'Step 1 of 2 · your wallet',
  'start.step2': 'Step 2 of 2 · how much',
  'start.connectHeading': 'Connect a wallet',
  'start.amountLabel': 'Amount to stake',
  'start.balance': '{amount} free to lock',
  'start.balanceLoading': 'Reading your balance…',
  'start.balanceUnknown': 'Your balance could not be read from the node.',
  'start.earnings':
    'At today’s rate that earns about {payout} a week, {year} a year.',
  'start.reason':
    'This is Fast Pool’s own pool, and Fast Pool made this app — so it is a preference, not a verdict. What can be checked: it runs the {contract} contract, so it {fee}, and it takes a stake from anyone. Tap Change to see the other {count}.',
  'start.reasonFallback':
    'Chosen by rule, because the pool this app usually offers is not taking stakes right now: a contract that has been read, open to anyone, and the lowest fee of the {count} that qualify.',
  'start.reasonNoFee': 'charges no fee',
  'start.reasonLowestFee': 'caps its fee at 5% and has to announce a rise a month ahead, charging {percent}% today',
  'start.projectionLabel': 'At today’s rate',
  'start.setForYou': 'Set for you',
  'start.noFee': 'no fee',
  'start.fee': '{percent}% fee',
  'start.poolMeta': '{fee} · {contract} contract',
  'start.rewards': 'Rewards',
  'start.rewardsValue': 'Distributed as sBTC',
  'start.rewardsHint':
    'They arrive as sBTC in this same wallet. No address to type, nothing to mistype.',
  'start.period': 'Locked for',
  'start.periodHint':
    'One cycle of earning. Extend it any time, or stop before then without penalty.',
  'start.fullForm': 'Set these myself instead',
  'start.loading': 'Reading the chain',
  'start.submit': 'Sign and stake',
  'start.failed': 'It did not go through',

  // ------------------------------------------------------------------ stake --
  'stake.stakeWith': 'Stake with',
  'stake.changeWith': 'Change your stake with',
  'stake.moveTo': 'Move to',
  'stake.moving':
    'You are staked with another pool. This moves the whole position across in one transaction — nothing is unlocked in between.',
  'stake.loading': 'Reading your position',
  'stake.amountAdd': 'Add to your stake',
  'stake.amountFirst': 'Amount to stake',
  'stake.extend': 'Extend the lock',
  'stake.extendNone': 'no longer',
  'stake.extendBy': '+{count}',
  'stake.remaining': '{count} left after this one.',
  'stake.remainingFloor':
    ' pox-5 will not update a position with nothing left, so {min} is the least it takes.',
  'stake.remainingUnknown': 'How much of the lock is left could not be read.',
  'stake.lockFor': 'Lock for',
  'stake.cycles': '{count} cycles',
  'stake.cycle': '{count} cycle',
  'stake.lockHint':
    'About {duration} of earning. You can stop before then without penalty — see “Ending it”, once there is a stake to end.',
  'stake.rewards': 'Rewards',
  'stake.rewardsBtc': 'Withdrawn to a Bitcoin address',
  'stake.rewardsSbtc': 'As sBTC, in this wallet',
  'stake.btcAddress': 'Bitcoin address',
  'stake.btcAddressHint':
    'Your share is withdrawn from sBTC and arrives here, on Bitcoin itself. The signer contract stores this address on chain — check it, because a payout sent to the wrong address cannot be recovered.',
  'stake.maxFee': 'Most of the payout that may go on the Bitcoin fee',
  'stake.minClaim': 'Smallest payout worth sending',
  'stake.maxFeeShort': 'Most fee per payout',
  'stake.minClaimShort': 'Smallest payout',
  'stake.feeNote':
    'The fee comes out of the payout, and the sBTC signers will not send one with a fee under 1,000 sats. The smallest payout has to clear {floor} sats — the fee plus the dust limit — and {lowest} sats is the lowest the contract takes. Anything under that is not sent; it waits for the next payout.',
  'stake.problem.maxFeeFloor':
    'The sBTC signers will not send a payout with a fee under 1,000 sats.',
  'stake.endingPill': 'Ending it — unstake',
  'stake.noMinClaim': 'This contract takes no floor on a payout — it uses its own.',
  'stake.sbtcNote':
    'Rewards arrive as sBTC in this same wallet. No Bitcoin address is written on chain, so there is nothing to mistype and nothing to keep current.',
  'stake.projection': 'At today’s rate, this would earn',
  'stake.projectionPayout': 'Each payout',
  'stake.projectionYear': 'A year',
  'stake.projectionNote':
    'An estimate from the current rate, not a promise. What a payout pays depends on what pox-5 earns and how much STX is staked against it.',
  'stake.submitChange': 'Sign the change',
  'stake.submitFirst': 'Sign and stake',
  'stake.keys':
    'Your wallet builds, signs and broadcasts this. This app never sees a key.',
  'stake.endingTitle': 'Ending it',
  'stake.endingBody':
    'Unstaking sets the position to end when this cycle does — whatever period you locked for, and with no penalty for stopping early. It unlocks nothing today and moves no STX.',
  'stake.unstake': 'Unstake',
  'stake.failed': 'It did not go through',

  // stake form problems
  'stake.problem.connect': 'Connect a wallet before staking.',
  'stake.problem.watching':
    'This address is being watched, not connected. Connect a wallet to stake.',
  'stake.problem.notAnAmount': 'That is not an amount of STX. Six decimals at most.',
  'stake.problem.enterAmount': 'Enter how much to stake.',
  'stake.problem.tooMuch': 'More than the {amount} that is free to lock.',
  'stake.problem.cycles': 'A lock is between 1 and {max} cycles.',
  'stake.problem.btcAddress': 'That does not look like a Bitcoin address.',
  'stake.problem.maxFee':
    'The most the payout may spend on fees has to be a number of sats.',
  'stake.problem.minClaim':
    'The smallest payout worth sending has to be over {floor} sats.',
  'stake.problem.nothingToChange':
    'Nothing to change — add STX, extend the lock, or move to another pool.',
  'stake.problem.preparePhase':
    'pox-5 refuses changes during the prepare phase. Try again once the cycle turns.',
  'stake.problem.refused': 'pox-5 would refuse this: {reason}',

  // ------------------------------------------------------------------- sent --
  'sent.stake': 'Stake sent',
  'sent.unstake': 'Unstake sent',
  'sent.pending': 'waiting for the chain',
  'sent.confirmed': 'confirmed',
  'sent.failed': 'did not go through',
  'sent.headlinePending': 'Broadcast — waiting for a block',
  'sent.headlineStaked': 'Staked with {pool}',
  'sent.headlineUnstaked': 'Your stake ends with this cycle',
  'sent.headlineFailed': 'The chain refused it',
  'sent.watching': 'Watching the transaction',
  'sent.notePending':
    'A Stacks block takes a few minutes. You can leave this screen; the transaction carries on either way.',
  'sent.noteFailed':
    'Nothing was locked. The fee was spent — the explorer says why it was rejected.',
  'sent.noteConfirmed': 'Rewards begin from the next cycle the position is in.',
  'sent.transaction': 'Transaction',
  'sent.copyId': 'Copy id',
  'sent.explorer': 'Open explorer',
  'sent.backHome': 'Back to your stake',

  // -------------------------------------------------------------- contracts --
  'contracts.title': 'Choose a contract',
  'contracts.intro':
    'Every pool runs one of these. It is the code that decides how your rewards are worked out and paid — whether they can go to a Bitcoin address at all, and what the pool may take. Pick the rules first, then the pool.',
  'contracts.poolCount': '{count} pools',
  'contracts.poolCountOne': '{count} pool',
  'contracts.staked': '{amount} staked',

  'contract.missing': 'That contract is not in this copy of the data.',
  'contract.runBy': '{count} pools run this code',
  'contract.runByOne': '{count} pool runs this code',
  'contract.identiconOutliers':
    '{count} of these pools show a different icon. They run the same code — the icon is drawn from the source including its comments, and a pool that stripped them gets a different one.',
  'contract.choosePool': 'Choose a pool',
  'contract.poolsRunning': 'Pools running this contract',
  'contract.chooseIntro':
    'All of these run the contract above, so rewards are worked out and paid the same way. What differs is the fee each takes, the size, and who runs it.',
  'contract.noPool': 'No pool to join',
  'contract.noPoolBody':
    'None of the pools running this contract is registered and open.',
  'contract.hidden':
    '{count} more run this contract but are not registered or not open to everyone, so they are left out of this list.',
  'contract.hiddenOne':
    '{count} more runs this contract but is not registered or not open to everyone, so it is left out of this list.',

  // ------------------------------------------------------------------ pool --
  'pool.missing': 'This pool is not in this copy of the data.',
  'pool.guessedName':
    'A name worked out from the contract id, not one the pool gave.',
  'pool.stakedCycle': 'Staked, cycle {cycle}',
  'pool.nextCycle': 'Next cycle {cycle}',
  'pool.fee': 'Fee',
  'pool.stakeWith': 'Stake with {pool}',
  'pool.stakeGeneric': 'Stake with this pool',
  'pool.notOpen':
    'This pool does not take a stake from just anyone, so the app does not offer to send it one.',
  'pool.notRegistered':
    'This pool is not registered for the current cycle, so a stake would be refused.',
  'pool.contractSection': 'The contract it runs',
  'pool.readIt': 'Read it',
  'pool.unreviewed':
    'This contract has not been reviewed here. It is not shown with badges it has not earned — how it works rewards out and pays them is unread.',
  'pool.identity': 'Identity',
  'pool.contractId': 'Contract',
  'pool.signerKey': 'Signer key',
  'pool.noSignerKey': 'none on file',
  'pool.registered': 'registered',
  'pool.notRegisteredPill': 'not registered',
  'pool.firstSeen': 'first seen in cycle {cycle}',
  'pool.match': 'match: {match}',
  'pool.undistributed': 'Undistributed',
  'pool.unclaimed': 'Unclaimed from pox-5',
  'pool.unclaimedAsOf': 'as of cycle {cycle}',

  // --------------------------------------------------------------- conduct --
  'conduct.title': 'Answering the miners',
  'conduct.intro':
    'Weight is what a signer is owed a say over; this is whether it turns up. Every block a miner proposes goes to every seated signer, which accepts it, refuses it, or says nothing. Refusing is the job. Missing it is not.',
  'conduct.none':
    'Nothing on file for this key. A signer that has never held a seat has never been asked to answer anything.',
  'conduct.loading': 'Reading this signer’s record…',
  'conduct.failed': 'That would not load. It is one file; the rest of this screen is unaffected.',
  'conduct.answered': 'Answered',
  'conduct.answeredNote': 'It answered {answered} of {proposals} proposals — {label}.',
  'conduct.cycleOpen': 'cycle {cycle}, still running',
  'conduct.cycleClosed': 'cycle {cycle}',
  'conduct.neverAnswered': 'Never answered',
  'conduct.neverAnsweredNote':
    'Asked about {proposals} blocks in cycle {cycle} and has not responded to one. Nothing has ever been heard from this key.',
  'conduct.oldKeyNote':
    'This is the key the pool rotated away from — the one that holds this cycle’s seat. The new key holds nothing until the next set is worked out.',
  'conduct.response': 'Time to answer',
  'conduct.seconds': '{seconds} s',
  'conduct.agreed': 'Accepted',
  'conduct.unknown': 'not known',
  'conduct.history': 'Earlier cycles',
  'conduct.soFar': 'so far',
  'conduct.source':
    'Counted by Hiro’s signer-metrics API, which watched the proposals go out and the answers come back.',
  'conduct.rotated':
    'Changed its signer key on {when}, during cycle {cycle}. The key it replaced keeps the seat until the next set is worked out.',

  // ----------------------------------------------------------------- pools --
  'pools.title': 'Every pool',
  'pools.subtitle': '{count} signer contracts on pox-5, most staked first.',
  'pools.search': 'Search by name or contract',
  'pools.noMatch': 'Nothing matches “{query}”.',
  'pools.stakedPill': '{amount} staked',
  'pools.feePill': '{percent}% fee',
  'pools.feeUnknown': 'fee unknown',
  'pools.notRegistered': 'not registered',
  'pools.notOpen': 'not open to all',
  'pools.keepsAlmostAll': 'keeps almost every reward',
  'pools.steepFilter': 'Fee of 95% or more ({count})',
  'pools.steepHelp':
    'These pools keep almost every reward they earn for you, and nothing in their contracts stops it. Tap again to show every pool.',

  // --------------------------------------------------------------- groups --
  'groups.title': 'Who holds the vote',
  'groups.one': 'Signer group',
  'groups.intro':
    'A signer node is one key. A group is a set of them with one entity behind it — which is what decides who could move the signer set, and what the chain never shows you.',
  'groups.asOf': 'Shares are of cycle {cycle}.',
  'groups.counts': '{nodes} nodes · {contracts} contracts · {staked} staked',
  'groups.unknown': 'not known',
  'groups.missing': 'No such group. It may have been renamed.',
  'groups.kind.operator': 'Runs these nodes',
  'groups.kind.stake': 'Supplies the stake',
  'groups.kindNote.operator':
    'One entity runs every node below, so it signs with all of them. Its weight is everything staked with them.',
  'groups.kindNote.stake':
    'The nodes below are run by other people. What this entity controls is the STX behind the contracts listed — it can move that stake, but it does not hold the keys that sign with it.',
  'groups.ungrouped': 'Not grouped',
  'groups.ungroupedNote':
    'Signers nobody here has grouped. A gap in this file, not a finding that they are unrelated to one another — and counted by contract, so a contract here may sit on a key one of the groups above does claim.',
  'groups.ungroupedCounts': '{contracts} contracts · {staked} staked',
  'groups.votingPower': 'Voting power, cycle {cycle}',
  'groups.staked': 'Staked across the group',
  'groups.nodeCount': 'Signer nodes',
  'groups.contractCount': 'Signer contracts',
  'groups.whatIsIn': 'What is in the group',
  'groups.wholeNode': 'Every contract on this key',
  'groups.contractOnly':
    'This contract only — the rest of what this node holds is not part of the group.',
  'groups.nodeAnswered': 'Answered {percent}% of the blocks it was asked about in cycle {cycle}.',
  'groups.nodeSilent': 'Has not answered a single block in cycle {cycle}.',
  'groups.alsoIn': 'Also counted in {names}',
  'groups.source': 'What this is based on',
  'groups.sourceNote':
    'Nothing on chain says who runs a signer node, so every group here was written down by hand. A node can be in two groups at once, so these shares do not add to a hundred and are not meant to.',
  'groups.partOf': 'Who is behind this pool',

  // --------------------------------------------------------------- history --
  'history.title': 'What each payout paid',
  'history.intro':
    'pox-5 works rewards out every 1,050 burn blocks — half a reward cycle, about a week — so each reward cycle below holds two payouts.',
  'history.estimatedNow': 'Estimated now, cycle {cycle}',
  'history.blended': 'Blended estimate',
  'history.blendedUnit': 'sats blended',
  'history.projected': 'This payout so far',
  'history.projectedHint': 'extrapolated; noisy early on',
  'history.lastPayout': 'Cycle {cycle} payout',
  'history.lastPayoutGeneric': 'Last payout',
  'history.lastPayoutHint': 'what pox-5 actually paid',
  'history.read': 'Read {when}. All figures are per 1,000 STX.',
  'history.every': 'Every payout on record',
  'history.loading': 'Fetching the record',
  'history.missing': 'Nothing on file yet — the refresh has not written this.',
  'history.failed': 'The record could not be fetched.',
  'history.cycle': 'Cycle {cycle}',
  'history.stillPaying': 'still paying',
  'history.firstHalf': 'first half',
  'history.secondHalf': 'second half',
  'history.burn': 'burn {height}',
  'history.notWorkedOut': 'not worked out',

  // ------------------------------------------------------------------ data --
  'data.title': 'Where these numbers come from',
  'data.intro':
    'The pool data is generated hourly by scripts in the guide’s repository and committed to its branch. This app reads that branch, and reads the chain directly for anything about you.',
  'data.poolData': 'Pool data',
  'data.origin.bundled': 'what shipped in this build',
  'data.origin.cache': 'the last copy this phone downloaded',
  'data.origin.network': 'the published branch, just now',
  'data.generated': 'Generated',
  'data.downloaded': 'Downloaded',
  'data.stale':
    'The branch did not answer this time, so what is shown is a saved copy.',
  'data.refresh': 'Fetch again',
  'data.howRate': 'How the rate is worked out',
  'data.howRateBody':
    'pox-5 pays every {blocks} burn blocks. The published figure weights what this payout has accrued so far against what the last completed payout actually paid — early on the accrual is noisy, so the fact carries more of it.',
  'data.totalStaked': 'Staked against pox-5',
  'data.stxPrice': 'STX price',
  'data.burnHeight': 'Burn height',
  'data.talksTo': 'What this app talks to',
  'data.stacksNode': 'Stacks node',
  'data.wallets': 'Wallets',
  'data.walletsMock': 'A test wallet is switched on in this build',
  'data.walletsReal': 'WalletConnect, to Leather, Xverse and OKX',
  'data.walletsNone': 'No wallet route is configured',
  'data.walletsMockHint': 'Nothing is signed. This build cannot move anybody’s STX.',
  'data.walletsRealHint':
    'Your wallet builds, signs and broadcasts. This app never sees a key.',
  'data.openWeb': 'Open the guide on the web',
  'data.madeBy':
    'Made by Fast Pool, which runs some of the pools listed here. They are described by the same detectors and ranked by the same size as everyone else’s — that is what all of this being public is for.',

  // -------------------------------------------------------------- features --
  'feature.bitcoinYes': 'Pays rewards to a Bitcoin address, instead of as sBTC on Stacks',
  'feature.bitcoinViaPool':
    'Records a Bitcoin address but pays as sBTC — bitcoin, if it comes, is sent by the pool',
  'feature.bitcoinNo': 'Pays as sBTC on Stacks — it cannot pay out to Bitcoin',
  'feature.openYes': 'Open to anyone',
  'feature.openNo': 'The pool decides who may join',
  'feature.feeCapped': 'Fee capped at {percent}% by the contract',
  'feature.feeUncapped': 'No cap on the fee in the code',
  'feature.feeNotice': 'A fee rise has to be announced in advance',
  'feature.feeExemption': 'Some stakers can be exempted from the fee',

  // -------------------------------------------------------------- identicon --
  'identicon.label': 'The icon of this contract’s code',
  'identicon.new': 'New code, not standardised yet',
} as const;

/**
 * The keys are literal; the values are plain strings.
 *
 * `as const` above is what makes the key set exact, and it would also make
 * every *value* a literal type — so `ko.ts` would have to repeat the English
 * sentence to typecheck. Mapping the values back to `string` keeps the half
 * that is worth having: a key missing from a translation is still a build
 * error, and a translation is still allowed to be in another language.
 */
export type Messages = { [K in keyof typeof messages]: string };
export type MessageKey = keyof Messages;

export const en: MobileBundle = {
  /** The language's own name for itself — never translated. */
  name: 'English',
  messages,
};

export type MobileBundle = {
  name: string;
  messages: Messages;
};
