/**
 * Korean.
 *
 * Typed against the English bundle, so this file cannot drift: a key added in
 * en.ts and missed here fails the build, and a key removed there but left here
 * does too.
 */
import type { LocaleBundle } from './en';

export const ko: LocaleBundle = {
  name: '한국어',
  intlLocale: 'ko-KR',
  htmlLang: 'ko',
  ogLocale: 'ko_KR',
  amountScale: [
    // Korean counts in 억 (hundred million) and 만 (ten thousand), not in
    // millions, so the thresholds are its own rather than a translation of
    // the English ones.
    {
      min: 100_000_000,
      divisor: 100_000_000,
      decimalBelow: 10,
      unit: '{value}억 STX',
    },
    {
      min: 1_000_000,
      divisor: 10_000,
      decimalBelow: 1000,
      unit: '{value}만 STX',
    },
  ],
  profiles: {
    standard: {
      name: '스탠다드',
      summary:
        '가장 널리 쓰이는 서명자 컨트랙트입니다. 누구나 참여할 수 있고, 보상을 비트코인 주소로 받을 수 있으며, 수수료는 풀이 정합니다.',
      detail:
        '대부분의 풀이 거의 그대로 사용하는 기준 컨트랙트입니다. 초대 없이 누구나 이 컨트랙트를 쓰는 풀에 스테이킹할 수 있습니다. 스테이킹할 때 비트코인 주소를 지정하면 그 주소를 저장해 보상을 Stacks의 sBTC 대신 비트코인으로 보낼 수 있습니다. 수수료는 각 풀 운영자가 정하며 이후 변경할 수 있습니다.',
    },
    xverse: {
      name: '스탠다드 (ABI 변경)',
      summary:
        '함수 하나의 반환값만 바뀐 스탠다드 컨트랙트입니다. 누구나 참여 가능하며, 보상을 비트코인 주소로 받을 수 있습니다.',
      detail:
        'Xverse 서명자가 사용하는 빌드입니다. 사용자가 체감하는 동작은 스탠다드와 같아서 누구나 참여 가능하고 보상을 비트코인 주소로 받을 수 있습니다. 다른 것은 동작이 아니라 인터페이스입니다. 스테이커에게 지급할 때 스탠다드는 비트코인 출금 정보까지 반환하지만, 이 버전은 금액만 반환합니다. 그 반환값을 읽는 쪽은 둘 중 무엇인지 알아야 하므로 스탠다드에 합치지 않고 별도 유형으로 표시합니다.',
    },
    'invite-only': {
      name: '초대 전용',
      summary:
        '운영자가 참여 대상을 고르는 소형 서명자 컨트랙트입니다. 보상은 Stacks의 sBTC로 지급됩니다.',
      detail:
        '운영자가 관리하는 목록에 있는지 확인한 뒤에만 스테이킹을 허용하는 짧은 컨트랙트입니다. 목록에 없으면 스테이킹이 거절됩니다. 비트코인 지급 기능은 없어서 보상은 Stacks의 sBTC로 지급됩니다. 이 컨트랙트 자체에는 수수료 로직이 없지만, 그렇다고 무료라는 뜻은 아니며 수수료가 다른 곳에서 부과될 수 있습니다.',
    },
    'invite-only-v2': {
      name: '초대 전용 (비트코인 주소 포함)',
      summary:
        '운영자가 참여 대상을 고르는 소형 서명자 컨트랙트입니다. 사용자의 비트코인 주소를 받아 저장하지만 그 주소로는 아무것도 지급하지 않으며, 모든 보상은 운영자가 지정한 주소 한 곳으로 sBTC로 나갑니다.',
      detail:
        '운영자가 이 컨트랙트로 스테이킹할 수 있는 사람의 목록을 관리합니다. 목록에 없으면 스테이킹이 거절되므로, 마음먹는다고 참여할 수 있는 풀이 아닙니다. 스테이킹 허용 여부를 묻는 호출은 pox-5만 할 수 있고, 컨트랙트가 사용자에 대해 확인하는 것은 이 목록뿐입니다.\n\n스테이킹할 때 비트코인 주소를 받아 유효한지 확인한 뒤 사용자 이름 아래에 저장하며, 이 값은 누구나 읽을 수 있습니다. 그러나 컨트랙트 안에는 그 주소로 지급하는 부분이 전혀 없습니다. 사이클을 청구하면 그 사이클의 sBTC 전액이 운영자가 지정한 수령인 한 곳으로 보내지고, 개별 스테이커에게 지급하는 함수 자체가 없습니다. 저장된 주소의 용도는 읽히는 것입니다. 보상을 직접 나눠 주는 풀이라면 받아 둔 주소를 모두 확인해 비트코인을 보낼 수 있습니다. 주소를 기록하는 일은 어디로 받고 싶은지 풀에 알려 두는 것이지, 컨트랙트가 대신 해 주는 일이 아닙니다.\n\n여기서 스테이킹할 때 이해해야 할 점이 바로 그것입니다. 얼마를 받는지와 무엇으로 받는지 모두 보상이 이 컨트랙트를 떠난 뒤 풀이 정하므로, 코드가 강제하는 것이 아니라 운영자와의 합의에 달려 있습니다. 자체 수수료는 없지만 그 사실이 뜻하는 바는 다른 곳보다 적습니다. 보상이 사용자에게 오는 길에 이 컨트랙트를 거치지 않기 때문입니다.',
    },
    'native-pool': {
      name: '네이티브 풀',
      summary:
        'pox-5에 직접 스테이킹하는 대신 Native Pool 컨트랙트를 통해 참여합니다. 보상은 Stacks의 sBTC로 지급됩니다.',
      detail:
        '이 서명자는 Native Pool 컨트랙트를 통해 참여한 경우에만 스테이킹을 허용하므로, 서명자 컨트랙트에 직접 스테이킹하지 않고 Native Pool 쪽에서 가입합니다. 보상은 Stacks의 sBTC로 지급됩니다. 이 컨트랙트 자체에는 수수료 로직이 없습니다.',
    },
    'native-pool-v2': {
      name: '네이티브 풀 V2',
      summary:
        'pox-5에 직접 스테이킹하는 대신 Stacking DAO의 native-pool-v2를 통해 참여합니다. 보상은 sBTC로 지급되며, DAO가 상한이나 사전 고지 없이 언제든 바꿀 수 있는 수수료가 먼저 차감됩니다.',
      detail:
        'native-pool-v2를 통해 위임한 스테이커만 받으므로, 이 컨트랙트가 아니라 Native Pool 쪽에서 가입합니다. 청구되는 모든 보상에는 먼저 이 컨트랙트의 수수료가 부과되며, 수수료는 Stacking DAO 프로토콜이 지정한 수령인에게 보내집니다. DAO는 이 수수료를 언제든 100% 미만의 어떤 값으로도 바꿀 수 있습니다. 컨트랙트에는 상한도 사전 고지 기간도 없습니다.\n\n나머지 보상은 native-pool-v2에서 고른 방식에 따라 두 가지 중 하나로 받습니다. 직접 모드에서는 직접 청구하고 sBTC가 바로 지갑으로 들어옵니다. 스트리밍 모드에서는 키퍼가 대신 청구해 native-reward-streamer-v2에 적립하므로, 이 모드에서는 스트리머 컨트랙트와 키퍼도 신뢰해야 합니다.',
    },
    'capped-fee-blocklist': {
      name: '수수료 상한 (제재 목록 포함)',
      summary:
        '제재 목록과 수수료 할인이 추가된 수수료 상한 컨트랙트입니다. 목록에 없는 사람은 누구나 참여할 수 있고, 보상은 비트코인 또는 sBTC로 받으며, 수수료는 5%를 넘지 않습니다.',
      detail:
        '수수료 상한 컨트랙트에 규칙을 더한 것입니다. 본인이나 지정한 비트코인 주소가 풀의 제재 목록에 없다면 누구나 스테이킹할 수 있습니다. 이 목록은 배포 시 미국 OFAC 목록으로 채워졌습니다. 보상은 비트코인 주소로 가거나 Stacks의 sBTC로 지급되며, 언제나 본인에게만 갑니다.\n\n수수료는 5%를 넘을 수 없습니다. 컨트랙트가 계산 결과를 그 값으로 제한합니다. 더 낮을 수는 있습니다. 오래 머물거나 많이 스테이킹한 사람은 할인을 받고, 운영자 서버가 개별 스테이커에게 추가 할인을 줄 수 있으며, 어느 경우에도 운영자가 정한 하한보다 낮아지지는 않습니다. 하한이나 할인 설정을 올리면 두 보상 사이클 뒤에, 내리면 한 사이클 뒤에 적용됩니다.\n\n운영자는 지급에 앞서 목록을 확인할 수 있도록 먼저 처리할 시간을 갖습니다. 보상을 청구할 수 있게 된 뒤 약 3일 동안은 운영자만 보상을 받아올 수 있고, 약 일주일 동안은 운영자만 지급할 수 있습니다. 그 뒤에는 본인을 포함해 누구나 할 수 있습니다.\n\n스테이킹 전에 이해해야 할 것은 이 목록입니다. 풀의 자동화 키는 누구든 즉시 목록에 추가할 수 있고, 목록에서 빼는 것은 관리자만 할 수 있으며 하루를 기다려야 합니다. 보상이 정산될 때 목록에 올라 있으면 보상은 지급되지 않고 컨트랙트에 보관됩니다. 운영자는 나중에 이를 본인에게 풀어 주거나, 대기 기간이 지난 뒤 미리 승인한 주소로 다른 사람에게 보낼 수 있습니다. 모든 단계는 체인에 기록됩니다.',
    },
    'juice-pool-stx-payout': {
      name: '주스 풀 (STX 지급)',
      summary:
        '누구나 참여할 수 있습니다. 풀이 sBTC 보상을 STX로 바꿔 STX로 지급하며, 수수료는 최대 5%이고 처음 210만 STX는 수수료가 없습니다.',
      detail:
        '초대나 최소 금액 없이 누구나 스테이킹할 수 있고, 운영자는 신규 스테이킹을 일시 중지할 수 있습니다. 컨트랙트 이름과 달리 보상은 sBTC로 오지 않습니다. 풀이 보상을 스왑 컨트랙트로 보내 STX로 바꾼 뒤, 각 스테이커에게 지분만큼 STX로 지급합니다. 각 단계는 누구나 실행할 수 있어서 지급이 운영자를 기다리지 않습니다. 스왑이 멈추면 되돌릴 수 있으며, 이때 스테이커는 일부는 STX, 일부는 sBTC로 받습니다.\n\n수수료는 4.5%이고 5%를 넘을 수 없습니다. 변경하려면 먼저 제안하고 최소 하루 뒤에 확정해야 합니다. 수수료는 스테이킹 금액 중 수수료 면제 자리를 넘는 부분에만 부과됩니다. 면제 자리는 210만 STX가 찰 때까지 선착순으로 자동 배정되며, 스테이킹을 유지하는 동안 계속 유지됩니다. 운영자는 이를 빼앗을 수 없고 총량을 늘릴 수만 있습니다.\n\n운영자는 스테이킹된 자금을 옮기거나 지급을 다른 곳으로 돌릴 수 없습니다. 운영자가 정하는 것은 스왑입니다. 슬리피지와 사용할 거래소를 정하고, 약 4주 전에 알린 뒤 다른 스왑 컨트랙트로 바꿀 수 있습니다. 받는 STX의 양은 그 컨트랙트와 설정에 달려 있으며, 이 페이지는 그 부분을 검토하지 않았습니다.',
    },
    'capped-fee': {
      name: '수수료 상한',
      summary:
        '누구나 참여 가능하고 보상을 비트코인 주소로 받을 수 있으며, 수수료는 절대 5%를 넘지 못합니다. 인상 전에는 약 한 달의 사전 고지가 필요합니다.',
      detail:
        '초대 없이 누구나 참여할 수 있으며, 보상은 Stacks의 sBTC 또는 비트코인 주소로 받을 수 있습니다. 사용자 관점의 핵심은 수수료 규칙입니다. 운영자가 어떻게 하든 컨트랙트가 더 높은 값을 거부하므로 수수료는 5%를 넘을 수 없습니다. 수수료 인상은 약 두 보상 사이클(약 한 달) 전에 미리 예약되어야 적용되며, 인하는 즉시 적용됩니다. 비트코인 보상 주소와 최소 지급 금액도 변경할 수 있습니다.',
    },
    'juice-pool': {
      name: '주스 풀',
      summary:
        '누구나 참여 가능하며 보상은 Stacks의 sBTC로 지급됩니다. 수수료 변경은 사전 공지 후 적용되고, 풀이 OG로 지정한 스테이커는 수수료를 내지 않습니다.',
      detail:
        '초대 없이 누구나 참여할 수 있습니다. 보상은 비트코인 주소가 아니라 Stacks의 sBTC로 지급됩니다. 특징은 두 가지입니다. 운영자가 신규 스테이킹을 일시 중지할 수 있고, 수수료 변경은 먼저 제안하고 다음 단계에서 확정해야 하므로 예고 없이 바로 바뀌지 않습니다. 또한 컨트랙트에는 OG 스테이커 목록이 있어, 목록에 있는 사용자는 일반 수수료가 얼마든 수수료가 0입니다. 다만 이 목록은 풀이 결정하고 다시 변경할 수 있으므로, OG 혜택은 컨트랙트가 보장하는 권리라기보다 풀이 제공하는 할인에 가깝습니다.',
    },
  },
  messages: {
    'meta.title': 'Signer Guide - STX를 어디에 스테이킹할 수 있나요?',
    'meta.description':
      'STX를 스테이킹할 수 있는 Stacks 서명자 풀을 쉽게 설명하는 가이드입니다.',
    'meta.ogTitle': 'Signer Guide - STX를 어디에 스테이킹할 수 있나요?',
    'meta.ogDescription':
      'STX를 스테이킹할 수 있는 Stacks 서명자 풀을 쉽게 설명하는 가이드입니다. 수수료, 상한, 참여 조건을 각 컨트랙트 코드에서 직접 읽어 보여줍니다.',

    'app.heading': '내 STX를 어디에 스테이킹할 수 있을까?',
    'app.intro':
      '스테이킹할 때는 내 자산을 맡길 풀을 고르게 됩니다. 지금 선택 가능한 풀은 {pools}지만, 실제로는 {contracts}만 사용합니다. 그래서 겉보기보다 확인할 내용이 적습니다.',
    'app.introPools': '{count}개',
    'app.introContracts': '{count}개의 서명자 컨트랙트',
    'app.staked':
      '합쳐서 현재 {amount}를 {cycle} 사이클 기준으로 맡고 있습니다.',
    'app.stakedNext':
      '{cycle} 사이클은 아직 채워지는 중입니다. 지금까지 {amount}가 맡겨졌습니다.',
    'app.stakedNextLocked':
      '{cycle} 사이클은 확정되었습니다. {amount}가 확정되었으며 더 이상 참여할 수 없습니다.',
    'app.contractsHeading': '서명자 컨트랙트',
    'app.contractsIntro':
      '컨트랙트마다 동작이 다릅니다. 컨트랙트를 눌러 어떤 기능인지, 누가 운영하는지 확인하세요.',
    'app.archivedHeading': '보관된 컨트랙트',
    'app.archivedIntro':
      '운영자가 교체한 코드입니다. 아직 이 코드를 쓰는 풀은 아래 목록과 이 페이지의 집계에서 빠져 있습니다. 실제로 존재하는 풀이고 각 페이지에는 모든 정보가 그대로 있지만, 지금 새로 고를 만한 대상은 아닙니다.',
    'app.poolCount.one': '풀 {count}개',
    'app.poolCount.other': '풀 {count}개',
    'app.lastUpdate': '마지막 업데이트: {at}',
    'app.refreshNote': '수수료와 금액은 매시간 체인에서 다시 읽습니다.',
    'app.savedCopy':
      '기기에 저장된 마지막 사본입니다. 최신 데이터를 가져오지 못했습니다.',
    'app.updateReady': '앱의 새 버전이 준비되었습니다.',
    'app.updateApply': '새로고침',
    'app.newsletter': '뉴스레터 구독',
    'app.by': '제작:',
    'app.stxOnlyEstimate.title':
      'STX 전용 스테이커의 다음 분배 사이클 예상 보상',
    'app.stxOnlyEstimate.intro':
      '지난 지급 이후 pox-5에 새로 들어온 sBTC에서 본드 보유자 몫과 재단 몫(15%)을 뺀 뒤, 현재 분배 사이클 진행도(총 1050블록)로 분배 사이클 전체를 추정하고, STX 전용 스테이킹(전체 스테이킹에서 본드에 등록된 STX를 뺀 것)으로 나눈 값입니다. pox-5의 잔액이 아니라 새로 들어온 금액을 씁니다. 잔액에는 이미 확정되었지만 아직 청구하지 않은 보상도 섞여 있기 때문입니다. 다만 몇 블록치 입금만으로 환산하면 오차가 크므로, 이번 분배 사이클 진행분은 진행한 만큼만 반영하고 나머지는 pox-5가 이미 확정한 직전 지급 실적으로 채웁니다.',
    'app.stxOnlyEstimate.loading': '체인 데이터로 예상치를 계산하는 중…',
    'app.stxOnlyEstimate.unavailable':
      '지금은 이 예상치를 계산할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    'app.stxOnlyEstimate.accrued': '지난 지급 이후 들어온 sBTC',
    'app.stxOnlyEstimate.bondShare': '현재까지 본드 보유자 몫',
    'app.stxOnlyEstimate.foundationShare': '재단 몫 (15%)',
    'app.stxOnlyEstimate.stxOnlySoFar': '현재까지 STX 전용 몫',
    'app.stxOnlyEstimate.progressLabel': '분배 사이클 진행도',
    'app.stxOnlyEstimate.progress':
      '이번 분배 사이클 {total}블록 중 {now}블록 기준으로 환산',
    'app.stxOnlyEstimate.projectedLabel': '분배 사이클 전체 예상치',
    'app.stxOnlyEstimate.projected': '분배 사이클 전체 예상치: {amount}',
    'app.stxOnlyEstimate.stxOnlyStaked': 'STX 전용 참여자의 스테이킹 총량',
    'app.stxOnlyEstimate.lastPayout': '직전 지급 실적',
    'app.stxOnlyEstimate.lastPayoutAt': '직전 지급 실적 ({at})',
    'app.stxOnlyEstimate.projectedRate': '이번 분배 사이클 진행분 환산',
    'app.stxOnlyEstimate.rate': '이번 분배 사이클 비율',
    'app.stxOnlyEstimate.rateBlend':
      '현재 기준: 이번 사이클 자체 수치는 {total}블록 중 {now}블록만큼 반영되고, 나머지 {rest}블록은 직전 지급이 실제로 지급한 금액으로 채웁니다.',
    'app.stxOnlyEstimate.rateBlendLink': '계산 방법 보기',
    'app.stxOnlyEstimate.rateValue': 'STX 1000개당 {sats} sats',
    'app.stxOnlyEstimate.satsShort': '{sats} sats',
    'app.stxOnlyEstimate.gridApy': '연환산',
    'app.stxOnlyEstimate.gridLast': '직전 지급',
    'app.stxOnlyEstimate.gridUnknown': '알 수 없음',
    'app.stxOnlyEstimate.apy': '이 비율 기준 APY (연 50회 분배 사이클)',
    'app.stxOnlyEstimate.apyValue': '약 {apy}',
    'app.stxOnlyEstimate.apyUnavailable': '지금은 APY를 계산할 수 없습니다',
    'app.stxOnlyEstimate.stxPrice': 'STX 가격 (CoinGecko)',
    'app.stxOnlyEstimate.priceValue': '약 {sats} sats',
    'app.stxOnlyEstimate.priceUnavailable': '지금은 가격을 가져올 수 없습니다',
    'app.stxOnlyEstimate.untilPayoutAsOf':
      '예상 지급까지 약 {duration} ({blocks}블록 남음, 기준 시각: {at})',
    'app.stxOnlyEstimate.weeklyLead':
      '주간 용돈처럼, STX 1000개 기준 이번 분배 사이클에서 더해질 수 있는 값:',
    'app.stxOnlyEstimate.weeklyApy': '연환산 APY: {apy}',
    'app.stxOnlyEstimate.weeklyProgress': '분배 사이클 진행도',
    'app.stxOnlyEstimate.weeklyBlocksAsOf':
      '{blocks}블록 남음 ({duration}), 기준 시각: {at}',
    'app.stxOnlyEstimate.weeklyEstimateNote':
      '최신 분배 사이클 데이터를 바탕으로 한 추정치 1회입니다.',
    'app.stxOnlyEstimate.homeSentence':
      '현재 분배 사이클 기준 STX 전용 스테이커의 보상은 대략 {rate} ({apy} APY)입니다. {link}',
    'app.stxOnlyEstimate.untilNextRewards': '다음 보상까지',
    'app.stxOnlyEstimate.untilNextDate':
      '예상까지 약 {duration} (예상 시각: {at})',
    'app.stxOnlyEstimate.untilNextHeights':
      '남은 번 블록 {blocks}개: {current} -> {next} (기준: {asOf})',
    'app.stxOnlyEstimate.asOfUnknown': '최근 업데이트',
    'app.stxOnlyEstimate.durationHours.one': '{count}시간',
    'app.stxOnlyEstimate.durationHours.other': '{count}시간',
    'app.stxOnlyEstimate.durationDays.one': '{count}일',
    'app.stxOnlyEstimate.durationDays.other': '{count}일',
    'app.stxOnlyEstimate.openFull': '전체 계산 보기',
    'app.stxOnlyEstimate.openHistory': '지금까지 분배별 지급 내역',
    'app.stxOnlyHistory.back': '← 보상 추정으로 돌아가기',
    'app.stxOnlyHistory.title': '모든 사이클과 지급 내역',
    'app.stxOnlyHistory.intro':
      '보상은 분배 사이클마다 계산되고 보상 사이클 하나에는 분배 사이클이 두 번 있으므로, 각 보상 사이클은 두 번에 나누어 지급됩니다. 아래는 추정이 아니라 실제로 지급된 비율로, pox-5가 스테이킹된 1000 STX당 적립한 금액입니다.',
    'app.stxOnlyHistory.loading': '지급 내역을 불러오는 중…',
    'app.stxOnlyHistory.none':
      '아직 기록된 분배가 없습니다. 분배 사이클이 한 번 지급되면 여기에 표시됩니다.',
    'app.stxOnlyHistory.failed':
      '지급 내역을 가져오지 못했습니다. 잠시 후 다시 시도하세요.',
    'app.stxOnlyHistory.cycle': '{cycle} 사이클',
    'app.stxOnlyHistory.cycleTotal': '보상 사이클 합계',
    'app.stxOnlyHistory.stillPaying': '진행 중 — 두 번 중 한 번 지급',
    'app.stxOnlyHistory.firstHalf': '전반',
    'app.stxOnlyHistory.secondHalf': '후반',
    'app.stxOnlyHistory.atHeight': '번 높이 {height}',
    'app.stxOnlyHistory.rateUnknown': '알 수 없음',
    'app.stxOnlyHistory.note':
      "보상 사이클 합계는 두 번의 지급액을 더한 값이 아니라 pox-5가 해당 사이클에 적립한 값에서 가져옵니다. 각 지급액은 개별적으로 1사토시 단위로 내림되기 때문입니다. 두 지급 사이에 갱신이 실행되지 않으면 전반 지급액은 '알 수 없음'으로 표시됩니다. 두 번을 구분할 수 있는 시점은 그때뿐입니다.",
    'bonds.open': '본드 현황',
    'app.bonds.back': '← 전체 풀',
    'app.bonds.title': '본드에 들어 있는 비트코인',
    'app.bonds.intro':
      '초대받은 스테이커는 스테이킹하는 STX와 함께 비트코인을 — Stacks의 sBTC로, 또는 비트코인 체인에 직접 — {length} 사이클 동안 잠급니다. 새 본드는 {gap} 사이클마다 열립니다.',
    'app.bonds.loading': '본드를 불러오는 중…',
    'app.bonds.none':
      '아직 본드 기록이 없습니다. 시간단위 갱신이 읽어오면 여기에 표시됩니다.',
    'app.bonds.failed':
      '본드 정보를 가져오지 못했습니다. 잠시 후 다시 시도하세요.',
    'app.bonds.current': '현재 본드 기간',
    'app.bonds.next': '다음 본드 기간',
    'app.bonds.period': '본드 {index} · {first}–{last} 사이클',
    'app.bonds.notSetUp':
      '이 기간에는 본드가 설정되지 않았습니다. 본드 관리자는 기간이 열리기 전 두 사이클 안에서만 본드를 설정할 수 있습니다.',
    'app.bonds.closed':
      '신규 등록이 마감되었습니다. 아래 잠긴 금액으로 번 높이 {height}에 시작됩니다.',
    'app.bonds.wentUnused': '미사용',
    'app.bonds.lockedFinal': '잠긴 금액',
    'app.bonds.locked': '지금까지 잠긴 금액',
    'app.bonds.stillOpen': '남은 여유',
    'app.bonds.split': 'sBTC {sbtc} · 비트코인 체인 {l1}',
    'app.bonds.ceiling': '상한',
    'app.bonds.invited.one': '초대된 스테이커 {count}명',
    'app.bonds.invited.other': '초대된 스테이커 {count}명',
    'app.bonds.opensAt': '번 높이 {height}에 열립니다.',
    'app.bonds.running': '번 높이 {height}부터 열려 있습니다.',
    'app.bonds.incomplete':
      '아래 허용 목록이 불완전합니다. 항목의 합계가 pox-5가 말하는 본드 총액과 맞지 않으므로 상한은 “최소 이 정도”로 읽어야 합니다. pox-5는 허용 목록을 조회해 주지 않아 setup-bond 트랜잭션에서 복원하는데, 일부를 찾지 못했습니다.',
    'app.bonds.who': '초대된 스테이커',
    'app.bonds.ofCeiling': '/ {ceiling}',
    'app.bonds.notLockedYet': '아직 잠긴 금액 없음',
    'app.bonds.onL1': '비트코인 체인',
    'app.bonds.asSbtc': 'sBTC',
    'app.bonds.throughPool': '{pool} 통해',
    'app.bonds.note':
      '상한은 본드를 만들 때 정한, 스테이커가 잠글 수 있는 최대 금액이고, 잠긴 금액은 실제로 낸 금액입니다. {at}에 pox-5에서 읽었습니다.',
    'app.stxOnlyEstimate.back': '← 전체 풀',
    'app.stxOnlyEstimate.note':
      '참고용 예상치입니다. 지난 지급 이후 pox-5에 들어온 금액과 현재 분배 사이클 진행도에 따라 달라지며, 사이클이 진행될수록 안정됩니다.',
    'app.stxOnlyEstimate.generatedAt': '생성 시각: {at}',
    'app.stxOnlyFaq.title': '이 비율은 어떻게 계산되나요',
    'app.stxOnlyFaq.q.threeRates': '이 페이지에 비율이 왜 세 개인가요?',
    'app.stxOnlyFaq.a.threeRates':
      '하나는 확정된 사실이고 나머지 둘은 아닙니다. 직전 지급 실적은 pox-5가 이미 적립을 마친 확정치입니다. 이번 분배 사이클 진행분 환산은 지금까지 쌓인 금액을 사이클 전체 길이로 늘린 값이라, 사이클 후반에는 쓸 만하지만 지급 직후에는 번 블록 몇 개가 일주일을 대신하므로 편차가 큽니다. 여기 공개하는 비율은 이 둘을 사이클 진행도에 따라 가중 평균한 값이어서, 실제로 지급된 금액에서 출발해 근거가 쌓이는 만큼 이번 사이클 쪽으로 옮겨 갑니다.',
    'app.stxOnlyFaq.q.blend':
      '그러면 공개 비율은 왜 둘 중 어느 값과도 다른가요?',
    'app.stxOnlyFaq.a.blend':
      '둘을 사이클 진행도만큼 섞은 값이기 때문입니다. 사이클 초반에는 직전 지급 실적에 가깝고, 사이클이 끝날 무렵에는 거의 이번 사이클 자체 수치가 됩니다.',
    'app.stxOnlyFaq.q.sats': 'sats는 어디에서 오나요?',
    'app.stxOnlyFaq.a.sats':
      '직전 지급 이후 pox-5에 들어왔고 아직 누구에게도 배정되지 않은 금액에서 옵니다. 잔액이 아니라 컨트랙트의 get-new-rewards 값입니다. 잔액에는 이미 확정되었지만 아직 청구되지 않은 보상도 섞여 있기 때문입니다. 여기서 본드 보유자 몫을 먼저 빼고, 남은 금액의 15%를 재단 몫으로 뺀 뒤, 나머지를 본드가 없는 풀에 스테이킹된 STX로 나눕니다.',
    'app.stxOnlyFaq.q.distributionCycle': '분배 사이클이 무엇인가요?',
    'app.stxOnlyFaq.a.distributionCycle':
      '번 블록 1050개입니다. 보상 사이클의 절반이며 약 7.3일입니다. pox-5는 분배 사이클이 끝날 때마다 보상을 계산하므로, 보상 사이클 하나는 한 번이 아니라 두 번에 나누어 지급됩니다.',
    'app.stxOnlyFaq.q.fifty': '왜 연 52회가 아니라 50회인가요?',
    'app.stxOnlyFaq.a.fifty':
      '7.3일은 일주일이 아니기 때문입니다. 1년에는 분배 사이클이 50.1회 들어가고, pox-5도 같은 방식으로 50으로 나누어 연환산합니다. 주간 비율을 52번 복리로 계산하면 APY가 약 4% 부풀려집니다.',
    'app.stxOnlyFaq.q.promise': '여기 있는 수치가 보장되나요?',
    'app.stxOnlyFaq.a.promise':
      '아닙니다. 이 페이지에서 확정된 값은 직전 지급 실적뿐이며, 기록된 모든 지급은 지급 내역 페이지에 있습니다. 나머지는 pox-5에 들어오는 금액과 거기에 스테이킹된 STX 총량에 따라 움직이고, APY는 STX 가격에 따라서도 달라집니다.',
    'app.allPools': '전체 풀',
    'app.whatMatters': '어떤 기준이 중요한가요?',
    'app.showingAll': '전체 {total}개 풀 표시 중',
    'app.showingSome': '{total}개 중 {shown}개 풀이 조건과 일치',
    'app.noMatch':
      '선택한 조건을 모두 만족하는 풀이 없습니다. 조건을 하나 꺼보세요.',
    'app.footer.feesTitle': '수수료 안내.',
    'app.footer.fees':
      '표시된 수수료는 각 풀의 컨트랙트에서 읽은 현재 적용 값입니다. 대부분의 풀은 수수료를 고정하지 않기 때문에 나중에 바꿀 수 있습니다. 일부 컨트랙트는 코드로 상한을 두며, 이런 경우 {capped} 배지가 붙습니다. 또 더 적은 일부는 수수료 변경 전에 대기 기간을 두어 이동할 시간을 주며, 이런 경우 {notice} 배지가 붙습니다. 어떤 풀은 이 컨트랙트에 수수료 정의가 전혀 없기도 하며, 그 경우 무료라는 뜻은 아닙니다.',
    'app.footer.feesCappedBadge': '수수료 상한',
    'app.footer.feesNoticeBadge': '수수료 변경 사전 공지',
    'app.footer.trustLink': 'GitHub에서 코드 보기',
    'footer.sections': '모든 섹션',
    'footer.data': '데이터는 {at}에 체인에서 읽었으며 매시간 갱신됩니다.',
    'footer.code': 'GitHub의 코드',
    'footer.madeBy': 'Fast Pool 제작',
    'footer.disclosure':
      '이 중 일부 풀을 운영하며, 다른 풀과 똑같이 표시됩니다',

    'filter.inUse.label': '실제로 사용 중',
    'filter.inUse.help':
      '이번 사이클, 지난 사이클, 지금 채워지는 사이클 모두 스테이킹이 없는 풀을 숨깁니다. 가이드가 최근에 처음 확인한 풀은 계속 표시됩니다. 이번 주에 등록된 풀은 그 전에 확정된 사이클에 들어갈 수 없기 때문입니다.',
    'filter.bitcoin.label': '보상은 비트코인으로',
    'filter.bitcoin.help':
      'Stacks의 sBTC 대신 비트코인 주소로 보상을 받습니다.',
    'filter.lowFee.label': '낮은 수수료 (5% 미만)',
    'filter.lowFee.help':
      '현재 풀 수수료가 5% 미만입니다. 수수료는 이후 변경될 수 있습니다.',
    'filter.cappedFee.label': '수수료 상한 20%',
    'filter.cappedFee.help':
      '풀 운영자가 무엇을 결정하든 컨트랙트가 수수료를 20% 초과로 올리지 못하게 막습니다.',
    'filter.highFee.label': '수수료 95% 이상',
    'filter.highFee.help':
      '위 필터들과 정반대이며, 그래서 여기 있습니다. 이 풀들은 대신 벌어 준 보상을 사실상 전부 가져갑니다. 현재 네 곳이 99.99%를 부과하고 있고, 그 컨트랙트에는 이를 막는 장치가 없습니다.',
    'filter.feeNotice.label': '수수료 변경 사전 공지',
    'filter.feeNotice.help':
      '수수료 변경이 즉시 적용되지 않고 대기 기간이 있어, 확인하고 이동할 시간이 생깁니다.',
    'filter.open.label': '누구나 참여 가능',
    'filter.open.help':
      '초대나 회원 자격 없이 누구나 이 풀에 스테이킹할 수 있습니다.',

    'badge.new': '신규',
    'badge.anyoneCanJoin': '누구나 참여 가능',
    'badge.inviteOnly': '초대 전용',
    'badge.archived': '보관된 컨트랙트',
    'badge.bitcoinRewards': '보상은 비트코인으로',
    'badge.bitcoinViaPool': '비트코인은 풀을 통해',
    'badge.sbtcRewards': '보상은 sBTC로',
    'badge.fee': '수수료: {fee}',
    'badge.feeCapped': '수수료 상한 {percent}%',
    'badge.feeNotice': '수수료 변경은 {notice} 전에 공지',
    'badge.feeExemption': '일부 스테이커는 수수료 면제',

    'fee.notSet': '이 컨트랙트에는 수수료가 설정되어 있지 않습니다',
    'fee.none': '현재 수수료 없음',
    'fee.current': '현재 {percent}%',

    'notice.hour.one': '약 1시간',
    'notice.hour.other': '약 {count}시간',
    'notice.day.one': '약 1일',
    'notice.day.other': '약 {count}일',
    'notice.twoWeeks': '약 2주',
    'notice.month.one': '약 1개월',
    'notice.month.other': '약 {count}개월',

    'amount.unknown': '금액 확인 불가',
    'amount.none': '아직 스테이킹 없음',
    'amount.plain': '{value} STX',
    'amount.nothing': '없음',
    'amount.sats': '{value} sats',
    'amount.sbtc': '{value} sBTC',
    'amount.btc': '{value} BTC',

    'signer.runsContract': '다음 서명자 컨트랙트를 사용합니다: {link}',
    'signer.contractLink': '{name} 서명자 컨트랙트',
    'signer.notReviewed': '이 풀의 코드는 아직 검토되지 않았습니다',
    'signer.stakedHere': '이 풀에 스테이킹됨',
    'signer.showDetails': '자세한 내용 보기',
    'signer.hideDetails': '자세한 내용 숨기기',
    'signer.customCalls': '이 서명자는 맞춤형 컨트랙트 호출을 사용합니다.',
    'signer.contract': '컨트랙트',
    'signer.signerKey': '서명자 키',
    'signer.notAvailable': '정보 없음',
    'signer.fingerprint': '코드 지문',
    'signer.fingerprintNote': '이 지문이 같은 풀은 같은 코드를 실행합니다.',
    'signer.identicon': '코드 아이콘',
    'signer.identiconNote':
      '주소가 아니라 코드에서 생성됩니다. 그래서 같은 컨트랙트를 두 번 배포해도, 이 페이지와 {link}을 따르는 다른 앱에서 같은 아이콘이 표시됩니다.',

    'identicon.label': '이 풀이 실행하는 코드의 아이콘',
    'identicon.newLabel': '새로운 코드 — 아직 아이콘이 없습니다',
    'identicon.sip': '아이덴티콘 표준',

    'name.confirmed': '확인된 이름 — 이 풀이 실제로 쓰는 이름입니다',
    'name.fromContract':
      '컨트랙트 이름에서 읽은 이름이며, 풀이 확인해 준 것은 아닙니다',

    'contract.back': '← 모든 서명자 컨트랙트',
    'contract.heading': '{name} 서명자 컨트랙트',
    'contract.poolsRunning.one': '이 컨트랙트를 실행하는 풀은 1곳입니다',
    'contract.poolsRunning.other':
      '이 컨트랙트를 실행하는 풀은 {count}곳입니다',
    'contract.sameCode':
      '모두 같은 코드를 실행하므로 동작은 같습니다. 다른 점은 운영 주체와 수수료입니다.',
    'contract.stakedTotal': ' 합쳐서 현재 {amount}를 맡고 있습니다.',
    'contract.howWeChecked': '검토 방식',
    'contract.fingerprint': '코드 지문',
    'contract.fingerprintNote':
      '위 모든 풀의 해시가 이 값과 같기 때문에 같은 코드를 실행한다는 것을 알 수 있습니다.',
    'contract.identicon': '코드 아이콘',
    'contract.identiconNote':
      '위의 모든 풀이 표시하는 아이콘입니다. 코드 자체에서 생성되므로 {link}을 따르는 앱은 같은 아이콘을 그립니다. 이 컨트랙트를 실행한다면서 다른 아이콘을 표시하는 풀은 실제로 이 컨트랙트를 실행하는 것이 아닙니다.',
    'contract.identiconMajority.one':
      '위 {total}개 풀 가운데 {sharing}개가 표시하는 아이콘입니다. 1개는 표시하지 않습니다 — 주석이 다르거나, 아직 아이콘이 만들어지지 않았기 때문입니다. 어느 쪽도 다른 컨트랙트라는 뜻은 아닙니다. 그것을 확인하는 것은 위의 코드 지문이며, 지문은 주석을 무시하지만 {link}은 무시하지 않습니다.',
    'contract.identiconMajority.other':
      '위 {total}개 풀 가운데 {sharing}개가 표시하는 아이콘입니다. {count}개는 표시하지 않습니다 — 주석이 다르거나, 아직 아이콘이 만들어지지 않았기 때문입니다. 어느 쪽도 다른 컨트랙트라는 뜻은 아닙니다. 그것을 확인하는 것은 위의 코드 지문이며, 지문은 주석을 무시하지만 {link}은 무시하지 않습니다.',
    'contract.whoMayJoin': '참여 가능 대상',
    'contract.whoMayJoinEvidence':
      '다음 조건이 성립하지 않으면 스테이킹이 거절됩니다: {code}',
    'contract.whoMayJoinNone':
      '컨트랙트에 참여자를 제한하는 검사 코드가 없어 누구도 배제되지 않습니다.',
    'contract.feeCeiling': '수수료 상한',
    'contract.feeCeilingEvidence':
      '컨트랙트가 더 높은 수수료를 거부합니다: {code}',
    'contract.feeCeilingNone':
      '의미 있는 상한을 두는 코드가 없으므로 풀은 수수료를 임의로 정할 수 있습니다.',
    'contract.exempt': '수수료를 내지 않는 스테이커',
    'contract.exemptEvidence':
      '일부 스테이커는 설정된 수수료와 관계없이 0%가 적용됩니다: {code} {source}',
    'contract.exemptOperator':
      '대상 목록은 “{source}”에 저장되며 풀이 직접 쓰기 때문에, 누가 면제인지 풀에서 정하고 바꿀 수 있습니다.',
    'contract.exemptFixed':
      '대상 목록은 “{source}”에 저장되며, 이를 쓰는 공개 함수가 없습니다.',
    'contract.exemptNone':
      '모든 스테이커가 같은 수수료를 내며, 컨트랙트에 예외 규칙이 없습니다.',
    'contract.notice': '수수료 변경 사전 고지',
    'contract.noticeEvidence':
      '새 수수료는 먼저 공지된 뒤 {amount} {unit}({human})이 지나야 적용됩니다: {code}',
    'contract.noticeUnit.cycles': '보상 사이클',
    'contract.noticeUnit.blocks': '비트코인 블록',
    'contract.noticeNone':
      '새 수수료는 사전 고지 없이 풀에서 설정 즉시 적용될 수 있습니다.',
    'contract.bitcoin': '비트코인 보상',
    'contract.bitcoinEvidence': '사용자의 비트코인 주소를 기록합니다: {code}',
    'contract.bitcoinViaPool':
      '사용자의 비트코인 주소를 기록하지만({code}) 그 주소로는 지급하지 않습니다. 모든 보상은 sBTC로, 운영자가 지정한 수령인 한 곳으로 나갑니다. 주소는 누구나 읽을 수 있으므로 스테이커에게 직접 분배하는 풀이라면 이를 보고 비트코인으로 지급할 수 있습니다. 다만 그것은 컨트랙트가 아니라 풀이 하는 일이며, 이 페이지는 실제로 그렇게 하는지 알 수 없습니다.',
    'contract.bitcoinNone':
      '컨트랙트가 비트코인 주소를 다루지 않으므로 보상은 Stacks의 sBTC로 지급됩니다.',

    'signerPage.back': '← 전체 풀',
    'signerPage.key': '서명자 키',
    'signerPage.keyNone':
      '이 풀의 서명자 키가 확인되지 않아, 다른 컨트랙트와 키를 공유하는지 알 수 없습니다.',
    'groups.open': '의결 지분은 누가 쥐고 있나',
    'groups.back': '← 전체 풀 목록',
    'groups.heading': '의결 지분은 누가 쥐고 있나',
    'groups.intro':
      '서명자 노드는 키 하나입니다. 그룹은 한 주체가 뒤에 있는 노드의 집합이며, 서명자 집합을 실제로 움직일 수 있는 쪽이 누구인지는 이 수치가 정합니다. 체인은 그것을 보여 주지 않습니다. 지분이 큰 순서입니다.',
    'groups.counts':
      '노드 {nodes}개 · 컨트랙트 {contracts}개 · {staked} 스테이킹',
    'groups.asOf': '지분은 {cycle} 사이클 기준입니다.',
    'groups.ungrouped': '그룹 없음',
    'groups.ungroupedNote':
      '여기서 아무도 그룹으로 묶지 않은 서명자들입니다. 이는 이 파일의 공백일 뿐, 그들이 서로 무관하다는 뜻은 아닙니다. 또한 키가 아니라 컨트랙트 단위로 집계하므로, 이 항목의 컨트랙트가 위 그룹이 주장하는 키 위에 있을 수도 있습니다.',
    'groups.ungroupedCounts': '컨트랙트 {contracts}개 · {staked} 스테이킹',
    'groups.sourceHeading': '이 페이지를 읽는 법',

    'group.back': '← 전체 풀 목록',
    'group.missing': '해당 그룹이 없습니다. 이름이 바뀌었을 수 있습니다.',
    'group.kind.operator': '노드를 직접 운영',
    'group.kind.stake': '스테이킹 물량을 공급',
    'group.kindNote.operator':
      '아래 노드를 모두 한 주체가 운영하므로 그 전부로 서명합니다. 따라서 아래 노드에 스테이킹된 전체가 이 주체의 가중치입니다.',
    'group.kindNote.stake':
      '아래 노드는 다른 사람들이 운영합니다. 이 주체가 통제하는 것은 표시된 컨트랙트 뒤의 STX입니다. 물량은 옮길 수 있지만, 그 물량으로 서명하는 키는 가지고 있지 않습니다.',
    'group.votingPower': '의결 지분',
    'group.votingPowerValue': '{cycle} 사이클 기준 {percent}%',
    'group.staked': '그룹 전체 스테이킹 양',
    'group.nodeCount': '서명자 노드 수',
    'group.contractCount': '서명자 컨트랙트 수',
    'group.source': '근거',
    'group.sourceNote':
      '서명자 노드를 누가 운영하는지는 체인에 기록되지 않으므로, 여기의 모든 그룹은 사람이 직접 작성한 것입니다. 아래는 이 그룹의 근거이며, 이것이 틀리면 위의 수치도 함께 틀립니다.',
    'group.site': '공식 사이트',
    'group.contracts': '그룹 구성',
    'group.contractOnly':
      '이 컨트랙트만 해당합니다. 같은 노드가 보유한 나머지는 이 그룹에 포함되지 않습니다.',
    'group.wholeNode': '이 키에 등록된 모든 컨트랙트',
    'group.unknownAmount': '알 수 없음',
    'group.nodeAnswered':
      '{cycle} 사이클에서 요청받은 블록의 {percent}%에 응답했습니다.',
    'group.nodeSilent': '{cycle} 사이클에서 단 한 건도 응답하지 않았습니다.',
    'group.alsoIn': '{names}에도 함께 집계됨',
    'group.overlapNote':
      '한 노드가 여러 그룹에 속할 수 있고, 실제로 그런 경우가 있습니다. 키를 운영하는 주체는 그 키의 모든 컨트랙트로 서명하고, 그중 한 컨트랙트에 물량을 위임한 주체는 그 컨트랙트만 통제합니다. 둘 다 동시에 참이므로 같은 STX가 두 이름 아래 나타날 수 있습니다. 이는 계산 오류가 아니라 알아 두어야 할 사실입니다.',
    'conduct.title': '채굴자 제안에 어떻게 응답하나',
    'conduct.intro':
      '가중치는 그 서명자가 얼마나 큰 발언권을 갖는지이고, 이것은 실제로 응답하는지입니다. 채굴자가 제안한 블록은 좌석을 가진 모든 서명자에게 전달되며, 각 서명자는 수락하거나 거부하거나 아무 말도 하지 않습니다. 거부는 서명자가 할 일이고, 무응답은 아닙니다.',
    'conduct.none':
      '이 키에 대한 기록이 없습니다. 좌석을 가진 적이 없는 서명자는 응답을 요청받은 적도 없습니다.',
    'conduct.rotated':
      '이 컨트랙트는 {when}({cycle} 사이클)에 서명자 키를 교체했습니다. 사이클의 서명자 집합은 사이클 시작 전에 확정되므로, 교체되기 전의 키가 다음 집합이 정해질 때까지 좌석과 그 결과를 그대로 유지합니다.',
    'conduct.oldKeyNote':
      '이 사이클의 좌석을 실제로 가진 것은 교체되기 전의 키이므로 그 키의 기록입니다. 새 키는 다음 집합이 정해질 때까지 아무것도 보유하지 않습니다.',
    'conduct.cycleOpen': '{cycle} 사이클, 진행 중',
    'conduct.cycleClosed': '{cycle} 사이클',
    'conduct.answeredNote':
      '제안 {proposals}건 중 {answered}건에 응답했습니다 — {label}.',
    'conduct.neverAnswered': '응답 없음',
    'conduct.neverAnsweredNote':
      '{cycle} 사이클에서 블록 {proposals}건을 요청받았지만 한 건도 응답하지 않았습니다. 이 키로부터 확인된 신호가 전혀 없습니다.',
    'conduct.response': '평균 응답 시간',
    'conduct.seconds': '{seconds}초',
    'conduct.responseMiddle':
      '{cycle} 사이클 서명자 집합의 중앙값은 {seconds}초입니다.',
    'conduct.agreed': '응답 중 수락 비율',
    'conduct.agreedNote':
      '나머지는 읽고 거부한 것이며, 그것이 서명자의 역할입니다. 이 값이 낮으면 확인해 볼 만하지만, 아예 응답하지 않은 것과는 다릅니다.',
    'conduct.unknown': '알 수 없음',
    'conduct.showHistory': '사이클별 기록 보기',
    'conduct.hideHistory': '기록 접기',
    'conduct.loading': '이 키의 기록을 읽는 중…',
    'conduct.noHistory': '이 키에 대한 사이클 기록이 아직 없습니다.',
    'conduct.failed':
      '불러오지 못했습니다. 파일 하나일 뿐이며 이 페이지의 나머지는 영향을 받지 않습니다.',
    'conduct.soFar': '진행 중',
    'conduct.th.cycle': '사이클',
    'conduct.th.answered': '응답률',
    'conduct.th.response': '응답 시간',
    'conduct.th.weight': '가중치',
    'conduct.source':
      'Hiro의 signer-metrics API가 제안과 응답을 관찰해 집계한 수치입니다. 이 가이드가 체인에서 직접 읽어낼 수 있는 값이 아니라 제3자의 관측입니다.',

    'signerPage.groups.one': '소속 그룹 1개',
    'signerPage.groups.other': '소속 그룹 {count}개',
    'signerPage.groupsNote':
      '기록된 범위에서 이 노드 뒤에 누가 있는지입니다. 그룹은 한 주체가 뒤에 있는 서명자 노드의 집합이며, 그 주체가 실제로 서명자 집합에서 얼마나 큰 비중을 차지하는지를 결정합니다.',
    'signerPage.votingPower': '의결 지분',
    'signerPage.votingPowerValue': '{cycle} 사이클 기준 {percent}%',
    'signerPage.votingPowerNote':
      'pox-5는 서명자의 가중치를 그 뒤에 스테이킹된 STX로 정합니다. 따라서 이 값은 해당 사이클에서 이 키가 서명자 집합 안에서 갖는 발언권의 크기이며, 이 키에 등록된 모든 컨트랙트를 합산한 값입니다. 서명자의 운영 품질을 뜻하지는 않습니다. 실제로 서명에 참여했는지, 어떤 버전을 실행하는지, 가동 시간이 얼마인지는 여기에 나오지 않습니다.',
    'signerPage.votingPowerUnknown':
      '이 사이클은 알 수 없습니다. 이 키의 컨트랙트 중 하나가 보유한 양을 갱신에서 읽지 못했습니다.',
    'signerPage.votingPowerStaked': '이 키 뒤에 스테이킹된 양',
    'signerPage.sharedBy.one': '이 키로 등록된 컨트랙트는 하나입니다',
    'signerPage.sharedBy.other': '이 키로 등록된 컨트랙트는 {count}개입니다',
    'signerPage.thisOne': '— 현재 페이지',
    'signerPage.sharedNote':
      '이 컨트랙트들은 하나의 서명자입니다. 키가 가진 스테이킹 물량과 가중치, 확보한 슬롯은 모두 함께 결정되므로, 어느 하나가 보유한 금액은 독립된 풀이 아니라 전체의 일부입니다.',
    'signerPage.rewards': '이 컨트랙트의 보상',
    'signerPage.rewardsIntro':
      '지금 이 풀 주변의 sBTC — 아직 수령하지 않은 금액, 참여자에게 지급할 금액, 그리고 풀이 가져간 금액입니다.',
    'signerPage.unclaimed': 'pox-5에 남아 있는 금액',
    'signerPage.claimCurrent': '· 마지막 분배는 수령 완료',
    'signerPage.claimBehind': '· 수령하지 않은 분배가 남아 있음',
    'signerPage.claimUnknown': '· 확인 불가',
    'signerPage.undistributed': '참여자에게 지급 대기 중',
    'signerPage.undistributedNote':
      'pox-5에서 수령했지만 아직 참여자에게 지급하지 않은 금액입니다. 지급은 누구나 실행할 수 있어 점차 줄어들지만, 지분별 계산에서 남는 몇 사토시 때문에 완전히 0이 되지는 않습니다.',
    'signerPage.earnedFees': '수취했으나 인출하지 않은 수수료',
    'signerPage.earnedFeesNote':
      '풀이 부과했고 운영자가 아직 옮기지 않은 금액입니다. 누적 총액이 아니라 잔액입니다.',
    'signerPage.rewardsNone':
      '이 컨트랙트는 보유 금액을 공개하지 않아 위 수치만 확인할 수 있습니다. 코드가 무엇을 노출하는지의 문제이며, 이상 징후는 아닙니다.',
    'signerPage.cycles': '사이클별 내역',
    'signerPage.cyclesIntro':
      '각 보상 사이클에서 이 풀이 보유한 금액과 그 참여자입니다. 금액은 pox-5에서 읽었고, 참여자 역시 pox-5에 한 명씩 물어 확인한 값입니다.',
    'signerPage.cycle': '{cycle} 사이클',
    'signerPage.filling': '참여 가능',
    'signerPage.active': '보상 진행 중',
    'signerPage.ofSigner': '(서명자 전체 {total} 중)',
    'signerPage.memberCount.one': '참여자 1명',
    'signerPage.memberCount.other': '참여자 {count}명',
    'signerPage.notCounted': '이 사이클의 참여자는 아직 집계되지 않았습니다',
    'signerPage.walkedAt': '· {at} 확인',
    'signerPage.membersFresh':
      '위 금액은 매시간 갱신됩니다. 누가 보유하는지는 스테이커 한 명당 한 번씩 조회해야 해서 더 느립니다. 사이클이 열려 있는 동안 목록은 하루에 한 번까지만 다시 만들어지므로 그만큼 늦을 수 있습니다.',
    'signerPage.showMembers': '참여자 보기',
    'signerPage.hideMembers': '숨기기',
    'signerPage.shortList':
      '이 목록은 불완전합니다. 아래 참여자의 합계가 서명자 보유 금액과 맞지 않으므로, 여기 스테이킹한 사람 중 일부가 빠져 있습니다.',
    'signerPage.colStaker': '스테이커',
    'signerPage.colAmount': '금액',
    'signerPage.colShare': '비중',
    'signerPage.colContract': '컨트랙트',
    'signerPage.showAll': '{count}명 모두 보기',
    'signerPage.loading': '불러오는 중 …',
    'signerPage.failed': '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
    'signerPage.noHistory':
      '이 풀의 내역은 아직 만들어지지 않았습니다. 매시간 갱신이 서명자별로 기록하므로 나중에 다시 확인해 주세요.',
    'signerPage.noMembers': '이 사이클의 참여자 목록이 없습니다.',

    'status.back': '← 전체 풀',
    'status.heading': '내 STX는 어디에 있고, 얼마를 벌었을까?',
    'status.intro':
      '주소를 붙여넣으면 무엇을, 어느 풀에, 언제까지 스테이킹했는지, 그리고 어떤 sBTC가 기다리고 있는지 확인할 수 있습니다. 주소는 이 페이지를 벗어나지 않으며 체인에서 직접 읽습니다.',
    'status.inputLabel': 'Stacks 주소 또는 BNS 이름',
    'status.inputHint':
      '한 줄에 하나씩, 또는 쉼표로 구분해 최대 {max}개까지. friedger.btc 같은 BNS 이름과 컨트랙트 주소도 가능하며 # 뒤의 내용은 라벨로 표시됩니다.',
    'status.lookUp': '조회하기',
    'status.reading': '읽는 중…',
    'status.clear': '다시 시작',
    'status.tooMany':
      '주소가 {max}개를 넘어 마지막 {dropped}개는 제외했습니다.',
    'status.rejected.one': '주소가 아닌 줄이 1개 있습니다:',
    'status.rejected.other': '주소가 아닌 줄이 {count}개 있습니다:',
    'status.resultsHeading.one': '주소 1개',
    'status.resultsHeading.other': '주소 {count}개',
    'status.notStaking': '스테이킹하고 있지 않습니다.',
    'status.lockedElsewhere':
      '{amount}이 잠겨 있지만 이 가이드가 읽을 수 있는 풀은 아닙니다. 즉 놀고 있는 것이 아니라 다른 곳에 스테이킹되어 있습니다.',
    'status.unlocked': '{amount}은 잠겨 있지 않습니다.',
    'status.unregistered':
      'BNS v2 레지스트리에 이 이름의 소유자가 없어 조회할 주소가 없습니다. 철자나 만료 여부를 확인해 주세요.',
    'status.unreadable':
      '노드가 이 주소에 대해 응답하지 않아 확인할 수 없습니다. 스테이킹이 없다는 뜻은 아니므로 잠시 후 다시 시도해 주세요.',
    'status.cyclesLeft.one': '1사이클 남음',
    'status.cyclesLeft.other': '{count}사이클 남음',
    'status.endsThisCycle': '이번 사이클에 종료',
    'status.ended': '이미 종료됨',
    'status.unlocksAt': '{cycle} 사이클에 잠금이 해제됩니다.',
    'status.aboutPool': '{pool} 자세히 보기',
    'status.readNote':
      '방금 체인에서 주소를 하나씩 읽었습니다. 이 가이드의 다른 정보는 매시간 갱신되는 파일에서 오지만, 이 페이지는 여러분만 아는 주소를 다루므로 그럴 수 없습니다.',
    'status.open': '주소 조회',

    'howTo.open': '스테이킹하는 법',
    'howTo.back': '← 풀 목록으로',
    'howTo.title': '세 단계로 끝나는 스테이킹',
    'howTo.intro':
      '이 가이드의 나머지는 세부 사항입니다. 이 페이지가 전부입니다.',
    'howTo.stx.heading': 'STX 스테이킹',
    'howTo.stx.one.title': '서명자를 고르세요',
    'howTo.stx.one.body':
      '목록에서 풀을 하나 고릅니다. 수수료와 상한, 누구를 받아주는지가 카드에 적혀 있습니다.',
    'howTo.stx.one.link': '풀 목록 보기',
    'howTo.stx.two.title': 'stake 함수를 호출하세요',
    'howTo.stx.two.body':
      '지갑에서 트랜잭션 한 번이면 됩니다. STX는 있던 자리에서 잠길 뿐, 풀로 옮겨가지 않습니다.',
    'howTo.stx.three.title': '끝났습니다',
    'howTo.stx.three.body':
      '잠근 기간 동안 매주 보상이 들어옵니다. 최대 96 사이클, 약 3년 반입니다.',
    'howTo.stx.three.link': '받을 보상 확인하기',
    'howTo.sbtc.heading': 'sBTC 스테이킹',
    'howTo.sbtc.intro':
      '단계는 똑같고 한 가지만 다릅니다. sBTC는 지갑을 떠나고, 스테이킹은 풀이 대신 합니다.',
    'howTo.sbtc.one.title': '풀을 고르세요',
    'howTo.sbtc.one.body': '현재 세 곳이 열려 있습니다.',
    'howTo.sbtc.two.title': 'sBTC를 보내세요',
    'howTo.sbtc.two.body':
      '각 풀의 앱에서 보냅니다. 스테이킹되어 있는 동안 sBTC는 풀이 보관합니다.',
    'howTo.sbtc.three.title': '나머지는 풀이 합니다',
    'howTo.sbtc.three.body':
      '풀이 스테이킹하고 보상을 수령해 여러분에게 돌려줍니다.',
    'howTo.sbtc.poolsNote':
      '세부 사항은 조금씩 다릅니다. 얼마를 떼는지, 스테이킹 중에 무엇을 들고 있게 되는지, sBTC를 얼마나 빨리 돌려받는지가 다릅니다. 보내기 전에 각 풀의 약관을 직접 읽어 보세요. 이 가이드는 서명자 풀과 달리 이들의 조건을 체인에서 읽어 오지 않습니다.',
    'howTo.sbtc.noLink': '아직 등록된 링크가 없습니다.',
    'myRewards.title': '이 주소가 번 금액',
    'myRewards.show': '얼마를 벌었나요?',
    'myRewards.readingRow': 'pox-5에 사이클별로 물어보는 중…',
    'myRewards.atPox5': 'pox-5에서 기다리는 금액',
    'myRewards.perCycle': '{cycle} 사이클: {amount}',
    'myRewards.unreadCycle': '읽지 못했습니다',
    'myRewards.onlyYou':
      '이 금액은 본인만 가져갈 수 있습니다. 청구 시 발신자를 확인하므로 운영자가 대신 옮길 수도, 가져갈 수도 없습니다.',
    'myRewards.atPool': '풀에서 기다리는 금액',
    'myRewards.atPoolNote':
      '풀이 이미 이번 사이클 보상을 pox-5에서 가져와 본인 몫을 보관 중이며, 이 값은 풀의 {getter}에서 읽었습니다. 지급은 본인을 포함해 누구나 실행할 수 있습니다.',
    'myRewards.movedNote':
      '여기 0이라고 해서 항상 보상이 없다는 뜻은 아닙니다. 풀이 claim-rewards를 실행하면 그 사이클 보상은 pox-5에서 풀로 옮겨지고, 스테이커별 장부를 두지 않는 풀에는 본인 몫을 물어볼 수 없습니다. 풀이 가져왔지만 아직 나눠주지 않은 금액은 해당 풀 페이지에서 확인할 수 있습니다.',

    'stake.open': '지갑으로 스테이킹',
    'stake.title': '{name} 스테이킹',
    'stake.close': '닫기',
    'stake.intro':
      '스테이킹은 STX를 일정 기간 잠가 두고 그 대가로 보상을 받는 것입니다. STX는 내 지갑을 떠나지 않으며, 체인에서 잠겨 있을 뿐이라 풀이 마음대로 쓸 수 없습니다.',

    'stake.wallet': '내 지갑',
    'stake.walletNone': '아직 연결되지 않았습니다',
    'stake.connect': '지갑 연결',
    'stake.switch': '다른 계정 사용',
    'stake.disconnect': '연결 해제',
    'stake.checking': '잠시만 기다려 주세요…',
    'walletBanner.label': '지갑에서 이 페이지 열기',
    'walletBanner.title': '휴대폰인가요? 지갑에서 이 페이지를 열어 보세요.',
    'walletBanner.open': '{wallet}에서 열기',
    'walletBanner.dismiss': '숨기기',

    'stake.browserTitle': '휴대폰인가요? 지갑 안에서 이 페이지를 여세요',
    'stake.browserBody':
      '휴대폰에는 연결할 확장 프로그램이 없습니다. Leather와 Xverse에는 각각 자체 브라우저가 있고, 그 안에서 열면 이 페이지가 지갑과 직접 통신할 수 있습니다. Leather는 이 방법이 유일한 경로입니다.',
    'stake.browserOpen': '{wallet}에서 열기',
    'stake.browserNote':
      '같은 풀의 같은 페이지가 그대로 열립니다. 지갑 브라우저는 설정을 따로 저장하므로 언어나 조회 중이던 주소는 넘어가지 않습니다. 해당 지갑이 설치되어 있지 않으면 아무 일도 일어나지 않습니다.',

    'stake.available': '스테이킹 가능 금액 {amount}',
    'stake.availableUnknown': '지갑을 연결하면 보유 금액이 표시됩니다',

    'stake.position.title': '이미 스테이킹 중입니다',
    'stake.position.amount': '{pool}에 {amount}',
    'stake.position.thisPool': '지금 보고 있는 풀입니다.',
    'stake.position.otherPool': '여기서 스테이킹하면 {pool}(으)로 옮겨집니다.',
    'stake.position.cycles.one': '{first} 사이클부터 한 보상 사이클 동안.',
    'stake.position.cycles.other':
      '{first} 사이클부터 {count}개 보상 사이클 동안.',
    'stake.position.cyclesHint': '보상 사이클은 약 2주입니다.',
    'stake.position.rewardsBitcoin': '보상은 비트코인 주소 {address}로 갑니다.',
    'stake.position.rewardsSbtc': '보상은 이 지갑으로 sBTC로 들어옵니다.',
    'stake.position.rewardsUnknown':
      '이 풀이 보상을 어디로 보내는지 확인하지 못했습니다.',
    'stake.position.maxFee':
      '보상을 보낼 때 최대 {sats} sats까지 전송 비용으로 사용됩니다.',
    'stake.position.minClaim': '{sats} sats 이상 모이면 지급됩니다.',
    'stake.position.userDataBitcoin':
      '{tx} 때 {address} 주소와 수수료 상한 {sats} sats를 보냈습니다.',
    'stake.position.userDataSbtc':
      '{tx} 때 주소를 보내지 않았습니다. sBTC로 받겠다는 뜻입니다.',
    'stake.position.userDataFloor': '함께 {sats} sats 하한도 보냈습니다.',
    'stake.position.userDataNoFloor':
      '하한은 보내지 않아서 풀이 자체 값을 사용했습니다.',
    'stake.position.userDataStakeTx': '스테이킹',
    'stake.position.userDataUpdateTx': '스테이킹 변경',
    'stake.position.userDataUnknown':
      '보낸 정보가 담긴 트랜잭션을 찾지 못했습니다.',

    'stake.amountQuestion': '얼마를 스테이킹할까요?',
    'stake.amountQuestionMore': '얼마를 추가할까요?',
    'stake.amountOptional':
      '비워 두면 금액은 그대로 두고 아래 설정만 바꿉니다.',
    'stake.amountOptionalMove':
      '비워 두면 추가 없이 지금 스테이킹한 금액만 옮깁니다.',
    'stake.max': '최대',
    'stake.maxHint':
      '최대를 누르면 거래 수수료용으로 1 STX를 남기고 입력됩니다.',
    'stake.cyclesQuestion': '얼마나 오래 맡길까요?',
    'stake.cyclesCount.one': '{count} 사이클',
    'stake.cyclesCount.other': '{count} 사이클',
    'stake.cyclesFor.weeks.one': '약 1주입니다.',
    'stake.cyclesFor.weeks.other': '약 {count}주입니다.',
    'stake.cyclesFor.months.one': '약 1개월입니다.',
    'stake.cyclesFor.months.other': '약 {count}개월입니다.',
    'stake.cyclesHint':
      '기간이 끝나면 STX가 풀립니다. 나중에 최대 {max} 사이클까지 늘릴 수 있습니다.',

    'stake.extendQuestion': '얼마나 더 연장할까요?',
    'stake.extendKeep': '연장 안 함',
    'stake.extendCount.one': '{count} 사이클 더',
    'stake.extendCount.other': '{count} 사이클 더',
    'stake.extendTotal.one': '모두 합해 한 사이클입니다.',
    'stake.extendTotal.other': '모두 합해 {count} 사이클입니다.',
    'stake.extendHint': '{min}에서 {max} 사이클까지 더할 수 있습니다.',

    'stake.extendNote':
      '이번 사이클로 스테이킹이 끝나며, 그 상태로는 체인이 변경을 받아들이지 않습니다. 이번 변경은 잠금을 한 사이클 더 이어 갑니다.',
    'stake.prepareNote':
      '다음 사이클을 준비하는 중이라, 시작할 때까지 체인이 스테이킹 변경을 거부합니다. 보통 하루 안에 시작됩니다.',

    'stake.rewardsQuestion': '보상을 어디로 받을까요?',
    'stake.rewardsSbtc': 'Stacks에 그대로 두기',
    'stake.rewardsSbtcHelp':
      '이 지갑으로 sBTC로 들어옵니다. 따로 설정할 것이 없습니다.',
    'stake.rewardsBitcoin': '비트코인으로 보내기',
    'stake.rewardsBitcoinHelp': '지정한 비트코인 주소로 보냅니다.',
    'stake.rewardsNow': '현재 설정',
    'stake.rewardsChangeToSbtc':
      '보상이 더 이상 비트코인으로 가지 않고, 이 지갑에 sBTC로 들어오게 됩니다.',
    'stake.rewardsChangeAddress':
      '풀에 등록된 비트코인 주소를 입력한 주소로 바꿉니다.',
    'stake.btcAddress': '내 비트코인 주소',
    'stake.maxFee': '전송에 쓸 최대 금액',
    'stake.maxFeeHint':
      '단위는 sats입니다. 비트코인 전송에는 약간의 수수료가 들며 보상에서 차감됩니다. 3000이 무난한 시작값이며, 최소한 {min}은 잡아야 합니다 — 그보다 낮으면 지급 트랜잭션이 확정되지 않습니다.',
    'stake.minClaim': '지급을 시작할 최소 금액',
    'stake.minClaimHint':
      '단위는 sats입니다. 보상이 이 금액에 도달하면 누구나 지급을 실행할 수 있습니다. 높게 잡으면 지급 횟수는 줄지만 수수료로 나가는 비율도 줄어듭니다. {min}보다 커야 합니다.',

    'stake.keysNote':
      '트랜잭션은 지갑이 만들고 서명해 전송합니다. 이 페이지는 키를 볼 수 없습니다.',
    'stake.explain': '누르면 무슨 일이 일어나나요?',
    'stake.explainBody':
      '지갑이 위 금액을 이 풀에 선택한 기간 동안 잠그는 트랜잭션을 만들어 승인을 요청합니다. 승인하기 전까지는 아무것도 움직이지 않으며, 그 전에는 언제든 이 창을 닫아도 됩니다.',

    'stake.submitting': '지갑에서 승인을 기다리는 중…',
    'stake.stakeNow': '스테이킹 시작',
    'stake.addToStake': '스테이킹 추가하기',
    'stake.moveStake': '이 풀로 옮기기',
    'stake.extendStake': '스테이킹 기간 연장',
    'stake.tx.pending': '전송됨, 확정을 기다리는 중 —',
    'stake.tx.success': '확정되었습니다 —',
    'stake.tx.failed': '처리되지 않았습니다 —',

    'stake.unstake.title': '스테이킹 중단',
    'stake.unstake.body':
      'STX는 이번 사이클이 끝날 때까지 잠겨 있다가 그때 풀립니다. 이미 쌓인 보상에는 영향이 없습니다.',
    'stake.unstake.open': '스테이킹 중단',
    'stake.unstake.confirm': '네, 중단합니다',
    'stake.unstake.cancel': '계속 스테이킹',

    'stake.error.noStxAddress': '지갑에서 STX 주소를 찾지 못했습니다.',
    'stake.error.amount': '스테이킹할 금액을 입력하세요.',
    'stake.error.cycles': '1에서 {max} 사이의 정수 사이클을 선택하세요.',
    'stake.error.extend':
      '{min}에서 {max} 사이의 정수 사이클을 추가로 선택하세요.',
    'stake.error.nothingToChange':
      '바뀌는 것이 없습니다. 금액을 입력하거나 보상을 받을 곳을 바꾸세요.',
    'stake.error.refused': '체인이 이 요청을 거부합니다. {reasons}',
    'stake.error.notBroadcast':
      '지갑이 트랜잭션을 체인으로 보내지 않아 바뀐 것이 없습니다. 다시 시도해 주세요.',
    'stake.error.tooMuch': '보유 금액에서 1 STX를 남긴 한도를 넘었습니다.',
    'stake.error.btcAddress': '보상을 받을 비트코인 주소를 입력하세요.',
    'stake.error.maxFee': '전송에 쓸 최대 금액은 숫자여야 합니다.',
    'stake.error.maxFeeFloor':
      '전송 수수료로 최소 {min} sats는 잡아 주세요. 그보다 낮으면 지급 트랜잭션이 채굴되지 않으며, 아무런 안내도 표시되지 않습니다.',
    'stake.error.minClaim':
      '지급 최소 금액은 {min} sats보다 큰 숫자여야 합니다. 그렇지 않으면 풀이 보낼 수 없습니다.',
    'stake.error.noPublicKey':
      '지갑이 공개키를 반환하지 않았습니다. 다시 연결한 뒤 시도하세요.',
    'stake.error.balanceLookup': '잔액 조회에 실패했습니다 ({status})',
    'stake.error.balanceRead': 'STX 잔액을 읽지 못했습니다',

    // ---- 사이트 헤더
    'nav.label': '섹션',
    'nav.pools': '풀',
    'nav.contracts': '컨트랙트',
    'nav.groups': '투표권 보유자',
    'nav.bonds': '본드',
    'nav.status': '주소 확인',
    'nav.howTo': '스테이킹 방법',
    'nav.learn': '알아보기',
    'nav.suggestGroup': '운영자 그룹',
    'nav.menu': '메뉴',
    'nav.searchLabel': '풀 찾기, 또는 주소나 BNS 이름 확인',
    'nav.searchPlaceholder': '풀, 주소 또는 BNS',

    // ---- 데이터 신선도
    'freshness.readAgo': '{ago} 전에 체인에서 읽음',
    'freshness.hourly': '매시간 갱신',
    'freshness.ago.minute.one': '{count}분',
    'freshness.ago.minute.other': '{count}분',
    'freshness.ago.hour.one': '{count}시간',
    'freshness.ago.hour.other': '{count}시간',
    'freshness.ago.day.one': '{count}일',
    'freshness.ago.day.other': '{count}일',
    'freshness.staleTitle.minute.one': '{count}분 전 데이터',
    'freshness.staleTitle.minute.other': '{count}분 전 데이터',
    'freshness.staleTitle.hour.one': '{count}시간 전 데이터',
    'freshness.staleTitle.hour.other': '{count}시간 전 데이터',
    'freshness.staleTitle.day.one': '{count}일 전 데이터',
    'freshness.staleTitle.day.other': '{count}일 전 데이터',
    'freshness.staleBody': '수치가 달라졌을 수 있음',

    // ---- 풀 목록 페이지
    'home.intro':
      '모든 풀을 수수료, 참여 조건, 보상 지급 방식으로 비교해 보세요.',
    'home.you.reading': '{who} 읽는 중…',
    'home.you.failed': '지금은 {who}을(를) 읽을 수 없습니다',
    'home.you.notStaking': '{who}은(는) 스테이킹하고 있지 않습니다',
    'home.you.staked': '{who}: {amount} 스테이킹 중 —',
    'home.you.open': '자세히 →',
    'home.you.forget': '이 주소 잊기',
    'home.stat.staked': '사이클 {cycle} 스테이킹',
    'home.stat.nextFilling': '사이클 {cycle}: 지금까지 {amount}',
    'home.stat.nextLocked': '사이클 {cycle} 확정: {amount}',
    'home.stat.pools': '선택할 수 있는 풀',
    'home.stat.types.one': '컨트랙트 유형 {count}개 ·',
    'home.stat.types.other': '컨트랙트 유형 {count}개 ·',
    'home.stat.compare': '비교하기 →',
    'home.stat.rewards': 'STX 전용 보상',
    'home.stat.rewardsUnit': 'sats / 1000 STX',
    'home.stat.apy': '연 ≈ {apy}% ·',
    'home.stat.howWorkedOut': '계산 방법 →',
    'home.stat.payout': '다음 지급',
    'home.stat.payoutDays.one': '약 {count}일 후',
    'home.stat.payoutDays.other': '약 {count}일 후',
    'home.stat.payoutDue': '지급 예정',
    'home.stat.payoutOverdue':
      '마지막 갱신 때의 예상치이며, 그 날짜가 지났습니다.',
    'home.stat.payoutBlocks': '{total}블록 중 {done} ·',
    'home.stat.history': '지급 내역 →',
    'home.footer.fees':
      '수수료는 각 풀의 컨트랙트에서 읽으며, 대부분의 풀은 언제든 바꿀 수 있습니다 — ⛉는 코드로 정한 상한, ◷는 인상 전 대기 기간입니다.',

    'pools.count.one': '풀 {count}개',
    'pools.count.other': '풀 {count}개',
    'pools.hiddenEmpty.one': '빈 풀 {count}개 숨김 ·',
    'pools.hiddenEmpty.other': '빈 풀 {count}개 숨김 ·',
    'pools.showEmpty': '보기',
    'pools.hideEmpty': '빈 풀 숨기기',
    'pools.sortBy': '정렬',
    'pools.sort.staked': '스테이킹 · {cycle}',
    'pools.sort.next': '사이클 {next} 현재까지',
    'pools.sort.fee': '수수료 낮은 순',
    'pools.sort.share': '키의 투표 비중',
    'pools.sort.name': '이름',
    'pools.col.pool': '풀',
    'pools.col.type': '컨트랙트 유형',
    'pools.col.fee': '수수료',
    'pools.col.join': '참여 조건',
    'pools.col.rewards': '보상',
    'pools.col.share': '키의 투표 비중',
    'pools.col.stake': '스테이킹',
    'pools.unnamed': '이름 없는 풀',
    'pools.unnamedIn': '이름 없음 · {group}',
    'pools.feeElsewhere':
      '이 컨트랙트에 수수료가 없습니다. 다른 곳에서 부과될 수 있습니다',
    'pools.feeElsewhereShort': '별도 설정',
    'cycles.loading': '사이클을 읽는 중…',
    'cycles.pageIntro':
      '모든 pox-5 사이클: 스테이킹된 금액, 서명자와 풀의 수, 지급액과 그 수익률, 그리고 각 지급 내역입니다.',
    'cycles.title': '사이클별 네트워크',
    'cycles.intro':
      '각 사이클에 모든 컨트랙트가 보유한 금액과 각 지급이 1000 STX당 지급한 금액으로 계산했습니다. 아직 지급 중인 사이클을 빼면 추정치가 아닙니다.',
    'cycles.chart': '사이클별 STX 전용 보상 (sBTC)',
    'cycles.rewardsHelp':
      '사이클이 STX 전용 스테이커에게 지급한 금액입니다. 스테이킹 금액에 그 사이클의 pox-5 STX당 보상을 곱한 값이며, 본드에 등록된 STX는 본드 몫에서 대신 지급되므로 포함되지 않습니다.',
    'cycles.col.cycle': '사이클',
    'cycles.col.staked': '스테이킹',
    'cycles.col.signers': '서명자',
    'cycles.col.pools': '풀',
    'cycles.col.rate': '1000 STX당',
    'cycles.col.apy': '연 수익률',
    'cycles.col.rewards': 'STX 전용 보상',
    'cycles.signersHelp': '사이클에 STX가 스테이킹된 서명자 키입니다.',
    'cycles.poolsHelp':
      '사이클에 STX가 스테이킹된 컨트랙트입니다. Stacking DAO는 하나의 스테이킹 장소이므로 컨트랙트를 하나의 풀로 셉니다.',
    'cycles.apyHelp':
      '각 지급의 보상률을 지급 당시 STX 가격과 비교해 연 50회 복리로 계산한 값을 사이클의 지급들에 대해 평균했습니다. 홈페이지의 보상률과 같은 방법이며, 풀 수수료 차감 전입니다.',
    'cycles.notPaid': '아직 지급 전',
    'cycles.soFar': '현재까지',
    'cycles.payoutsTitle': '각 지급',
    'timing.allCycles': '모든 사이클 →',
    'pools.nextInline': '{cycle}: {amount} ·',
    'pools.nextInlineHelp':
      '사이클 {cycle}에 현재까지 스테이킹된 금액과 이번 사이클 대비 변화',
    'amount.usdAbout': '≈ {usd}',
    'pools.sort.yield': '순수익률',
    'pools.col.yield': '순수익률',
    'pools.yieldHelp':
      '오늘의 STX 전용 보상률과 오늘의 수수료로 계산한, 스테이킹한 STX 대비 1년 동안 받는 sBTC입니다. STX 전용 풀은 수수료 전에는 모두 같은 보상률을 받으므로, 이 수치는 수수료를 실제로 받는 몫으로 나타낸 것입니다.',
    'pools.yieldUnknown': '마지막 갱신에 보상률이나 STX 가격이 없었습니다',
    'pools.bondHelp':
      '이 풀의 스테이킹 중 일부는 BTC 본드를 뒷받침합니다. 그 부분은 STX 전용 보상률이 아니라 본드 몫에서 지급되므로, 여기의 수익률은 STX 전용 스테이커가 받는 몫입니다.',
    'pools.bondPlus': '+ 본드 몫',
    'bondStake.some': '본드 {amount}',
    'bondStake.all': '전부 본드',
    'bondStake.part': '본드 {index}: {amount}',
    'bondStake.partUnnamed': '본드: {amount}',
    'bondStake.chip': '본드 {index} · {amount}',
    'bondStake.chipUnnamed': '본드 · {amount}',
    'bondStake.markLabel': '일부가 BTC 본드를 뒷받침합니다 — {breakdown}',
    'pool.fact.bondNote': 'BTC 본드 몫:',
    'pool.earned.bondNote':
      '이번 사이클 스테이킹 중 {amount}는 BTC 본드를 뒷받침합니다. 이 부분은 본드 몫에서 지급되며 pox-5가 풀별로 나누지 않으므로, 위의 획득액과 수익률에서 제외했습니다.',
    'pool.earned.allBond':
      '여기에 스테이킹된 모든 STX가 BTC 본드를 뒷받침합니다. 본드 스테이킹은 STX 전용 보상률이 아니라 본드 몫에서 지급되고, pox-5는 그 몫을 풀별로 나누지 않으므로 표시할 STX 전용 획득액이 없습니다.',
    'pool.members.bond': '본드 {index}',
    'pool.members.bondUnnamed': '본드',
    'pool.members.bondHelp':
      'BTC 본드에 등록됨: STX 전용 보상률이 아니라 본드 몫에서 지급됩니다.',
    'app.bonds.stxTitle': '사이클 {cycle}에 진행 중인 모든 본드',
    'app.bonds.stxIntro':
      '본드 STX는 풀의 총액에 포함되지만 STX 전용 보상률이 아니라 본드 몫에서 지급됩니다.',
    'app.bonds.stxBondCycles': '사이클 {first}–{last}',
    'app.bonds.sum.heading': '사이클 {cycle}에 스테이킹된 STX',
    'app.bonds.sum.total': '사이클 {cycle} 스테이킹',
    'app.bonds.sum.bond': '본드 뒷받침',
    'app.bonds.sum.stxOnly': 'STX 전용',
    'app.bonds.sum.share': '전체의 {percent}%',
    'app.bonds.stxBond': '본드 {index}',
    'app.bonds.stxBondUnnamed': '기록에 번호가 없는 본드',
    'app.bonds.stxNone': '이번 사이클에 본드에 등록된 STX가 없습니다.',
    'app.bonds.stxUnknown.one':
      '풀 {count}개를 확인하지 못해 그 본드 스테이킹은 여기에 포함되지 않았습니다.',
    'app.bonds.stxUnknown.other':
      '풀 {count}개를 확인하지 못해 그 본드 스테이킹은 여기에 포함되지 않았습니다.',
    'pools.phone.yield': '연 {percent}',
    'pool.fact.feeYield': '수수료 차감 후 연 약 {percent}%',
    'pool.fact.nextCloses': '{countdown} 후 마감',
    'pool.earned.whereNow': '지금 sBTC가 있는 곳',
    'pool.earned.yield': '수수료 차감 후 수익률',
    'pool.earned.yieldHelp':
      '오늘의 STX 전용 보상률, 오늘의 수수료, 오늘의 STX 가격으로 계산한 1년 수익입니다. 보상률은 지급마다 바뀌므로 약속이 아닌 참고치입니다.',
    'pool.earned.yieldNote': '연간, 오늘의 보상률과 {fee} 수수료 기준',
    'pool.earned.total': '사이클 {cycle} 이후 획득',
    'pool.earned.totalPlain': '획득',
    'pool.earned.how':
      '각 사이클에 이 컨트랙트가 보유한 금액과 그 사이클의 pox-5 STX당 보상으로 계산했습니다. 이 보상은 모든 STX 전용 지분에 같습니다. 오늘의 수수료만 기록되어 있으므로 풀 수수료 차감 전 금액입니다.',
    'pool.earned.beforeFee': '수수료 차감 전',
    'pool.earned.unavailable': '사이클 기록을 불러오지 못했습니다.',
    'pool.earned.none':
      '아직 획득한 보상이 없습니다. 이 컨트랙트에 스테이킹이 있던 사이클에 대한 pox-5 지급이 아직 없습니다.',
    'pool.earned.colEarned': '획득',
    'pool.earned.colKept': '{fee} 수수료 차감 후',
    'pool.earned.soFar': '현재까지',
    'timing.label': '보상 사이클',
    'timing.prices': 'STX {stx} · BTC {btc}',
    'timing.pricesHelp':
      '마지막 갱신 시점의 CoinGecko 가격입니다. 보상은 sBTC로, 스테이킹은 STX로 이루어지며 달러는 규모를 가늠하기 위한 것입니다.',
    'timing.closes': '{countdown} 안에 사이클 {next}에 참여하세요.',
    'timing.closesWhen': '그 이후에는 사이클 {after}부터 포함됩니다.',
    'timing.closesAt':
      '준비 단계가 시작되는 비트코인 블록 {block}, 약 {date}입니다.',
    'timing.inPrepare': '지금 스테이킹하면 사이클 {joins}부터 포함됩니다.',
    'timing.inPrepareWhen':
      '사이클 {next}은 확정되었고 {countdown} 후 시작됩니다.',
    'timing.soon': '몇 분',
    'timing.progress': '사이클 {cycle} {percent}% 진행',
    'timing.started': '사이클 {cycle} 시작 {date}',
    'timing.next': '사이클 {cycle} 시작 {date} · 블록 {block}',
    'timing.dh': '{d}일 {h}시간',
    'timing.hm': '{h}시간 {m}분',
    'timing.m': '{m}분',
    'pools.amountUnknown': '알 수 없음',
    'pools.amountNotRead': '아직 읽지 않음',
    'pools.noticeShort': '{notice} 고지',
    'pools.shareHelp':
      '이 풀의 서명자 키가 가진 투표 비중입니다. 키를 공유하는 컨트랙트는 서명하는 주체가 키이므로 같은 수치를 표시합니다.',
    'pools.shareSharedKey.one': '이 키의 컨트랙트 1개',
    'pools.shareSharedKey.other': '컨트랙트 {count}개가 공유',
    'pools.cap': '상한 {percent}%',
    'pools.capHelp':
      '컨트랙트가 강제하는 상한입니다. 풀이 어떻게 정하든 수수료는 이 값을 넘을 수 없습니다.',
    'pools.noticeHelp':
      '수수료 인상이 적용되기까지 기다려야 하는 기간입니다. 그동안 다른 풀로 옮길 수 있습니다.',
    'pools.change.new': '신규',
    'pools.change.notYet': '아직 없음',
    'pools.change.same': '변동 없음',
    'pools.unknownAmount': '마지막 갱신에서 이 금액을 읽지 못했습니다',
    'pools.notReadYet':
      '마지막 갱신 이후에 등록되었습니다. 다음 갱신에서 읽습니다',
    'pools.unreviewed': '검토되지 않음',
    'pools.details': '자세히',
    'pools.phone.fee': '수수료 {fee}',
    'pools.phone.feeElsewhere': '수수료 별도',
    'pools.phone.next': '다음 {amount}',

    'join.anyone.short': '누구나',
    'join.anyone.help': '컨트랙트가 아무도 거절하지 않습니다.',
    'join.invite.short': '초대 전용',
    'join.invite.help': '운영자가 스테이킹할 수 있는 사람의 목록을 관리합니다.',
    'join.nativePool.short': 'Native Pool 경유',
    'join.nativePool.help':
      'Stacking DAO의 Native Pool을 통해 들어온 스테이킹만 받습니다. Native Pool에는 누구나 참여할 수 있습니다.',

    'currency.btc': 'BTC',
    'currency.btc.help':
      '컨트랙트가 지정한 비트코인 주소로 보상을 보낼 수 있습니다.',
    'currency.sbtc': 'sBTC',
    'currency.sbtc.help': '보상은 Stacks의 sBTC로 지급됩니다.',
    'currency.stx': 'STX',
    'currency.stx.help': '보상은 STX로 지급됩니다.',

    'contracts.staked': '{amount} 스테이킹',
    'contracts.notice': '수수료 변경 사전 고지',

    'stake.openShort': '스테이킹',
    'app.stxOnlyHistory.crumb': '사이클',

    'conduct.caption': '이 키가 채굴자가 제안한 블록에 응답하는지 여부입니다.',
    'conduct.staleTitle': '{at} 이후 서명 보고서가 없습니다.',
    'conduct.staleBody':
      '마지막 보고서는 사이클 {cycle}까지이므로, 그 뒤 사이클에서 이 키가 어땠는지는 아직 알 수 없습니다.',

    // ---- 풀 페이지
    'pool.checkStake': '내 스테이킹 확인',
    'pool.stakeElsewhere':
      '스테이킹은 여기가 아니라 Native Pool 앱에서 합니다.',
    'pool.warning.highFee.title': '수수료가 보상을 거의 전부 가져갑니다.',
    'pool.warning.highFee.body': '현재 수수료는 {fee}입니다.',
    'pool.warning.feeUnbounded.title': '수수료는 언제든 오를 수 있습니다.',
    'pool.warning.feeUnbounded.body':
      '상한도 변경 전 고지 기간도 없습니다. 현재 수수료는 {fee}입니다.',
    'pool.warning.unreviewed.title': '아무도 이 코드를 검토하지 않았습니다.',
    'pool.warning.unreviewed.body':
      '배지는 소스에서 자동으로 읽은 것이며, 그 밖에 무엇을 하는지는 아무도 확인하지 않았습니다.',
    'pool.section.members': '참여자',
    'pool.section.rewards': '보상',
    'pool.section.signing': '서명',
    'pool.section.key': '서명자 키',
    'pool.section.contract': '컨트랙트',
    'pool.fact.fee': '현재 수수료',
    'pool.fact.feeNote': '지급 전에 보상에서 차감',
    'pool.fact.cap': '수수료 상한',
    'pool.fact.capElsewhere': '여기서 확인 불가',
    'pool.fact.capNone': '없음',
    'pool.fact.notice': '인상 전 {notice} 고지',
    'pool.fact.noNotice': '변경 전 고지 없음',
    'pool.fact.join': '참여 조건',
    'pool.fact.rewards': '보상',
    'pool.fact.rewardsNote': '보상 지급 형태',
    'pool.fact.staked': '스테이킹 · 사이클 {cycle}',
    'pool.fact.membersKey.one': '이 키의 참여자 {count}명',
    'pool.fact.membersKey.other': '이 키의 참여자 {count}명',
    'pool.fact.next': '사이클 {cycle} 현재까지',
    'pool.fact.nextLocked': '확정됨',
    'pool.fact.nextChange': '{change} · 참여 가능',
    'pool.fact.nextOpen': '참여 가능',
    'pool.fact.share': '투표 비중',
    'pool.fact.shareKey.one': '이 키의 사이클 비중',
    'pool.fact.shareKey.other': '이 키의 컨트랙트 {count}개 합계',
    'pool.fact.shareCycle': '사이클 {cycle} 기준',
    'pool.fact.runBy': '운영',
    'pool.fact.runByUnknown': '알 수 없음',
    'pool.fact.type': '컨트랙트 유형: {name}',
    'pool.members.title': '사이클별 참여자',
    'pool.members.caption': '보상 사이클마다 이 풀에 스테이킹된 STX입니다.',
    'pool.members.how':
      '금액은 pox-5에서 읽습니다. 참여자 목록은 pox-5 이벤트로 다시 만들며, 체인이 보고하는 금액과 일치할 때만 사용합니다.',
    'pool.members.cycle': '사이클',
    'pool.members.status': '상태',
    'pool.members.staked': '스테이킹',
    'pool.members.members': '참여자',
    'pool.members.membersKey': '키 전체',
    'pool.members.ended': '종료',
    'pool.members.ofKey': '키 전체 {total} 중',
    'pool.members.open': '참여자',
    'pool.members.earlier.one': '이전 사이클 {count}개 보기',
    'pool.members.earlier.other': '이전 사이클 {count}개 보기',
    'pool.members.firstSeen':
      '사이클 {cycle}에 처음 확인되었습니다. 그 이전 사이클은 표시하지 않습니다.',
    'pool.members.onKey.one': '키 전체 참여자 {count}명.',
    'pool.members.onKey.other': '키 전체 참여자 {count}명.',
    'pool.members.inThis.one': '이 컨트랙트 참여자 {count}명.',
    'pool.members.inThis.other': '이 컨트랙트 참여자 {count}명.',
    'pool.members.showKey': '키 전체 보기',
    'pool.members.showThis': '이 컨트랙트만',
    'pool.members.none': '이 사이클에 이 컨트랙트 참여자가 없습니다.',
    'pool.rewards.caption':
      '이 컨트랙트가 획득한 보상과 지금 sBTC가 있는 곳입니다.',
    'pool.rewards.none':
      '이 컨트랙트는 보유 금액을 공개하지 않아서, pox-5가 아직 지급하지 않은 금액만 읽을 수 있습니다.',
    'pool.key.caption':
      '이 풀을 위해 서명하는 키와, 이 키로 등록된 모든 컨트랙트입니다.',
    'pool.key.staked': '사이클 {cycle}에 이 키에 {amount}.',
    'pool.contract.title': '컨트랙트가 하는 일',
    'pool.contract.caption': '소스 코드에서 읽었습니다.',
    'pool.contract.more': '{name} 자세히 보기',

    // ---- 투표권 보유자, 본드
    'groups.chartLabel': '그룹별 투표 비중',
    'bonds.unlocked.one': '아직 아무것도 잠그지 않은 초대 {count}건 더',
    'bonds.unlocked.other': '아직 아무것도 잠그지 않은 초대 {count}건 더',
    'bonds.showUnlocked': '보기',
  },
};
