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
      summary:
        'Xverse가 사용하는 스탠다드 변형입니다. 누구나 참여 가능하며, 보상을 비트코인 주소로 받을 수 있습니다.',
      detail:
        'Xverse 서명자가 사용하는 빌드입니다. 사용자가 체감하는 동작은 스탠다드와 비슷하게 누구나 참여 가능하고 보상을 비트코인 주소로 받을 수 있습니다. 다만 완전히 동일한 코드는 아닙니다. 스테이커에게 지급할 때 스탠다드는 비트코인 출금 정보까지 기록하지만, 이 버전은 금액만 기록합니다. 단순 포맷 차이가 아니라 실제 코드 차이이므로 별도 유형으로 표시합니다.',
    },
    'invite-only': {
      name: '초대 전용',
      summary:
        '운영자가 참여 대상을 고르는 소형 서명자 컨트랙트입니다. 보상은 Stacks의 sBTC로 지급됩니다.',
      detail:
        '운영자가 관리하는 목록에 있는지 확인한 뒤에만 스테이킹을 허용하는 짧은 컨트랙트입니다. 목록에 없으면 스테이킹이 거절됩니다. 비트코인 지급 기능은 없어서 보상은 Stacks의 sBTC로 지급됩니다. 이 컨트랙트 자체에는 수수료 로직이 없지만, 그렇다고 무료라는 뜻은 아니며 수수료가 다른 곳에서 부과될 수 있습니다.',
    },
    'native-pool': {
      name: '네이티브 풀',
      summary:
        'pox-5에 직접 스테이킹하는 대신 Native Pool 컨트랙트를 통해 참여합니다. 보상은 Stacks의 sBTC로 지급됩니다.',
      detail:
        '이 서명자는 Native Pool 컨트랙트를 통해 참여한 경우에만 스테이킹을 허용하므로, 서명자 컨트랙트에 직접 스테이킹하지 않고 Native Pool 쪽에서 가입합니다. 보상은 Stacks의 sBTC로 지급됩니다. 이 컨트랙트 자체에는 수수료 로직이 없습니다.',
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
    'app.contractsHeading': '서명자 컨트랙트',
    'app.contractsIntro':
      '컨트랙트마다 동작이 다릅니다. 컨트랙트를 눌러 어떤 기능인지, 누가 운영하는지 확인하세요.',
    'app.poolCount.one': '풀 {count}개',
    'app.poolCount.other': '풀 {count}개',
    'app.lastUpdate': '마지막 업데이트: {at}',
    'app.refreshNote': '수수료와 금액은 매시간 체인에서 다시 읽습니다.',
    'app.savedCopy':
      '기기에 저장된 마지막 사본입니다. 최신 데이터를 가져오지 못했습니다.',
    'app.updateReady': '앱의 새 버전이 준비되었습니다.',
    'app.updateApply': '새로고침',
    'app.newsletter': '뉴스레터 구독',
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
    'app.footer.identity':
      '여기의 모든 풀은 이름이 아니라 코드 해시로 식별되며, 같은 서명자 컨트랙트를 실행하면 같은 것으로 묶어 표시됩니다. 수수료는 {at} 시점에 각 컨트랙트 저장소에서 읽었고, 스테이킹 금액은 {cycle} 사이클 기준입니다.',
    'app.footer.trust':
      '여기의 내용은 신뢰에 기대지 않으며, 이 페이지도 마찬가지입니다: {link} 모든 설명은 직접 확인 가능한 Clarity 코드에 근거합니다.',
    'app.footer.trustLink': 'GitHub에서 코드 보기',
    'app.footer.madeBy':
      '제작: {link}, 위 목록의 일부 풀을 운영합니다. 해당 풀도 다른 풀과 똑같이 같은 코드 기준으로 설명되고 규모 순으로 정렬됩니다. 이 모든 내용을 공개한 이유는 누구의 말도 그대로 믿지 않아도 되게 하기 위해서입니다.',

    'filter.bitcoin.label': '보상은 비트코인으로',
    'filter.bitcoin.help':
      'Stacks의 sBTC 대신 비트코인 주소로 보상을 받습니다.',
    'filter.lowFee.label': '낮은 수수료 (5% 미만)',
    'filter.lowFee.help':
      '현재 풀 수수료가 5% 미만입니다. 수수료는 이후 변경될 수 있습니다.',
    'filter.cappedFee.label': '수수료 상한 20%',
    'filter.cappedFee.help':
      '풀 운영자가 무엇을 결정하든 컨트랙트가 수수료를 20% 초과로 올리지 못하게 막습니다.',
    'filter.feeNotice.label': '수수료 변경 사전 공지',
    'filter.feeNotice.help':
      '수수료 변경이 즉시 적용되지 않고 대기 기간이 있어, 확인하고 이동할 시간이 생깁니다.',
    'filter.open.label': '누구나 참여 가능',
    'filter.open.help':
      '초대나 회원 자격 없이 누구나 이 풀에 스테이킹할 수 있습니다.',

    'badge.anyoneCanJoin': '누구나 참여 가능',
    'badge.inviteOnly': '초대 전용',
    'badge.bitcoinRewards': '보상은 비트코인으로',
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
    'contract.bitcoinNone':
      '컨트랙트가 비트코인 주소를 다루지 않으므로 보상은 Stacks의 sBTC로 지급됩니다.',

    'signerPage.back': '← 전체 풀',
    'signerPage.key': '서명자 키',
    'signerPage.keyNone':
      '이 풀의 서명자 키가 확인되지 않아, 다른 컨트랙트와 키를 공유하는지 알 수 없습니다.',
    'signerPage.sharedBy.one': '이 키로 등록된 컨트랙트는 하나입니다',
    'signerPage.sharedBy.other': '이 키로 등록된 컨트랙트는 {count}개입니다',
    'signerPage.thisOne': '— 현재 페이지',
    'signerPage.sharedNote':
      '이 컨트랙트들은 하나의 서명자입니다. 키가 가진 스테이킹 물량과 가중치, 확보한 슬롯은 모두 함께 결정되므로, 어느 하나가 보유한 금액은 독립된 풀이 아니라 전체의 일부입니다.',
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
    'status.heading': '내 STX는 어디에 스테이킹되어 있을까?',
    'status.intro':
      '주소를 붙여넣으면 무엇을, 어느 풀에, 언제까지 스테이킹했는지 확인할 수 있습니다. 주소는 이 페이지를 벗어나지 않으며 체인에서 직접 읽습니다.',
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
      '단위는 sats입니다. 비트코인 전송에는 약간의 수수료가 들며 보상에서 차감됩니다. 3000이 무난한 시작값입니다.',
    'stake.minClaim': '지급을 시작할 최소 금액',
    'stake.minClaimHint':
      '단위는 sats입니다. 보상이 이 금액에 도달하면 누구나 지급을 실행할 수 있습니다. 높게 잡으면 지급 횟수는 줄지만 수수료로 나가는 비율도 줄어듭니다. {min}보다 커야 합니다.',

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
    'stake.error.minClaim':
      '지급 최소 금액은 {min} sats보다 큰 숫자여야 합니다. 그렇지 않으면 풀이 보낼 수 없습니다.',
    'stake.error.noPublicKey':
      '지갑이 공개키를 반환하지 않았습니다. 다시 연결한 뒤 시도하세요.',
    'stake.error.balanceLookup': '잔액 조회에 실패했습니다 ({status})',
    'stake.error.balanceRead': 'STX 잔액을 읽지 못했습니다',
  },
};
