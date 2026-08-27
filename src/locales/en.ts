/**
 * English — the source of truth for the message catalogue.
 *
 * Every other language file is typed against `Messages`, so a key added here
 * and forgotten there is a build error rather than a sentence that quietly
 * shows up in the wrong language.
 *
 * Keys are flat and dotted. Placeholders are `{name}`; `t()` fills them with
 * text and `t.rich()` fills them with elements, so a sentence with a link or a
 * bold number in the middle of it still lives here as one sentence rather than
 * being cut into fragments in the JSX.
 */

/** A profile's copy, when a language has its own. English lives in profiles.json. */
export type ProfileTranslation = {
  name?: string;
  summary: string;
  detail: string;
};

/**
 * How a language says large STX amounts.
 *
 * English groups by millions; Korean by 만 (ten thousand) and 억 (hundred
 * million). Keeping this per language means `stxLabel` has no idea which
 * language it is formatting for, and a new one only touches its own file.
 */
export type AmountScaleStep = {
  /** Smallest amount in STX this step applies to. */
  min: number;
  /** What to divide by to get the number that is spoken. */
  divisor: number;
  /** Show one decimal below this, round above it. */
  decimalBelow: number;
  /** Template for the result; `{value}` is the divided number. */
  unit: string;
};

const messages = {
  'meta.title': 'Signer Guide - who can you stake your STX with?',
  'meta.description':
    'A plain-language guide to the Stacks signer pools you can stake your STX with.',
  'meta.ogTitle': 'Signer Guide - who can you stake your STX with?',
  'meta.ogDescription':
    "A plain-language guide to the Stacks signer pools you can stake your STX with. Fees, ceilings and who may join, read from each contract's own code.",

  'app.heading': 'Where can you stake your STX?',
  'app.intro':
    'When you stake, you pick a pool to look after it for you. There are {pools} to choose from today, but between them they run only {contracts} — so there is less to learn than it looks.',
  'app.introPools': '{count} pools',
  'app.introContracts': '{count} signer contracts',
  'app.staked':
    'Between them they are looking after {amount} for cycle {cycle}.',
  'app.stakedNext':
    'Cycle {cycle} is still filling: {amount} committed to them so far.',
  'app.contractsHeading': 'The signer contracts',
  'app.contractsIntro':
    'Each one behaves differently. Tap a contract to see what it does and who runs it.',
  'app.poolCount.one': '{count} pool',
  'app.poolCount.other': '{count} pools',
  'app.lastUpdate': 'Last update: {at}',
  'app.refreshNote':
    'Fees and amounts are read from the chain again every hour.',
  'app.savedCopy':
    'This is the last copy saved on your device — the newest could not be fetched.',
  'app.updateReady': 'A new version of the app is ready.',
  'app.updateApply': 'Reload',
  'app.newsletter': 'Sign up for our newsletter',
  'app.stxOnlyEstimate.title':
    'Estimated next-cycle rewards for STX-only stakers',
  'app.stxOnlyEstimate.intro':
    'Estimate from the sBTC that has reached pox-5 since the last payout: minus bond-holder share, minus the foundation share (15%), projected to a 1050-block distribution cycle, then divided by STX staked by non-bond pools. Not from the balance pox-5 holds — that also carries rewards already earned and waiting to be claimed. A few blocks of deposits make a rough projection, so this cycle counts for as much of the rate as it has run and the last payout — a figure pox-5 has already settled — covers the rest.',
  'app.stxOnlyEstimate.loading': 'Reading estimate from chain data…',
  'app.stxOnlyEstimate.unavailable':
    'Could not build this estimate right now. Try again in a moment.',
  'app.stxOnlyEstimate.accrued': 'sBTC received since the last payout',
  'app.stxOnlyEstimate.bondShare': 'Estimated bond-holder rewards share',
  'app.stxOnlyEstimate.foundationShare': 'Foundation share (15%)',
  'app.stxOnlyEstimate.stxOnlySoFar': 'Estimated STX-only rewards so far',
  'app.stxOnlyEstimate.progressLabel': 'Cycle progress',
  'app.stxOnlyEstimate.progress':
    'Projected from {now}/{total} blocks in this distribution cycle',
  'app.stxOnlyEstimate.projectedLabel': 'Projected full-cycle amount',
  'app.stxOnlyEstimate.projected': 'Projected full-cycle amount: {amount}',
  'app.stxOnlyEstimate.stxOnlyStaked': 'STX staked by STX-only holders',
  'app.stxOnlyEstimate.lastPayout': 'Last payout, as paid',
  'app.stxOnlyEstimate.lastPayoutInCycle':
    'Last payout, as paid (cycle {cycle})',
  'app.stxOnlyEstimate.projectedRate': 'This cycle so far, extrapolated',
  'app.stxOnlyEstimate.rate': 'Estimated reward rate',
  'app.stxOnlyEstimate.rateValue': '{sats} sats per 1000 STX',
  'app.stxOnlyEstimate.apy': 'Estimated APY (52 payouts/year)',
  'app.stxOnlyEstimate.apyValue': '{apy}',
  'app.stxOnlyEstimate.apyUnavailable': 'APY unavailable right now',
  'app.stxOnlyEstimate.stxPrice': 'STX price (CoinGecko)',
  'app.stxOnlyEstimate.priceValue': '{sats} sats',
  'app.stxOnlyEstimate.priceUnavailable': 'Price unavailable right now',
  'app.stxOnlyEstimate.untilPayoutAsOf':
    'Estimated payout in about {duration} ({blocks} blocks left as of {at}).',
  'app.stxOnlyEstimate.weeklyLead':
    'Like a weekly allowance, for every 1000 STX this cycle could add:',
  'app.stxOnlyEstimate.weeklyApy': 'APY: {apy}',
  'app.stxOnlyEstimate.weeklyProgress': 'Cycle progress',
  'app.stxOnlyEstimate.weeklyBlocksAsOf':
    '{blocks} blocks left ({duration}) as of {at}.',
  'app.stxOnlyEstimate.weeklyEstimateNote':
    'One estimate based on the latest cycle data.',
  'app.stxOnlyEstimate.homeSentence':
    'For the current cycle, the weekly rewards for STX-only stakers are around {rate} ({apy} APY). {link}',
  'app.stxOnlyEstimate.untilNextRewards': 'Until next rewards',
  'app.stxOnlyEstimate.untilNextDate':
    'Estimated in about {duration} (around {at}).',
  'app.stxOnlyEstimate.untilNextHeights':
    '{blocks} burn blocks left: {current} -> {next} (as of {asOf}).',
  'app.stxOnlyEstimate.asOfUnknown': 'latest update',
  'app.stxOnlyEstimate.durationHours.one': '{count} hour',
  'app.stxOnlyEstimate.durationHours.other': '{count} hours',
  'app.stxOnlyEstimate.durationDays.one': '{count} day',
  'app.stxOnlyEstimate.durationDays.other': '{count} days',
  'app.stxOnlyEstimate.openFull': 'View full calculation',
  'app.stxOnlyEstimate.openHistory': 'What every distribution has paid',
  'app.stxOnlyHistory.back': '← Back to the rewards estimate',
  'app.stxOnlyHistory.title': 'What every distribution has paid',
  'app.stxOnlyHistory.intro':
    'Rewards are computed twice a reward cycle, so each cycle is paid in two goes. These are the rates as paid, not estimates — each one is what pox-5 credited per 1000 STX staked.',
  'app.stxOnlyHistory.loading': 'Reading the payout history…',
  'app.stxOnlyHistory.none':
    'No distribution has been recorded yet. The first one appears here once a cycle has paid.',
  'app.stxOnlyHistory.failed':
    'The payout history could not be fetched. Try again in a moment.',
  'app.stxOnlyHistory.cycle': 'Cycle {cycle}',
  'app.stxOnlyHistory.cycleTotal': 'for the cycle',
  'app.stxOnlyHistory.stillPaying': 'still paying — one of two so far',
  'app.stxOnlyHistory.firstHalf': 'First half',
  'app.stxOnlyHistory.secondHalf': 'Second half',
  'app.stxOnlyHistory.atHeight': 'at burn height {height}',
  'app.stxOnlyHistory.rateUnknown': 'not known',
  'app.stxOnlyHistory.note':
    'A cycle’s total comes from what pox-5 has accrued for that cycle, not from adding the two halves — each half is rounded down to a whole sat on its own. A half reads as “not known” when no refresh ran between the two payouts, which is the only moment the first of them can be told from the pair.',
  'app.stxOnlyEstimate.back': '← All pools',
  'app.stxOnlyEstimate.note':
    'Estimate only. It depends on what has reached pox-5 since the last payout and on how far this distribution cycle has run, so it settles as the cycle goes on.',
  'app.stxOnlyEstimate.generatedAt': 'Generated at: {at}',
  'app.allPools': 'All pools',
  'app.whatMatters': 'What matters to you?',
  'app.showingAll': 'Showing all {total} pools',
  'app.showingSome': '{shown} of {total} pools match',
  'app.noMatch': 'No pool matches everything you picked. Try turning one off.',
  'app.footer.feesTitle': 'About the fees.',
  'app.footer.fees':
    'The fee shown is the one in force right now, read from the pool’s own contract. Most pools do not lock their fee in, so they can change it later. A few contracts do set a ceiling in code — those carry a {capped} badge, and that limit holds whatever the pool decides. Fewer still make a fee change wait before it applies, which gives you time to move — those carry a {notice} badge. Some pools have no fee in this contract at all, which does not always mean free, because the fee may be taken elsewhere.',
  'app.footer.feesCappedBadge': 'fee capped',
  'app.footer.feesNoticeBadge': 'fee changes announced',
  'app.footer.identity':
    'Every pool here is registered on Stacks and identified by what its code adds up to, not by its name — so two pools running the same signer contract are shown as such. Fees were read from each contract’s own storage on {at}, and the amounts staked are for cycle {cycle}.',
  'app.footer.trust':
    'Nothing here is taken on trust, and neither should this page be: {link} — every claim above comes from a line of Clarity you can check yourself.',
  'app.footer.trustLink': 'read the code on GitHub',
  'app.footer.madeBy':
    'Made by {link}, which runs some of the pools listed above. They are described by the same code as everyone else’s and ranked by size like everyone else’s — the reason all of this is public is so you do not have to take that on trust either.',

  'filter.bitcoin.label': 'Rewards in Bitcoin',
  'filter.bitcoin.help':
    'Pays your rewards to a Bitcoin address, instead of as sBTC on Stacks.',
  'filter.lowFee.label': 'Low fee (5% or less)',
  'filter.lowFee.help':
    'The fee the pool charges today is under 5%. Pools can change their fee later.',
  'filter.cappedFee.label': 'Fee capped at 20%',
  'filter.cappedFee.help':
    'The contract itself refuses to let the fee go above 20%, whatever the pool decides. Most contracts have no such limit.',
  'filter.feeNotice.label': 'Fee changes announced first',
  'filter.feeNotice.help':
    'A new fee cannot take effect the moment the pool decides on it — the contract makes it wait, so you have time to notice and move.',
  'filter.open.label': 'Anyone can join',
  'filter.open.help':
    'No invitation or membership needed — you can stake with this pool yourself.',

  'badge.anyoneCanJoin': 'Anyone can join',
  'badge.inviteOnly': 'Invite only',
  'badge.bitcoinRewards': 'Rewards in Bitcoin',
  'badge.sbtcRewards': 'Rewards in sBTC',
  'badge.fee': 'Fee: {fee}',
  'badge.feeCapped': 'Fee capped at {percent}%',
  'badge.feeNotice': 'Fee changes announced {notice} ahead',
  'badge.feeExemption': 'Some stakers pay no fee',

  'fee.notSet': 'Not set in this contract',
  'fee.none': 'No fee right now',
  'fee.current': '{percent}% right now',

  'notice.hour.one': 'about an hour',
  'notice.hour.other': 'about {count} hours',
  'notice.day.one': 'about a day',
  'notice.day.other': 'about {count} days',
  'notice.twoWeeks': 'about two weeks',
  'notice.month.one': 'about a month',
  'notice.month.other': 'about {count} months',

  'amount.unknown': 'amount not known',
  'amount.none': 'nothing staked yet',
  'amount.plain': '{value} STX',
  'amount.nothing': 'nothing',
  'amount.sats': '{value} sats',
  'amount.sbtc': '{value} sBTC',

  'signer.runsContract': 'Runs the {link}',
  'signer.contractLink': '{name} signer contract',
  'signer.notReviewed': "We have not reviewed this pool's code yet",
  'signer.stakedHere': 'staked here',
  'signer.showDetails': 'Show the details',
  'signer.hideDetails': 'Hide the details',
  'signer.customCalls': 'Signer uses custom contract calls.',
  'signer.contract': 'Contract',
  'signer.signerKey': 'Signer key',
  'signer.notAvailable': 'Not available',
  'signer.fingerprint': 'Code fingerprint',
  'signer.fingerprintNote': 'Pools sharing this fingerprint run the same code.',
  'signer.identicon': 'Code icon',
  'signer.identiconNote':
    'Drawn from the code, not from the address, so the same contract deployed twice shows the same icon here and in any other app that follows {link}.',

  'identicon.label': 'Icon of the code this pool runs',
  'identicon.newLabel': 'New code — no icon for it yet',
  'identicon.sip': 'the identicon standard',

  'name.confirmed': 'Name confirmed — this is what the pool is called',
  'name.fromContract':
    'Name read off the contract id, not confirmed by the pool',

  'contract.back': '← All signer contracts',
  'contract.heading': '{name} signer contract',
  'contract.poolsRunning.one': 'One pool runs this contract',
  'contract.poolsRunning.other': '{count} pools run this contract',
  'contract.sameCode':
    'They run the same code, so they behave the same way. What differs is who operates them and what they charge.',
  'contract.stakedTotal': ' Between them they are looking after {amount}.',
  'contract.howWeChecked': 'How we checked',
  'contract.fingerprint': 'Code fingerprint',
  'contract.fingerprintNote':
    'Every pool above hashes to this, which is how we know they run the same code.',
  'contract.identicon': 'Code icon',
  'contract.identiconNote':
    'The icon every pool above shows. It is drawn from the code itself, so an app that follows {link} draws the same one — and a pool claiming this contract while showing a different icon is not running it.',
  'contract.identiconMajority.one':
    'The icon {sharing} of the {total} pools above show. One does not — a comment of its own, or no icon drawn for it yet. Neither makes it a different contract: the fingerprint above is what checks that, and it ignores comments where {link} does not.',
  'contract.identiconMajority.other':
    'The icon {sharing} of the {total} pools above show. {count} do not — a comment of their own, or no icon drawn for them yet. Neither makes them a different contract: the fingerprint above is what checks that, and it ignores comments where {link} does not.',
  'contract.whoMayJoin': 'Who may join',
  'contract.whoMayJoinEvidence': 'Staking is refused unless this holds: {code}',
  'contract.whoMayJoinNone':
    'Nothing in the contract tests who you are, so nobody is turned away.',
  'contract.feeCeiling': 'Fee ceiling',
  'contract.feeCeilingEvidence': 'The contract refuses a higher fee: {code}',
  'contract.feeCeilingNone':
    'Nothing in the contract limits the fee to anything meaningful, so the pool can set it as it likes.',
  'contract.exempt': 'Stakers who pay no fee',
  'contract.exemptEvidence':
    'Some stakers are charged nothing, whatever the fee is set to: {code} {source}',
  'contract.exemptOperator':
    'Who counts is kept in “{source}”, which the pool writes — so the pool picks, and can change its mind.',
  'contract.exemptFixed':
    'Who counts is kept in “{source}”, which no public function writes.',
  'contract.exemptNone':
    'Every staker pays the same fee; the contract makes no exceptions.',
  'contract.notice': 'Warning before a fee change',
  'contract.noticeEvidence':
    'A new fee has to be announced and then wait {amount} {unit} — {human} — before it can take effect: {code}',
  'contract.noticeUnit.cycles': 'reward cycles',
  'contract.noticeUnit.blocks': 'Bitcoin blocks',
  'contract.noticeNone':
    'A new fee can take effect as soon as the pool sets it, with no warning.',
  'contract.bitcoin': 'Rewards in Bitcoin',
  'contract.bitcoinEvidence': 'It records a Bitcoin address for you: {code}',
  'contract.bitcoinNone':
    'The contract never handles a Bitcoin address, so rewards arrive as sBTC on Stacks.',

  'signerPage.back': '← All pools',
  'signerPage.key': 'Signer key',
  'signerPage.keyNone':
    'We have no signer key on file for this pool, so we cannot tell whether it shares one with any other contract.',
  'signerPage.sharedBy.one': 'One contract is registered against this key',
  'signerPage.sharedBy.other':
    '{count} contracts are registered against this key',
  'signerPage.thisOne': '— this page',
  'signerPage.sharedNote':
    'These contracts are one signer. The stake behind the key, the weight it carries and the slots it holds are decided on all of them together, so what any one of them holds is a part of the whole rather than a pool of its own.',
  'signerPage.rewards': 'Rewards in this contract',
  'signerPage.rewardsIntro':
    'The sBTC around this pool right now — what it has not collected, what it owes the people in it, and what it has kept for itself.',
  'signerPage.unclaimed': 'Still waiting at pox-5',
  'signerPage.claimCurrent': '· the last payout has been collected',
  'signerPage.claimBehind': '· a payout is sitting there uncollected',
  'signerPage.claimUnknown': '· we could not read this',
  'signerPage.undistributed': 'Waiting for the people in the pool',
  'signerPage.undistributedNote':
    'Collected from pox-5 and not yet paid out to stakers. Anyone can trigger those payouts, so this empties as they happen — but never quite to nothing, because the per-share arithmetic leaves a few sats behind for good.',
  'signerPage.earnedFees': 'Fees taken, not yet withdrawn',
  'signerPage.earnedFeesNote':
    'What the pool has charged and its operator has not moved out. A balance, not a lifetime total.',
  'signerPage.rewardsNone':
    'This contract does not publish what it is holding, so only the figure above can be read. That is a matter of what the code exposes, not a sign of anything wrong.',
  'signerPage.cycles': 'Cycle by cycle',
  'signerPage.cyclesIntro':
    'What this pool held in each reward cycle, and who it was holding it for. Amounts come from pox-5; the members come from pox-5 too, asked one staker at a time.',
  'signerPage.cycle': 'Cycle {cycle}',
  // The next cycle is the only one anyone can still join, and the only one
  // this may be said of: stacking for a cycle locks in before it starts.
  'signerPage.filling': 'open to join',
  'signerPage.active': 'earning now',
  'signerPage.ofSigner': 'of {total} across the signer',
  'signerPage.memberCount.one': 'One member',
  'signerPage.memberCount.other': '{count} members',
  'signerPage.notCounted': 'Members not counted for this cycle yet',
  // Beside the count, because a list for a cycle that is still open is a
  // photograph rather than a fact — see signerPage.membersFresh.
  'signerPage.walkedAt': '· checked {at}',
  'signerPage.membersFresh':
    'The amounts above are read every hour. Who holds them is a slower question — one call for every staker — so while a cycle is still open the list is rebuilt at most once a day, and can be that far behind.',
  'signerPage.showMembers': 'Show who was in it',
  'signerPage.hideMembers': 'Hide',
  'signerPage.shortList':
    'This list is short: the members below do not add up to what the signer holds, so somebody staking here is missing from it.',
  'signerPage.colStaker': 'Staker',
  'signerPage.colAmount': 'Amount',
  'signerPage.colShare': 'Share',
  'signerPage.colContract': 'Contract',
  'signerPage.showAll': 'Show all {count}',
  'signerPage.loading': 'Reading …',
  'signerPage.failed': 'That would not load. Try again in a moment.',
  'signerPage.noHistory':
    'No history has been built for this pool yet. The hourly refresh writes it a signer at a time, so check back later.',
  'signerPage.noMembers': 'The list for this cycle is not on file.',

  /*
   * The status page. What it says about a stake that exists comes from
   * `stake.position.*` above, which the staking dialog already shows for the
   * same facts — one vocabulary for one thing. These are the page around it.
   */
  'status.back': '← All pools',
  'status.heading': 'Where is my STX staked?',
  'status.intro':
    'Paste an address and see what it is staking, with whom, and until when. Nothing is sent anywhere — the addresses are read straight from the chain and never leave this page.',
  'status.inputLabel': 'Stacks addresses or BNS names',
  'status.inputHint':
    'One per line, or separated by commas. Up to {max}. BNS names like friedger.btc work, so do contract addresses, and anything after a # is kept as a label.',
  'status.lookUp': 'Look them up',
  'status.reading': 'Reading…',
  'status.clear': 'Start again',
  'status.tooMany':
    'That is more than {max} addresses, so the last {dropped} were left out.',
  'status.rejected.one': 'One line was not an address:',
  'status.rejected.other': '{count} lines were not addresses:',
  'status.resultsHeading.one': 'One address',
  'status.resultsHeading.other': '{count} addresses',
  'status.notStaking': 'Not staking.',
  'status.lockedElsewhere':
    'It has {amount} locked, but not through a pool this guide can read — so it is staking somewhere else rather than sitting idle.',
  'status.unlocked': '{amount} is not locked.',
  'status.unregistered':
    'Nobody owns this name in the BNS v2 registry, so there is no address to look up. Check the spelling, or whether it has lapsed.',
  'status.unreadable':
    'The node would not answer for this address, so we cannot say. That is not the same as it staking nothing — try again in a moment.',
  'status.cyclesLeft.one': 'One cycle left',
  'status.cyclesLeft.other': '{count} cycles left',
  'status.endsThisCycle': 'Ends this cycle',
  'status.ended': 'Already ended',
  'status.unlocksAt': 'Unlocks in cycle {cycle}.',
  'status.aboutPool': 'About {pool}',
  'status.readNote':
    'Read from the chain just now, one address at a time. Everything else in this guide comes from a file refreshed each hour; this cannot, because it is about addresses only you know.',
  'status.open': 'Check an address',

  'stake.open': 'Stake with wallet',
  'stake.title': 'Stake with {name}',
  'stake.close': 'Close',
  'stake.intro':
    'Staking locks some of your STX for a while, and earns you rewards for it. It never leaves your own wallet — it is held in place on the chain, and the pool cannot spend it.',

  'stake.wallet': 'Your wallet',
  'stake.walletNone': 'Not connected yet',
  'stake.connect': 'Connect wallet',
  'stake.switch': 'Use another account',
  'stake.disconnect': 'Disconnect',
  'stake.checking': 'Just a moment…',
  'stake.available': '{amount} you can stake',
  'stake.availableUnknown': 'Connect your wallet to see what you have',

  'stake.position.title': 'You are already staking',
  'stake.position.amount': '{amount} with {pool}',
  'stake.position.thisPool': 'That is this pool.',
  'stake.position.otherPool': 'Staking here moves it to {pool}.',
  'stake.position.cycles.one': 'For one reward cycle, from cycle {first}.',
  'stake.position.cycles.other':
    'For {count} reward cycles, from cycle {first}.',
  'stake.position.cyclesHint': 'A reward cycle is about two weeks.',
  'stake.position.rewardsBitcoin': 'Your rewards go to Bitcoin, at {address}.',
  'stake.position.rewardsSbtc':
    'Your rewards arrive as sBTC, in this same wallet.',
  'stake.position.rewardsUnknown':
    'We could not read where this pool sends your rewards.',
  'stake.position.maxFee':
    'Up to {sats} sats of each payout covers sending it on.',
  'stake.position.minClaim': 'Paid out once it is worth at least {sats} sats.',
  'stake.position.userDataBitcoin':
    'You sent {address} with your {tx}, and a fee cap of {sats} sats.',
  'stake.position.userDataSbtc':
    'You sent no address with your {tx}, which asks to be paid in sBTC.',
  'stake.position.userDataFloor': 'You sent a {sats} sats floor with it.',
  'stake.position.userDataNoFloor':
    'You sent no floor with it, so the pool used its own.',
  'stake.position.userDataStakeTx': 'stake',
  'stake.position.userDataUpdateTx': 'stake update',
  'stake.position.userDataUnknown':
    'We could not find the transaction that carried your details.',

  'stake.amountQuestion': 'How much would you like to stake?',
  'stake.amountQuestionMore': 'How much would you like to add?',
  'stake.amountOptional':
    'Leave this empty to change nothing but the settings below.',
  'stake.amountOptionalMove':
    'Leave this empty to move what you already stake, without adding to it.',
  'stake.max': 'Use max',
  'stake.maxHint':
    'Max leaves 1 STX behind, so you can still pay for transactions.',
  'stake.cyclesQuestion': 'For how long?',
  'stake.cyclesCount.one': '{count} cycle',
  'stake.cyclesCount.other': '{count} cycles',
  'stake.cyclesFor.weeks.one': 'About one week.',
  'stake.cyclesFor.weeks.other': 'About {count} weeks.',
  'stake.cyclesFor.months.one': 'About one month.',
  'stake.cyclesFor.months.other': 'About {count} months.',
  'stake.cyclesHint':
    'Your STX unlocks at the end of it. You can add cycles later, up to {max}.',

  'stake.extendQuestion': 'For how much longer?',
  'stake.extendKeep': 'No longer',
  'stake.extendCount.one': '{count} more cycle',
  'stake.extendCount.other': '{count} more cycles',
  'stake.extendTotal.one': 'One cycle in all.',
  'stake.extendTotal.other': '{count} cycles in all.',
  'stake.extendHint': 'From {min} to {max} more cycles.',

  'stake.extendNote':
    'Your stake ends after this cycle, and the chain will not accept a change that leaves it there. This one carries the lock one cycle further.',
  'stake.prepareNote':
    'The next cycle is being prepared, and the chain refuses changes to a stake until it starts. That is usually within a day.',

  'stake.rewardsQuestion': 'Where should your rewards go?',
  'stake.rewardsSbtc': 'Keep them on Stacks',
  'stake.rewardsSbtcHelp':
    'They arrive as sBTC in this wallet. Nothing to set up.',
  'stake.rewardsBitcoin': 'Send them to Bitcoin',
  'stake.rewardsBitcoinHelp': 'They go to a Bitcoin address you choose.',
  'stake.rewardsNow': 'what happens now',
  'stake.rewardsChangeToSbtc':
    'This stops your rewards going to Bitcoin. They will arrive as sBTC in this wallet instead.',
  'stake.rewardsChangeAddress':
    'This replaces the Bitcoin address the pool holds for you.',
  'stake.btcAddress': 'Your Bitcoin address',
  'stake.maxFee': 'Most to spend on sending it',
  'stake.maxFeeHint':
    'In sats. Sending Bitcoin costs a small fee, taken out of the payout. 3000 is a sensible starting point.',
  'stake.minClaim': 'Smallest payout worth sending',
  'stake.minClaimHint':
    'In sats. Rewards build up until they reach this, then anyone can send them on to you. Set it higher and payouts come less often but lose less to fees. It has to be above {min}.',

  'stake.explain': 'What happens when I press this?',
  'stake.explainBody':
    'Your wallet builds a transaction that locks the amount above with this pool for as long as you chose, and asks you to approve it. Nothing moves until you do, and you can close this window at any point before then.',

  'stake.submitting': 'Waiting for your wallet…',
  'stake.stakeNow': 'Start staking',
  'stake.addToStake': 'Add to my stake',
  'stake.moveStake': 'Move my stake here',
  'stake.extendStake': 'Extend my stake',
  'stake.tx.pending': 'Broadcast, waiting for it to confirm —',
  'stake.tx.success': 'Confirmed —',
  'stake.tx.failed': 'It did not go through —',

  'stake.unstake.title': 'Stop staking',
  'stake.unstake.body':
    'Your STX stays locked until the end of the current cycle and unlocks then. Rewards you have already earned are not affected.',
  'stake.unstake.open': 'Stop staking',
  'stake.unstake.confirm': 'Yes, stop staking',
  'stake.unstake.cancel': 'Keep staking',

  'stake.error.noStxAddress':
    'Could not find an STX address in the connected wallet.',
  'stake.error.amount': 'Enter an amount to stake.',
  'stake.error.cycles': 'Pick a whole number of cycles, from 1 to {max}.',
  'stake.error.extend':
    'Pick a whole number of cycles to add, from {min} to {max}.',
  'stake.error.nothingToChange':
    'Nothing would change. Add an amount, or change where your rewards go.',
  'stake.error.refused': 'The chain would refuse this. {reasons}',
  'stake.error.notBroadcast':
    'Your wallet did not send the transaction on to the chain, so nothing has changed. Try again.',
  'stake.error.tooMuch': 'That is more than you have, less the 1 STX buffer.',
  'stake.error.btcAddress': 'Enter the Bitcoin address your rewards go to.',
  'stake.error.maxFee': 'The most to spend on sending has to be a number.',
  'stake.error.minClaim':
    'The smallest payout has to be a number above {min} sats, or the pool cannot send it.',
  'stake.error.noPublicKey':
    'Your wallet did not return a public key. Reconnect and try again.',
  'stake.error.balanceLookup': 'Balance lookup failed ({status})',
  'stake.error.balanceRead': 'Could not read STX balance',
};

