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
  'app.stakedNextLocked':
    'Cycle {cycle} is locked in: {amount} committed to them, and no more can join.',
  'app.contractsHeading': 'The signer contracts',
  'app.contractsIntro':
    'Each one behaves differently. Tap a contract to see what it does and who runs it.',
  'app.archivedHeading': 'Archived contracts',
  'app.archivedIntro':
    'Code the operator has replaced. The pools still running it are left out of the list below, and out of the counts on this page — they are real and their pages still say everything about them, but nobody should be choosing one today.',
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
  'app.by': 'by',
  'app.stxOnlyEstimate.title':
    'Estimated next distribution cycle rewards for STX-only stakers',
  'app.stxOnlyEstimate.intro':
    'Estimate from the sBTC that has reached pox-5 since the last payout: minus bond-holder share, minus the foundation share (15%), projected to a 1050-block distribution cycle, then divided by the STX-only stake (everything staked, less the STX registered for bonds). Not from the balance pox-5 holds — that also carries rewards already earned and waiting to be claimed. A few blocks of deposits make a rough projection, so this distribution cycle counts for as much of the rate as it has run and the last payout — a figure pox-5 has already settled — covers the rest.',
  'app.stxOnlyEstimate.loading': 'Reading estimate from chain data…',
  'app.stxOnlyEstimate.unavailable':
    'Could not build this estimate right now. Try again in a moment.',
  'app.stxOnlyEstimate.accrued': 'sBTC received since the last payout',
  'app.stxOnlyEstimate.bondShare': 'Bond-holder share so far',
  'app.stxOnlyEstimate.foundationShare': 'Foundation share (15%)',
  'app.stxOnlyEstimate.stxOnlySoFar': 'STX-only share so far',
  'app.stxOnlyEstimate.progressLabel': 'Distribution cycle progress',
  'app.stxOnlyEstimate.progress':
    'Projected from {now}/{total} blocks in this distribution cycle',
  'app.stxOnlyEstimate.projectedLabel': 'Projected distribution cycle total',
  'app.stxOnlyEstimate.projected':
    'Projected distribution cycle total: {amount}',
  'app.stxOnlyEstimate.stxOnlyStaked': 'STX staked by STX-only holders',
  'app.stxOnlyEstimate.lastPayout': 'Last payout, as paid',
  'app.stxOnlyEstimate.lastPayoutAt': 'Last payout, as paid ({at})',
  'app.stxOnlyEstimate.projectedRate':
    'This distribution cycle so far, extrapolated',
  'app.stxOnlyEstimate.rate': 'Rate for this distribution cycle',
  'app.stxOnlyEstimate.rateBlend':
    'As it stands now: this cycle’s own figure counts for {now} of {total} blocks, and what the last payout actually paid covers the other {rest}.',
  'app.stxOnlyEstimate.rateBlendLink': 'how this is worked out',
  'app.stxOnlyEstimate.rateValue': '{sats} sats per 1000 STX',
  'app.stxOnlyEstimate.satsShort': '{sats} sats',
  'app.stxOnlyEstimate.gridApy': 'A year',
  'app.stxOnlyEstimate.gridLast': 'Last paid',
  'app.stxOnlyEstimate.gridUnknown': 'not known',
  'app.stxOnlyEstimate.apy': 'APY at that rate (50 distribution cycles a year)',
  'app.stxOnlyEstimate.apyValue': '{apy}',
  'app.stxOnlyEstimate.apyUnavailable': 'APY unavailable right now',
  'app.stxOnlyEstimate.stxPrice': 'STX price (CoinGecko)',
  'app.stxOnlyEstimate.priceValue': '{sats} sats',
  'app.stxOnlyEstimate.priceUnavailable': 'Price unavailable right now',
  'app.stxOnlyEstimate.untilPayoutAsOf':
    'Estimated payout in about {duration} ({blocks} blocks left as of {at}).',
  'app.stxOnlyEstimate.weeklyLead':
    'Like a weekly allowance, for every 1000 STX this distribution cycle could add:',
  'app.stxOnlyEstimate.weeklyApy': 'APY: {apy}',
  'app.stxOnlyEstimate.weeklyProgress': 'Distribution cycle progress',
  'app.stxOnlyEstimate.weeklyBlocksAsOf':
    '{blocks} blocks left ({duration}) as of {at}.',
  'app.stxOnlyEstimate.weeklyEstimateNote':
    'One estimate based on the latest distribution cycle data.',
  'app.stxOnlyEstimate.homeSentence':
    'For the current distribution cycle, the rewards for STX-only stakers are around {rate} ({apy} APY). {link}',
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
  'app.stxOnlyHistory.title': 'Every cycle, and what it paid',
  'app.stxOnlyHistory.intro':
    'Rewards are computed at the end of every distribution cycle, and a reward cycle holds two of them — so each reward cycle is paid in two goes. These are the rates as paid, not estimates — each one is what pox-5 credited per 1000 STX staked.',
  'app.stxOnlyHistory.loading': 'Reading the payout history…',
  'app.stxOnlyHistory.none':
    'No distribution has been recorded yet. The first one appears here once a distribution cycle has paid.',
  'app.stxOnlyHistory.failed':
    'The payout history could not be fetched. Try again in a moment.',
  'app.stxOnlyHistory.cycle': 'Cycle {cycle}',
  'app.stxOnlyHistory.cycleTotal': 'for the reward cycle',
  'app.stxOnlyHistory.stillPaying': 'still paying — one of two so far',
  'app.stxOnlyHistory.firstHalf': 'First half',
  'app.stxOnlyHistory.secondHalf': 'Second half',
  'app.stxOnlyHistory.atHeight': 'at burn height {height}',
  'app.stxOnlyHistory.rateUnknown': 'not known',
  'app.stxOnlyHistory.note':
    'A reward cycle’s total comes from what pox-5 has accrued for that cycle, not from adding the two halves — each half is rounded down to a whole sat on its own. A half reads as “not known” when no refresh ran between the two payouts, which is the only moment the first of them can be told from the pair.',
  'bonds.open': 'The bonds',
  'app.bonds.back': '← All pools',
  'app.bonds.title': 'What the bonds are holding',
  'app.bonds.intro':
    'Invited stakers lock bitcoin — as sBTC on Stacks, or on Bitcoin itself — for {length} cycles, alongside the STX they stake. A new bond opens every {gap} cycles.',
  'app.bonds.loading': 'Reading the bonds…',
  'app.bonds.none':
    'Nothing on file for the bonds yet. They appear here once the hourly refresh has read them.',
  'app.bonds.failed': 'The bonds could not be fetched. Try again in a moment.',
  'app.bonds.heading': 'Bond {index}',
  'app.bonds.current': 'now',
  'app.bonds.next': 'next',
  'app.bonds.period': 'cycles {first}–{last}',
  'app.bonds.notSetUp':
    'No bond was set up for this period. The bond admin can only set one up in the two cycles before it opens.',
  'app.bonds.closed': 'registration closed, opens at burn height {height}',
  'app.bonds.wentUnused': 'went unused',
  'app.bonds.lockedFinal': 'locked',
  'app.bonds.locked': 'locked so far',
  'app.bonds.stillOpen': 'still open',
  'app.bonds.split': '{sbtc} as sBTC · {l1} on Bitcoin',
  'app.bonds.ceiling': 'ceiling',
  'app.bonds.invited.one': '{count} invited staker',
  'app.bonds.invited.other': '{count} invited stakers',
  'app.bonds.opensAt': 'opens at burn height {height}',
  'app.bonds.running': 'since burn height {height}',
  'app.bonds.incomplete':
    'The allowlist below is short — its rows do not add up to what pox-5 says is in this bond — so read the ceiling as “at least this much”. pox-5 will not list an allowlist, so the guide recovers it from the setup-bond transaction, and some of it could not be found.',
  'app.bonds.who': 'Who was invited',
  'app.bonds.ofCeiling': 'of {ceiling}',
  'app.bonds.notLockedYet': 'nothing locked yet',
  'app.bonds.onL1': 'on Bitcoin',
  'app.bonds.asSbtc': 'as sBTC',
  'app.bonds.throughPool': 'through {pool}',
  'app.bonds.note':
    'A ceiling is the most a staker may lock, set when the bond was made; what is locked is what they actually put up. Read from pox-5 on {at}.',
  'app.stxOnlyEstimate.back': '← All pools',
  'app.stxOnlyEstimate.note':
    'Estimate only. It depends on what has reached pox-5 since the last payout and on how far this distribution cycle has run, so it settles as that cycle goes on.',
  'app.stxOnlyEstimate.generatedAt': 'Generated at: {at}',
  'app.stxOnlyFaq.title': 'How the rate is worked out',
  'app.stxOnlyFaq.q.threeRates': 'Why are there three rates on this page?',
  'app.stxOnlyFaq.a.threeRates':
    'One is a fact and the other two are not. What the last payout paid is settled — pox-5 has already credited it. What this distribution cycle is on course for is its own accrual so far, multiplied out to the full cycle: a fair guess late on, and a wild one an hour after a payout, when a handful of Bitcoin blocks are standing in for a week. The rate published here is the two of them weighted by how far the cycle has run, so it starts at what was actually paid and hands over to this cycle as the evidence for it arrives.',
  'app.stxOnlyFaq.q.blend': 'So why does the published rate match neither?',
  'app.stxOnlyFaq.a.blend':
    'Because it is both, in the proportion the cycle has run. Early in a cycle it sits close to what the last payout paid; by the end of the cycle it is almost entirely this cycle’s own figure.',
  'app.stxOnlyFaq.q.sats': 'Where do the sats come from?',
  'app.stxOnlyFaq.a.sats':
    'From what pox-5 has taken in since the last payout and not yet accounted to anyone — its own get-new-rewards, not its balance, which also holds rewards already earned and waiting to be claimed. Bond holders’ share comes off that first, then the foundation’s 15% of what is left, and the remainder is divided by the STX staked through pools that hold no bond.',
  'app.stxOnlyFaq.q.distributionCycle': 'What is a distribution cycle?',
  'app.stxOnlyFaq.a.distributionCycle':
    '1050 burn blocks — half a reward cycle, about 7.3 days. pox-5 works rewards out at the end of each one, so a reward cycle is paid in two goes rather than one.',
  'app.stxOnlyFaq.q.fifty': 'Why 50 of them a year, and not 52?',
  'app.stxOnlyFaq.a.fifty':
    'Because 7.3 days is not a week. A year holds 50.1 distribution cycles, and pox-5 annualises the same way, dividing by 50. Compounding a weekly rate 52 times would overstate the APY by about 4%.',
  'app.stxOnlyFaq.q.promise': 'Is any of this a promise?',
  'app.stxOnlyFaq.a.promise':
    'No. The only settled figure on this page is what the last payout paid, and every payout on record is listed on the history page. Everything else moves with what reaches pox-5, with how much STX is staked against it, and — for the APY — with the price of STX.',
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
  'app.footer.trustLink': 'read the code on GitHub',
  'footer.sections': 'All sections',
  'footer.data': 'Data read from the chain {at}, refreshed hourly.',
  'footer.code': 'Code on GitHub',
  'footer.madeBy': 'Made by Fast Pool',
  'footer.disclosure': 'runs some of these pools, listed like any other',

  'filter.inUse.label': 'In use',
  'filter.inUse.help':
    'Hides pools with nothing staked in this cycle, the one before or the one filling now. Pools the guide has only just seen keep their place — a pool registered this week could not be in a cycle that was locked in before it existed.',
  'filter.bitcoin.label': 'Rewards in Bitcoin',
  'filter.bitcoin.help':
    'Pays your rewards to a Bitcoin address, instead of as sBTC on Stacks.',
  'filter.lowFee.label': 'Low fee (5% or less)',
  'filter.lowFee.help':
    'The fee the pool charges today is under 5%. Pools can change their fee later.',
  'filter.cappedFee.label': 'Fee capped at 20%',
  'filter.cappedFee.help':
    'The contract itself refuses to let the fee go above 20%, whatever the pool decides. Most contracts have no such limit.',
  'filter.highFee.label': 'Fee of 95% or more',
  'filter.highFee.help':
    'The opposite of the filters above, and the reason it is here: these pools keep almost every reward they earn for you. Four of them charge 99.99% today, and nothing in their contracts stops it.',
  'filter.feeNotice.label': 'Fee changes announced first',
  'filter.feeNotice.help':
    'A new fee cannot take effect the moment the pool decides on it — the contract makes it wait, so you have time to notice and move.',
  'filter.open.label': 'Anyone can join',
  'filter.open.help':
    'No invitation or membership needed — you can stake with this pool yourself.',

  'badge.new': 'New',
  'badge.anyoneCanJoin': 'Anyone can join',
  'badge.inviteOnly': 'Invite only',
  'badge.archived': 'Archived contract',
  'badge.bitcoinRewards': 'Rewards in Bitcoin',
  'badge.bitcoinViaPool': 'Bitcoin through the pool',
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
  'amount.btc': '{value} BTC',

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
  'contract.bitcoinViaPool':
    'It records a Bitcoin address for you — {code} — and then pays nowhere near it: every reward leaves this contract as sBTC, in one payment to one recipient the operator sets. The address is readable by anyone, so a pool that distributes to its stakers itself can pay them in bitcoin from it. That is the pool doing it, not the contract, and this page cannot tell you whether it does.',
  'contract.bitcoinNone':
    'The contract never handles a Bitcoin address, so rewards arrive as sBTC on Stacks.',

  'signerPage.back': '← All pools',
  'signerPage.key': 'Signer key',
  'signerPage.keyNone':
    'We have no signer key on file for this pool, so we cannot tell whether it shares one with any other contract.',
  'groups.open': 'Who holds the vote',
  'groups.back': '← All pools',
  'groups.heading': 'Who holds the vote',
  'groups.intro':
    'A signer node is one key. A group is a set of them with one entity behind it — which is the number that decides who could move the signer set, and the number the chain never shows you. Largest first.',
  'groups.counts': '{nodes} nodes · {contracts} contracts · {staked} staked',
  'groups.asOf': 'Shares are of cycle {cycle}.',
  'groups.ungrouped': 'Not grouped',
  'groups.ungroupedNote':
    'Signers nobody here has grouped. A gap in this file, not a finding that they are unrelated to one another — and counted by contract, so a contract in this row may sit on a key one of the groups above does claim.',
  'groups.ungroupedCounts': '{contracts} contracts · {staked} staked',
  'groups.sourceHeading': 'How to read this page',

  'group.back': '← All pools',
  'group.missing': 'No such group. It may have been renamed.',
  'group.kind.operator': 'Runs these nodes',
  'group.kind.stake': 'Supplies the stake',
  'group.kindNote.operator':
    'One entity runs every node below, so it signs with all of them. Its weight is everything staked with them.',
  'group.kindNote.stake':
    'The nodes below are run by other people. What this entity controls is the STX behind the contracts listed — it can move that stake, but it does not hold the keys that sign with it.',
  'group.votingPower': 'Voting power',
  'group.votingPowerValue': '{percent}% of cycle {cycle}',
  'group.staked': 'Staked across the group',
  'group.nodeCount': 'Signer nodes',
  'group.contractCount': 'Signer contracts',
  'group.source': 'What this is based on',
  'group.sourceNote':
    'Nothing on chain says who runs a signer node, so every group here was written down by hand. This is the evidence for this one; if it is wrong, the number above is wrong with it.',
  'group.site': 'Their site',
  'group.contracts': 'What is in the group',
  'group.contractOnly':
    'This contract only — the rest of what this node holds is not part of the group.',
  'group.wholeNode': 'Every contract on this key',
  'group.unknownAmount': 'not known',
  'group.nodeAnswered':
    'Answered {percent}% of the blocks it was asked about in cycle {cycle}.',
  'group.nodeSilent': 'Has not answered a single block in cycle {cycle}.',
  'group.alsoIn': 'Also counted in {names}',
  'group.overlapNote':
    'A node can be in more than one group, and one here is: an entity that runs a key signs with everything on it, while an entity that delegated stake into one of those contracts controls that contract alone. Both are true at once, so the same STX can appear under two names — which is the thing worth knowing, not a mistake in the arithmetic.',
  'conduct.title': 'How it answers the miners',
  'conduct.intro':
    'Weight is what a signer is owed a say over; this is whether it turns up. Every block a miner proposes goes to every seated signer, and each one accepts it, rejects it, or says nothing at all. Refusing a block is the job. Missing it is not.',
  'conduct.none':
    'Nothing on file for this key. A signer that has never held a seat has never been asked to answer anything.',
  'conduct.rotated':
    'This contract changed its signer key on {when}, during cycle {cycle}. A cycle’s signer set is fixed before the cycle begins, so the key it replaced kept the seat — and whatever it did or did not do with it — until the next set was worked out.',
  'conduct.oldKeyNote':
    'This is the key that was rotated away from, because it is the one that held the seat for this cycle. The new key holds nothing until the next set is computed.',
  'conduct.cycleOpen': 'cycle {cycle}, still running',
  'conduct.cycleClosed': 'cycle {cycle}',
  'conduct.answeredNote':
    'It answered {answered} of {proposals} proposals — {label}.',
  'conduct.neverAnswered': 'Never answered',
  'conduct.neverAnsweredNote':
    'It has been asked about {proposals} blocks in cycle {cycle} and has not responded to one of them. Nothing has ever been heard from this key.',
  'conduct.response': 'Typical time to answer',
  'conduct.seconds': '{seconds} s',
  'conduct.responseMiddle':
    'The middle of the signer set is {seconds} s in cycle {cycle}.',
  'conduct.agreed': 'Of those, accepted',
  'conduct.agreedNote':
    'The rest it read and refused, which is what a signer is for. A low figure here is worth asking about; it is not the same as a signer that was not there.',
  'conduct.unknown': 'not known',
  'conduct.showHistory': 'Every cycle on file',
  'conduct.hideHistory': 'Hide the history',
  'conduct.loading': 'Reading this key’s record…',
  'conduct.noHistory': 'No cycles on file for this key yet.',
  'conduct.failed':
    'That would not load. It is one file; the rest of this page is unaffected.',
  'conduct.soFar': 'so far',
  'conduct.th.cycle': 'Cycle',
  'conduct.th.answered': 'Answered',
  'conduct.th.response': 'Time to answer',
  'conduct.th.weight': 'Weight',
  'conduct.source':
    'Counted by Hiro’s signer-metrics API, which watched the proposals go out and the answers come back. It is somebody else’s observation, not something this guide could read off the chain.',

  'signerPage.groups.one': 'Part of one group',
  'signerPage.groups.other': 'Part of {count} groups',
  'signerPage.groupsNote':
    'Who is behind this node, as far as anybody has written down. A group is a set of nodes with one entity behind them, which is what decides how much of the signer set that entity really carries.',
  'signerPage.votingPower': 'Voting power',
  'signerPage.votingPowerValue': '{percent}% of cycle {cycle}',
  'signerPage.votingPowerNote':
    'pox-5 weights a signer by the STX stacked behind it, so this is how much of the signer set’s say this key carries — for the cycle named, across every contract registered against it. It is not a measure of how well the signer behaves: nothing here says whether it has been signing, what it runs, or how long it has been up.',
  'signerPage.votingPowerUnknown':
    'Not known for this cycle — the refresh could not read what one of these contracts is holding.',
  'signerPage.votingPowerStaked': 'Staked behind this key',
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
  'status.heading': 'Where is my STX, and what has it earned?',
  'status.intro':
    'Paste an address and see what it is staking, with whom, until when, and what sBTC is waiting for it. Nothing is sent anywhere — the addresses are read straight from the chain and never leave this page.',
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

  'howTo.open': 'How staking works',
  'howTo.back': '← Back to the pools',
  'howTo.title': 'Staking in three steps',
  'howTo.intro':
    'The rest of this guide is the detail. This page is the whole of it.',
  'howTo.stx.heading': 'Staking STX',
  'howTo.stx.one.title': 'Choose a signer',
  'howTo.stx.one.body':
    'Pick a pool from the list. Its fee, its ceiling and who it lets in are on the card.',
  'howTo.stx.one.link': 'See the pools',
  'howTo.stx.two.title': 'Call the stake function',
  'howTo.stx.two.body':
    'One transaction from your wallet. Your STX is locked where it already is — it never moves to the pool.',
  'howTo.stx.three.title': 'Done',
  'howTo.stx.three.body':
    'Rewards arrive every week, for as long as you locked — up to 96 cycles, around three and a half years.',
  'howTo.stx.three.link': 'Check what you are owed',
  'howTo.sbtc.heading': 'Staking sBTC',
  'howTo.sbtc.intro':
    'Same three steps, one difference: the sBTC leaves your wallet and the pool does the staking.',
  'howTo.sbtc.one.title': 'Choose a pool',
  'howTo.sbtc.one.body': 'Three are open today.',
  'howTo.sbtc.two.title': 'Send sBTC to the pool',
  'howTo.sbtc.two.body':
    'From the pool’s own app. It holds the sBTC while it is staked.',
  'howTo.sbtc.three.title': 'The pool takes it from there',
  'howTo.sbtc.three.body':
    'It stakes, it claims, and it passes the rewards back to you.',
  'howTo.sbtc.poolsNote':
    'They work slightly differently — what they charge, what you hold while it is staked, how quickly you get the sBTC back. Read the pool’s own terms before you send anything; this guide does not read them off the chain the way it reads the signer pools.',
  'howTo.sbtc.noLink': 'No link on file yet.',
  'myRewards.title': 'What it has earned',
  'myRewards.show': 'What has it earned?',
  'myRewards.readingRow': 'Asking pox-5, cycle by cycle…',
  'myRewards.atPox5': 'Waiting for you at pox-5',
  'myRewards.perCycle': 'Cycle {cycle}: {amount}',
  'myRewards.unreadCycle': 'could not be read',
  'myRewards.onlyYou':
    'Only you can take this: the claim reads the sender, so no operator can move it for you — and none can take it from you either.',
  'myRewards.atPool': 'Waiting at the pool',
  'myRewards.atPoolNote':
    'The pool has already collected this cycle from pox-5 and is holding your share, read from its own {getter}. Anyone can trigger the payout, including you.',
  'myRewards.movedNote':
    'A zero here does not always mean nothing was earned. Once a pool runs claim-rewards, that cycle moves out of pox-5 and into the pool — and a pool that keeps no per-staker books cannot be asked what it is holding for you. The pool’s own page shows what it has collected and not yet handed out.',

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
  'walletBanner.label': 'Open this page in a wallet',
  'walletBanner.title': 'On a phone? Open this page in your wallet.',
  'walletBanner.open': 'Open in {wallet}',
  'walletBanner.dismiss': 'Hide this',

  'stake.browserTitle': 'On a phone? Open this page in your wallet',
  'stake.browserBody':
    'There is no extension to connect to on a phone. Leather and Xverse each have a browser of their own, and this page can talk to the wallet from inside it — for Leather that is the only route there is.',
  'stake.browserOpen': 'Open in {wallet}',
  'stake.browserNote':
    'Opens this same page, on this same pool. The wallet’s browser keeps its own settings, so the language and any address you were watching do not follow you across. Nothing happens if that wallet is not installed.',

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
    'In sats. Sending Bitcoin costs a small fee, taken out of the payout. 3000 is a sensible starting point, and {min} is the least worth setting — under that a payout will not confirm.',
  'stake.minClaim': 'Smallest payout worth sending',
  'stake.minClaimHint':
    'In sats. Rewards build up until they reach this, then anyone can send them on to you. Set it higher and payouts come less often but lose less to fees. It has to be above {min}.',

  'stake.keysNote':
    'Your wallet builds, signs and broadcasts this. This page never sees a key.',
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
  'stake.error.maxFeeFloor':
    'Allow at least {min} sats for sending. Below that the payout is never mined, and no message says so.',
  'stake.error.minClaim':
    'The smallest payout has to be a number above {min} sats, or the pool cannot send it.',
  'stake.error.noPublicKey':
    'Your wallet did not return a public key. Reconnect and try again.',
  'stake.error.balanceLookup': 'Balance lookup failed ({status})',
  'stake.error.balanceRead': 'Could not read STX balance',

  // ---- Site header, on every page.
  'nav.label': 'Sections',
  'nav.pools': 'Pools',
  'nav.contracts': 'Contracts',
  'nav.groups': 'Who holds the vote',
  'nav.bonds': 'Bonds',
  'nav.status': 'Check an address',
  'nav.howTo': 'How staking works',
  'nav.learn': 'Learn',
  'nav.suggestGroup': 'Operator group',
  'nav.menu': 'Menu',
  'nav.searchLabel': 'Find a pool, or check an address or BNS name',
  'nav.searchPlaceholder': 'Pool, address or BNS',

  // ---- How old the data is.
  'freshness.readAgo': 'Read from the chain {ago} ago',
  'freshness.hourly': 'refreshed hourly',
  'freshness.ago.minute.one': '{count} minute',
  'freshness.ago.minute.other': '{count} minutes',
  'freshness.ago.hour.one': '{count} hour',
  'freshness.ago.hour.other': '{count} hours',
  'freshness.ago.day.one': '{count} day',
  'freshness.ago.day.other': '{count} days',
  'freshness.staleTitle.minute.one': 'Data is {count} minute old',
  'freshness.staleTitle.minute.other': 'Data is {count} minutes old',
  'freshness.staleTitle.hour.one': 'Data is {count} hour old',
  'freshness.staleTitle.hour.other': 'Data is {count} hours old',
  'freshness.staleTitle.day.one': 'Data is {count} day old',
  'freshness.staleTitle.day.other': 'Data is {count} days old',
  'freshness.staleBody': 'figures may have moved',

  // ---- The pool list's page.
  'home.intro':
    'Compare every pool by its fee, who can join and how rewards are paid.',
  'home.you.reading': 'Reading {who}…',
  'home.you.failed': 'Could not read {who} just now',
  'home.you.notStaking': '{who} is not staking',
  'home.you.staked': '{who}: {amount} staked with',
  'home.you.open': 'details →',
  'home.you.forget': 'Forget this address',
  'home.stat.staked': 'Staked in cycle {cycle}',
  'home.stat.nextFilling': 'Cycle {cycle}: {amount} so far',
  'home.stat.nextLocked': 'Cycle {cycle} locked in: {amount}',
  'home.stat.pools': 'Pools to choose from',
  'home.stat.types.one': 'on {count} contract type ·',
  'home.stat.types.other': 'on {count} contract types ·',
  'home.stat.compare': 'compare them →',
  'home.stat.rewards': 'STX-only rewards',
  'home.stat.rewardsUnit': 'sats / 1k STX',
  'home.stat.apy': '≈ {apy}% a year ·',
  'home.stat.howWorkedOut': 'how →',
  'home.stat.payout': 'Next payout',
  'home.stat.payoutDays.one': 'in ~{count} day',
  'home.stat.payoutDays.other': 'in ~{count} days',
  'home.stat.payoutDue': 'due now',
  'home.stat.payoutOverdue':
    'The estimate is from the last refresh and its date has passed.',
  'home.stat.payoutBlocks': '{done} of {total} blocks ·',
  'home.stat.history': 'history →',
  'home.footer.fees':
    'Fees are read from each pool’s contract, and most pools can change theirs at any time — ⛉ marks a cap set in code, ◷ a wait before a rise.',

  'pools.count.one': '{count} pool',
  'pools.count.other': '{count} pools',
  'pools.hiddenEmpty.one': '{count} empty pool hidden ·',
  'pools.hiddenEmpty.other': '{count} empty pools hidden ·',
  'pools.showEmpty': 'show',
  'pools.hideEmpty': 'hide empty pools',
  'pools.sortBy': 'Sort by',
  'pools.sort.staked': 'Staked · {cycle}',
  'pools.sort.next': 'Cycle {next} so far',
  'pools.sort.fee': 'Lowest fee',
  'pools.sort.share': "Key's vote share",
  'pools.sort.name': 'Name',
  'pools.col.pool': 'Pool',
  'pools.col.type': 'Contract type',
  'pools.col.fee': 'Fee',
  'pools.col.join': 'Who can join',
  'pools.col.rewards': 'Rewards',
  'pools.col.share': "Key's vote share",
  'pools.col.stake': 'Stake',
  'pools.unnamed': 'unnamed pool',
  'pools.unnamedIn': 'unnamed · {group}',
  'pools.feeElsewhere': 'Not held in this contract — it may be taken elsewhere',
  'pools.feeElsewhereShort': 'set elsewhere',
  'cycles.loading': 'Reading the cycles…',
  'cycles.pageIntro':
    'Every pox-5 cycle: what was staked, by how many signers and pools, what it paid and what that was as a yield — then each payout on its own.',
  'cycles.title': 'The network, cycle by cycle',
  'cycles.intro':
    'Worked out from what every contract held in each cycle and what each payout paid per 1000 STX. Nothing here is an estimate except a cycle still being paid.',
  'cycles.chart': 'STX-only rewards per cycle, in sBTC',
  'cycles.rewardsHelp':
    "What the cycle paid STX-only stakers: their stake times pox-5's rewards per STX for the cycle. STX registered for a bond is paid from the bond share instead, and is not counted.",
  'cycles.col.cycle': 'Cycle',
  'cycles.col.staked': 'Staked',
  'cycles.col.signers': 'Signers',
  'cycles.col.pools': 'Pools',
  'cycles.col.rate': 'Per 1000 STX',
  'cycles.col.apy': 'APY',
  'cycles.col.rewards': 'STX-only rewards',
  'cycles.signersHelp':
    'Signer keys with any STX staked behind them in the cycle.',
  'cycles.poolsHelp':
    "Contracts with any STX staked in the cycle. Stacking DAO's contracts count as one pool, since it is one place to stake.",
  'cycles.apyHelp':
    "Each payout's rate against the STX price when it was paid, compounded over fifty payouts a year — the same method as the rate on the home page — and averaged over the cycle's payouts. Before any pool's fee.",
  'cycles.notPaid': 'not paid yet',
  'cycles.soFar': 'so far',
  'cycles.payoutsTitle': 'Each payout',
  'timing.allCycles': 'Every cycle →',
  'pools.nextInline': '{cycle}: {amount} ·',
  'pools.nextInlineHelp':
    'Staked for cycle {cycle} so far, and the change from this cycle',
  'amount.usdAbout': '≈ {usd}',
  'pools.sort.yield': 'Net yield',
  'pools.col.yield': 'Net yield',
  'pools.yieldHelp':
    "What a staker keeps in a year, in sBTC against the STX staked, at today's STX-only rate and today's fee. Every STX-only pool earns the same rate before its fee, so this is the fee said as what you keep.",
  'pools.yieldUnknown': 'No rate or STX price at the last refresh',
  'pools.bondHelp':
    "Part of this pool's stake backs a BTC bond. That part is paid from the bond share, not at the STX-only rate, so the yield here is what an STX-only staker keeps.",
  'pools.bondPlus': '+ bond share',
  'bondStake.some': '{amount} in bonds',
  'bondStake.all': 'all in bonds',
  'bondStake.part': 'Bond {index}: {amount}',
  'bondStake.partUnnamed': 'A bond: {amount}',
  'bondStake.chip': 'Bond {index} · {amount}',
  'bondStake.chipUnnamed': 'Bond · {amount}',
  'bondStake.markLabel': 'Part of this backs BTC bonds — {breakdown}',
  'pool.fact.bondNote': 'backing BTC bonds:',
  'pool.earned.bondNote':
    '{amount} of this cycle’s stake backs BTC bonds. It is paid from the bond share, which pox-5 does not break down by pool, so it is left out of the earnings and the yield above.',
  'pool.earned.allBond':
    'Everything staked here backs a BTC bond. Bond stake is paid from the bond share rather than at the STX-only rate, and pox-5 does not break that share down by pool, so there are no STX-only earnings to show.',
  'pool.members.bond': 'bond {index}',
  'pool.members.bondUnnamed': 'bond',
  'pool.members.bondHelp':
    'Registered for a BTC bond: paid from the bond share rather than at the STX-only rate.',
  'app.bonds.stxTitle': 'Every bond running in cycle {cycle}',
  'app.bonds.stxIntro':
    'Bond STX counts in a pool’s total but is paid from the bond share, not at the STX-only rate.',
  'app.bonds.stxBondCycles': 'cycles {first}–{last}',
  'app.bonds.sum.heading': 'The STX staked in cycle {cycle}',
  'app.bonds.sum.total': 'Staked in cycle {cycle}',
  'app.bonds.sum.bond': 'Backing a bond',
  'app.bonds.sum.whole': 'Total {amount}',
  'app.bonds.sum.stxOnly': 'STX-only',
  'app.bonds.stxBond': 'Bond {index}',
  'app.bonds.stxBondUnnamed': 'Bond not named in the print',
  'app.bonds.stxNone': 'No STX is registered for a bond this cycle.',
  'app.bonds.stxUnknown.one':
    '{count} pool could not be checked, so its bond stake is not counted here.',
  'app.bonds.stxUnknown.other':
    '{count} pools could not be checked, so their bond stake is not counted here.',
  'pools.phone.yield': '{percent} a year',
  'pool.fact.feeYield': '≈ {percent}% a year after the fee',
  'pool.fact.nextCloses': 'closes in {countdown}',
  'pool.earned.whereNow': 'Where the sBTC is now',
  'pool.earned.yield': 'Yield after fee',
  'pool.earned.yieldHelp':
    "What a staker keeps in a year, at today's STX-only rate, today's fee and today's STX price. Rates move every payout, so this is a guide, not a promise.",
  'pool.earned.yieldNote': "a year, at today's rate and the {fee} fee",
  'pool.earned.total': 'Earned since cycle {cycle}',
  'pool.earned.totalPlain': 'Earned',
  'pool.earned.how':
    "Worked out from the STX-only stake this contract held in each cycle — its total less any STX registered for a BTC bond — and pox-5's rewards per STX for that cycle, which is the same for every STX-only share. Before the pool's fee, because only today's fee is on file.",
  'pool.earned.beforeFee': 'before the fee',
  'pool.earned.unavailable': 'The cycle history would not load.',
  'pool.earned.none':
    'Nothing earned yet: no pox-5 payout has covered a cycle this contract held stake in.',
  'pool.earned.colEarned': 'Earned',
  'pool.earned.colKept': 'After {fee} fee',
  'pool.earned.soFar': 'so far',
  'timing.label': 'Reward cycle',
  'timing.prices': 'STX {stx} · BTC {btc}',
  'timing.pricesHelp':
    'From CoinGecko at the last refresh. Rewards are paid in sBTC and stakes are in STX; dollars are only for scale.',
  'timing.closes': 'Join cycle {next} in the next {countdown}.',
  'timing.closesWhen': 'After that, a stake counts from cycle {after}.',
  'timing.closesAt':
    'About {date}, at Bitcoin block {block}, when the prepare phase starts.',
  'timing.inPrepare': 'A stake now counts from cycle {joins}.',
  'timing.inPrepareWhen': 'Cycle {next} is fixed and starts in {countdown}.',
  'timing.soon': 'a few minutes',
  'timing.progress': 'Cycle {cycle} is {percent}% through',
  'timing.started': 'Cycle {cycle} began {date}',
  'timing.next': 'Cycle {cycle} starts {date} · block {block}',
  'timing.dh': '{d}d {h}h',
  'timing.hm': '{h}h {m}m',
  'timing.m': '{m}m',
  'pools.amountUnknown': 'unknown',
  'pools.amountNotRead': 'not read yet',
  'pools.noticeShort': '{notice} notice',
  'pools.shareHelp':
    "The share of the vote held by this pool's signer key. Contracts that share a key show the same figure, because the key is what signs.",
  'pools.shareSharedKey.one': 'one contract on this key',
  'pools.shareSharedKey.other': 'shared by {count} contracts',
  'pools.cap': 'cap {percent}%',
  'pools.capHelp':
    'A ceiling the contract enforces: the fee can never be set above it, whatever the pool decides.',
  'pools.noticeHelp':
    'How long a fee rise has to wait before it applies, which gives you time to move.',
  'pools.change.new': 'new',
  'pools.change.notYet': 'not yet',
  'pools.change.same': 'no change',
  'pools.unknownAmount': 'The last refresh could not read this amount',
  'pools.notReadYet':
    'Registered after the last refresh; the next one will read it',
  'pools.unreviewed': 'Not reviewed',
  'pools.details': 'Details',
  'pools.phone.fee': '{fee} fee',
  'pools.phone.feeElsewhere': 'fee elsewhere',
  'pools.phone.next': 'next {amount}',

  'join.anyone.short': 'Anyone',
  'join.anyone.help': 'The contract turns nobody away.',
  'join.invite.short': 'Invite only',
  'join.invite.help': 'The operator keeps a list of who may stake.',
  'join.nativePool.short': 'Via Native Pool',
  'join.nativePool.help':
    'Only staking that comes through Stacking DAO’s Native Pool is accepted. Anyone can join there.',

  'currency.btc': 'BTC',
  'currency.btc.help':
    'The contract can pay your rewards to a Bitcoin address you give it.',
  'currency.sbtc': 'sBTC',
  'currency.sbtc.help': 'Rewards arrive as sBTC on Stacks.',
  'currency.stx': 'STX',
  'currency.stx.help': 'Rewards arrive as STX.',

  'contracts.staked': '{amount} staked',
  'contracts.notice': 'Fee changes announced',

  'stake.openShort': 'Stake',
  'app.stxOnlyHistory.crumb': 'Cycles',

  'conduct.caption': 'Whether this key answers the blocks miners propose.',
  'conduct.staleTitle': 'No signing report since {at}.',
  'conduct.staleBody':
    'The last one covers cycle {cycle}, so it says nothing yet about this key in the cycles since.',

  // ---- One pool's page.
  'pool.checkStake': 'Check my stake',
  'pool.stakeElsewhere': 'Staking happens in Native Pool’s app, not here.',
  'pool.warning.highFee.title': 'The fee keeps almost all of the reward.',
  'pool.warning.highFee.body': 'It is {fee} right now.',
  'pool.warning.feeUnbounded.title': 'The fee can rise at any time.',
  'pool.warning.feeUnbounded.body':
    'There is no ceiling and no notice before a change. It is {fee} today.',
  'pool.warning.unreviewed.title': 'Nobody here has reviewed this code.',
  'pool.warning.unreviewed.body':
    'The badges are read from the source automatically, but nobody has checked what else it does.',
  'pool.section.members': 'Members',
  'pool.section.rewards': 'Rewards',
  'pool.section.signing': 'Signing',
  'pool.section.key': 'Signer key',
  'pool.section.contract': 'Contract',
  'pool.fact.fee': 'Fee now',
  'pool.fact.feeNote': 'of rewards, before you are paid',
  'pool.fact.cap': 'Fee cap',
  'pool.fact.capElsewhere': 'not visible here',
  'pool.fact.capNone': 'None',
  'pool.fact.notice': '{notice} notice before a rise',
  'pool.fact.noNotice': 'no notice before a change',
  'pool.fact.join': 'Who can join',
  'pool.fact.rewards': 'Rewards',
  'pool.fact.rewardsNote': 'what a reward arrives as',
  'pool.fact.staked': 'Staked · cycle {cycle}',
  'pool.fact.membersKey.one': '{count} member on this key',
  'pool.fact.membersKey.other': '{count} members on this key',
  'pool.fact.next': 'Cycle {cycle} so far',
  'pool.fact.nextLocked': 'locked in',
  'pool.fact.nextChange': '{change} · open to join',
  'pool.fact.nextOpen': 'open to join',
  'pool.fact.share': 'Vote share',
  'pool.fact.shareKey.one': 'of the cycle, for this key',
  'pool.fact.shareKey.other': 'for the key, across its {count} contracts',
  'pool.fact.shareCycle': 'of cycle {cycle}',
  'pool.fact.runBy': 'Run by',
  'pool.fact.runByUnknown': 'Not known',
  'pool.fact.type': 'Contract type: {name}',
  'pool.members.title': 'Members by cycle',
  'pool.members.caption': 'STX staked here in each reward cycle.',
  'pool.members.how':
    'The amounts come from pox-5. The member lists are rebuilt from pox-5’s own events and used only when they add up to the amount the chain reports.',
  'pool.members.cycle': 'Cycle',
  'pool.members.status': 'Status',
  'pool.members.staked': 'Staked',
  'pool.members.members': 'Members',
  'pool.members.membersKey': 'On the key',
  'pool.members.ended': 'ended',
  'pool.members.ofKey': 'of {total} on the key',
  'pool.members.open': 'Members',
  'pool.members.earlier.one': 'Show {count} earlier cycle',
  'pool.members.earlier.other': 'Show {count} earlier cycles',
  'pool.members.firstSeen':
    'First seen in cycle {cycle}. Earlier cycles are not listed.',
  'pool.members.onKey.one': '{count} member across the key.',
  'pool.members.onKey.other': '{count} members across the key.',
  'pool.members.inThis.one': '{count} member in this contract.',
  'pool.members.inThis.other': '{count} members in this contract.',
  'pool.members.showKey': 'Show the whole key',
  'pool.members.showThis': 'Only this contract',
  'pool.members.none': 'Nobody in this contract in this cycle.',
  'pool.rewards.caption':
    'What this contract has earned, and where the sBTC is now.',
  'pool.rewards.none':
    'This contract does not publish what it holds, so only what pox-5 still owes it can be read.',
  'pool.key.caption':
    'The key that signs for this pool, and every contract registered against it.',
  'pool.key.staked': '{amount} behind this key in cycle {cycle}.',
  'pool.contract.title': 'What the contract does',
  'pool.contract.caption': 'Read from its source code.',
  'pool.contract.more': 'More about {name}',

  // ---- Who holds the vote, and the bonds.
  'groups.chartLabel': 'Share of the vote, by group',
  'bonds.unlocked.one': '{count} more invited with nothing locked yet',
  'bonds.unlocked.other': '{count} more invited with nothing locked yet',
  'bonds.showUnlocked': 'show them',
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