export type Messages = typeof messages;
export type MessageKey = keyof Messages;

/** Keys that come in `.one` / `.other` pairs, for `t.plural`. */
export type PluralKey = MessageKey extends infer K
  ? K extends `${infer Base}.one`
    ? Base
    : never
  : never;

export interface LocaleBundle {
  /** The language's own name for itself, for the language switcher. */
  name: string;
  /** BCP 47 tag for Intl date and number formatting. */
  intlLocale: string;
  /** Value for `<html lang>`. */
  htmlLang: string;
  /** Value for `og:locale`. */
  ogLocale: string;
  /** Largest unit first; the first step the amount reaches wins. */
  amountScale: AmountScaleStep[];
  /** Profile copy, keyed by profile id. Empty when the source copy is English. */
  profiles: Record<string, ProfileTranslation>;
  messages: Messages;
}

export const en: LocaleBundle = {
  name: 'English',
  intlLocale: 'en-GB',
  htmlLang: 'en',
  ogLocale: 'en_US',
  amountScale: [
    // One decimal below 10 million, none above: nobody needs "12.4 million"
    // to three figures, and "1 million" hides too much.
    {
      min: 1_000_000,
      divisor: 1_000_000,
      decimalBelow: 10,
      unit: '{value} million STX',
    },
  ],
  // English profile copy is the source, and lives in src/data/profiles.json.
  profiles: {},
  messages,
};
