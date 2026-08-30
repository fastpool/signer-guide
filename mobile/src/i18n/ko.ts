/**
 * Korean.
 *
 * Typed against the English bundle, so this file cannot drift: a key added in
 * `en.ts` and missed here fails the build, and a key removed there but left
 * here does too.
 *
 * The vocabulary is the web guide's — `src/locales/ko.ts` — so that a reader
 * who has read the site meets the same words in the app: 서명자 컨트랙트 for a
 * signer contract, 스테이킹 for staking, 사이클 for a reward cycle, 풀 for a
 * pool. Where this app says something the site does not, the phrasing follows
 * the same register: plain, 합니다체, and no English left untranslated except
 * the tickers and the protocol's own names.
 */
import type { MobileBundle } from './en';

export const ko: MobileBundle = {
  name: '한국어',
  messages: {
    // ------------------------------------------------------------- common --
    'common.open': '열기',
    'common.change': '변경',
    'common.details': '상세',
    'common.copy': '복사',
    'common.tryAgain': '다시 시도',
    'common.forget': '해제',
    'common.max': '최대',
    'common.done': '완료',
    'common.notKnown': '알 수 없음',
    'common.cycle': '{cycle} 사이클',

    // --------------------------------------------------------------- home --
    'home.title': '서명자 가이드',
    'home.tagline': '내 STX가 어디에 스테이킹되어 있고 얼마를 버는지.',
    'home.loadingPosition': '체인에서 스테이킹 내역을 읽는 중',
    'home.chainError': '체인이 응답하지 않았습니다',
    'home.preferences': '설정',

    'home.connect.label': '내 스테이킹',
    'home.connect.title': '지갑을 연결하면 보입니다',
    'home.connect.body':
      '지갑은 별도의 앱입니다 — Leather, Xverse, OKX. 사용하는 지갑을 고르면 그 앱이 열리고, 거기서 확인만 하면 바로 여기로 돌아옵니다. 연결만으로는 아무것도 서명되지 않고 아무것도 움직이지 않습니다.',
    'home.connect.button': '지갑 연결',
    'home.connect.watch': '주소만 조회하기',

    'home.notStaking.label': '내 스테이킹',
    'home.notStaking.title': '아직 스테이킹이 없습니다',
    'home.notStaking.body':
      '스테이킹을 해도 STX는 지금 있는 곳, 즉 내 지갑 안에서 잠깁니다. 그 물량이 서명자에게 힘을 실어 주고, 그것이 비트코인을 버는 방식입니다. 이 방식으로 시작하면 풀과 설정이 미리 정해져 화면에 표시됩니다. 직접 고르려면 아래 줄을 누르세요.',
    'home.notStaking.start': '스테이킹 시작',
    'home.notStaking.chooseYourself': '컨트랙트와 풀을 직접 고르기',

    'home.more.title': '가이드의 나머지',
    'home.more.contracts': '서명자 컨트랙트',
    'home.more.contractsHint': '풀들이 실행하는 컨트랙트, 쉬운 말로',
    'home.more.pools': '모든 풀',
    'home.more.poolsHint': '총 {count}개와 각 풀의 스테이킹 규모',
    'home.more.history': '지급 회차별 실제 지급액',
    'home.more.historyHint': '사이클별, 1,000 STX당 sats',
    'home.more.data': '이 숫자들의 출처',
    'home.more.dataUpdated': '{when} 갱신',
    'home.more.dataStale': '저장된 사본을 표시 중 — 브랜치가 응답하지 않았습니다',

    // --------------------------------------------------------------- rate --
    'rate.label': '현재 수익',
    'rate.cycle': '{cycle} 사이클',
    'rate.sats': 'sats',
    'rate.unit': '1,000 STX당, 지급 회차마다',
    'rate.apy': '연 환산',
    'rate.next': '다음 지급',
    'rate.nextIn': '{duration} 후',
    'rate.last': '직전 지급',
    'rate.historyLink': '지급 회차별 실제 지급액 →',
    'rate.unreadable': '이번에는 공개된 수치를 읽지 못했습니다.',

    // ----------------------------------------------------------- position --
    'position.label': '내 스테이킹',
    'position.active': '스테이킹 중',
    'position.account': '내 스테이킹',
    'position.earnings':
      '지급 회차마다 약 {payout}, 현재 수익률로 1년이면 약 {year}입니다.',
    'position.earningsUnknown':
      '공개된 수익률이 없으면 얼마를 버는지 계산할 수 없습니다.',
    'position.stakedWith': '스테이킹한 풀',
    'position.contractNamed': '{name} 컨트랙트',
    'position.unreviewed': '여기서 검토하지 않은 컨트랙트',
    'position.lockedUntil': '잠금 종료',
    'position.alreadyUnlocked': '이미 해제됨',
    'position.endsThisCycle': '이번 사이클이 끝나면 종료',
    'position.moreCycles': '{count}개 남음, 약 {duration}',
    'position.rewardsGoTo': '보상 수령 방식',
    'position.sbtc': '이 지갑으로, sBTC',
    'position.sbtcHint': '등록된 비트코인 주소가 없어 Stacks의 sBTC로 지급됩니다.',
    'position.btcTo': '{address}로, BTC',
    'position.btcHint': '비트코인으로 출금되며, 매 지급마다 최대 {fee}이(가) 트랜잭션 수수료로 쓰입니다.',
    'position.payoutUnknown': '풀이 보상을 어디로 보내는지 알려주지 않았습니다.',
    'position.change': '추가·연장·이동',

    // ------------------------------------------------------------- wallet --
    'wallet.title': '내 지갑',
    'wallet.intro':
      '지갑은 별도의 앱입니다. 사용하는 지갑을 고르면 그 앱이 열려 괜찮은지 묻고, 다시 여기로 돌아옵니다. 연결만으로는 아무것도 서명되지 않고 아무것도 움직이지 않습니다.',
    'wallet.connected': '연결됨',
    'wallet.watching': '조회 중',
    'wallet.readOnly':
      '조회 전용입니다. 직접 입력한 주소이므로 이 주소로는 아무것도 서명할 수 없습니다.',
    'wallet.canSign': '{wallet}(으)로 연결되어 있습니다. 서명은 그 앱에서 이루어집니다.',
    'wallet.copyLink': '연결 링크 복사',
    'wallet.testWallet': '테스트 지갑',
    'wallet.connectBody':
      'WalletConnect는 마지막 수단이며, 그 이유를 숨기지 않습니다. Leather는 지원하지 않습니다 — 자체 이슈 트래커에 아직 미완료 요청으로 올라와 있습니다. Xverse는 잠금 화면까지만 확인되었습니다. 그래서 여기서는 페어링 링크 자체를 제공하며, 실제로 사용하는 지갑이 무엇이든 그 링크를 쓸 수 있습니다.',
    'wallet.connectHeading': '지갑 연결',
    'wallet.connecting': '지갑의 응답을 기다리는 중',
    'wallet.linkCopied': '연결 링크를 복사했습니다. 사용하는 지갑에 붙여넣으세요 — WalletConnect 링크를 받는 지갑이면 무엇이든 됩니다.',
    'wallet.stopWaiting': '기다리지 않기',
    'wallet.browserHeading': '지갑 안에서 가이드 열기',
    'wallet.browserBody':
      'Leather와 Xverse에는 각각 자체 브라우저가 있고, 그 안에서 연 페이지는 지갑과 직접 통신할 수 있습니다. Leather는 WalletConnect를 지원하지 않으므로 이 방법으로 연결합니다.',
    'wallet.openIn': '{wallet}에서 열기',
    'wallet.browserReturn':
      '가이드가 그 안에서 열리며 스테이킹 과정을 모두 진행할 수 있습니다. 끝난 뒤 여기로 돌아와 주소를 조회하면 결과를 볼 수 있습니다.',
    'wallet.watchHeading': '주소만 조회하기',
    'wallet.watchBody':
      '아무것도 연결하지 않고 특정 주소의 스테이킹 내역과 수익을 볼 수 있습니다. BNS 이름도 됩니다 — 인덱서가 아니라 레지스트리에 직접 조회합니다. 조회 전용이므로 스테이킹하거나 변경할 수는 없습니다.',
    'wallet.addressLabel': 'Stacks 주소 또는 BNS 이름',
    'wallet.addressPlaceholder': 'SP… 또는 name.btc',
    'wallet.nameUnregistered': '{name}의 소유자가 없습니다.',
    'wallet.nameLookupFailed':
      '노드가 응답하지 않아 이름을 조회하지 못했습니다. 등록되지 않았다는 뜻은 아닙니다.',
    'wallet.watchSubmit': '이 주소 조회하기',
    'wallet.keys':
      '트랜잭션의 생성·서명·전송은 모두 내 지갑이 합니다. 이 앱은 개인키를 보지도, 묻지도 않습니다.',
    'wallet.notInstalled':
      '아무것도 열리지 않는다면 해당 지갑이 이 휴대폰에 설치되어 있지 않을 가능성이 높습니다.',

    // -------------------------------------------------------- preferences --
    'prefs.title': '설정',
    'prefs.appearance': '화면 모드',
    'prefs.appearance.light': '밝게',
    'prefs.appearance.dark': '어둡게',
    'prefs.appearance.system': '시스템',
    'prefs.appearance.hint':
      '시스템은 휴대폰 설정을 따릅니다. 지금 햇빛 아래인지는 휴대폰이 이미 알고 있습니다.',
    'prefs.language': '언어',
    'prefs.language.hint':
      '번역이 있는 경우 컨트랙트 설명도 함께 번역됩니다.',
    'prefs.wallet': '지갑',
    'prefs.wallet.nothing': '상태',
    'prefs.wallet.none': '연결된 지갑 없음',
    'prefs.wallet.manage': '지갑 연결 또는 주소 조회',
    'prefs.about': '정보',
    'prefs.about.data': '이 숫자들의 출처',
    'prefs.about.source': '소스 코드 보기',
    'prefs.version': '버전 {version}',

    // --------------------------------------------------------- onboarding --
    'welcome.eyebrow': '서명자 가이드',
    'welcome.headline': 'STX를 잠그고\n비트코인을 버세요.',
    'welcome.earning': '스테이커들의 현재 수익률',
    'welcome.aYear': '연',
    'welcome.rateNote':
      '직전 지급들이 실제로 지급한 수익률로, 매주 비트코인으로 지급됩니다. 수익률은 변합니다 — 약속이 아니라 지금의 값입니다.',
    'welcome.step1.title': 'STX는 계속 내 것입니다',
    'welcome.step1.body':
      '내 지갑 안에서 잠길 뿐 어디로도 전송되지 않습니다. 누구도 옮기거나 쓰거나 빌려줄 수 없습니다.',
    'welcome.step2.title': '풀이 대신 서명합니다',
    'welcome.step2.body':
      '비트코인을 버는 것은 서명이고, 내 STX는 풀에 더 큰 서명 권한을 실어 줍니다. 지지하는 서명자는 2주마다 바꿀 수 있습니다.',
    'welcome.step3.title': '언제든 그만둘 수 있습니다',
    'welcome.step3.body':
      '잠긴 STX는 선택한 기간이 끝날 때까지 수익을 냅니다. 그전에 그만둬도 불이익은 없으며, 잠금은 해당 사이클이 끝날 때 종료됩니다.',
    'welcome.start': '스테이킹 시작',
    'welcome.skip': '가이드만 볼게요',
    'welcome.wallets':
      '이 휴대폰에 Leather, Xverse 또는 OKX가 필요합니다. 서명은 그 앱에서 이루어지며, 이 앱은 개인키를 보지 않습니다.',

    // -------------------------------------------------------------- start --
    'start.title': '스테이킹 시작',
    'start.intro':
      '아래 항목은 모두 미리 정해져 있습니다. 원하면 바꾸고, 아니면 금액만 입력하세요.',
    'start.noPool':
      '이 데이터 사본에는 등록되어 있고 누구나 참여할 수 있는 풀이 없어 제안할 대상이 없습니다. 전체 목록은 “모든 풀”에 있습니다.',
    'start.alreadyStaking': '이미 스테이킹 중입니다',
    'start.alreadyStakingBody':
      '추가·연장·이동은 모두 같은 화면에서 하며, 현재 참여 중인 풀로 열립니다.',
    'start.changeStake': '스테이킹 변경',
    'start.step1': '1/2 단계 · 지갑',
    'start.step2': '2/2 단계 · 금액',
    'start.connectHeading': '지갑 연결',
    'start.amountLabel': '스테이킹할 금액',
    'start.balance': '잠글 수 있는 금액 {amount}',
    'start.balanceLoading': '잔액을 읽는 중…',
    'start.balanceUnknown': '노드에서 잔액을 읽지 못했습니다.',
    'start.earnings':
      '현재 수익률이면 주당 약 {payout}, 1년이면 약 {year}입니다.',
    'start.reason':
      'Fast Pool이 직접 운영하는 풀이고, 이 앱도 Fast Pool이 만들었습니다 — 평가가 아니라 선호입니다. 확인할 수 있는 사실은 이렇습니다. {contract} 컨트랙트를 실행하므로 {fee}, 누구에게나 스테이킹을 받습니다. 다른 {count}개는 “변경”을 눌러 보세요.',
    'start.reasonFallback':
      '이 앱이 보통 제안하는 풀이 지금 스테이킹을 받지 않아 규칙으로 선택했습니다. 검토된 컨트랙트, 누구나 참여 가능, 그리고 조건을 만족하는 {count}개 중 가장 낮은 수수료입니다.',
    'start.reasonNoFee': '수수료를 받지 않습니다',
    'start.reasonLowestFee': '수수료 상한이 5%이고 인상 시 한 달 전에 공지해야 하며, 현재는 {percent}%입니다',
    'start.projectionLabel': '현재 수익률 기준',
    'start.setForYou': '미리 정해진 항목',
    'start.noFee': '수수료 없음',
    'start.fee': '수수료 {percent}%',
    'start.poolMeta': '{fee} · {contract} 컨트랙트',
    'start.rewards': '보상',
    'start.rewardsValue': 'sBTC로 지급',
    'start.rewardsHint':
      '같은 지갑으로 sBTC가 지급됩니다. 입력할 주소가 없으니 잘못 입력할 일도 없습니다.',
    'start.period': '잠금 기간',
    'start.periodHint':
      '수익이 발생하는 한 사이클입니다. 언제든 연장할 수 있고, 그전에 불이익 없이 그만둘 수도 있습니다.',
    'start.fullForm': '직접 설정하기',
    'start.loading': '체인을 읽는 중',
    'start.submit': '서명하고 스테이킹',
    'start.failed': '처리되지 않았습니다',

    // -------------------------------------------------------------- stake --
    'stake.stakeWith': '스테이킹할 풀',
    'stake.changeWith': '스테이킹을 변경할 풀',
    'stake.moveTo': '이동할 풀',
    'stake.moving':
      '다른 풀에 스테이킹되어 있습니다. 한 번의 트랜잭션으로 전체 물량이 옮겨지며, 중간에 잠금이 풀리지 않습니다.',
    'stake.loading': '스테이킹 내역을 읽는 중',
    'stake.amountAdd': '추가로 스테이킹할 금액',
    'stake.amountFirst': '스테이킹할 금액',
    'stake.extend': '잠금 연장',
    'stake.extendNone': '연장 없음',
    'stake.extendBy': '+{count}',
    'stake.remaining': '이번 사이클 이후 {count}개 남았습니다.',
    'stake.remainingFloor':
      ' pox-5는 남은 사이클이 없는 포지션을 변경할 수 없으므로 최소 {min}개가 필요합니다.',
    'stake.remainingUnknown': '잠금이 얼마나 남았는지 읽지 못했습니다.',
    'stake.lockFor': '잠금 기간',
    'stake.cycles': '{count} 사이클',
    'stake.cycle': '{count} 사이클',
    'stake.lockHint':
      '수익이 발생하는 기간은 약 {duration}입니다. 그전에 불이익 없이 그만둘 수 있습니다 — 스테이킹이 생기면 “종료하기”를 보세요.',
    'stake.rewards': '보상',
    'stake.rewardsBtc': '비트코인 주소로 출금',
    'stake.rewardsSbtc': 'sBTC로 이 지갑에',
    'stake.btcAddress': '비트코인 주소',
    'stake.btcAddressHint':
      '내 몫이 sBTC에서 출금되어 비트코인 본체의 이 주소로 도착합니다. 서명자 컨트랙트가 이 주소를 체인에 저장하므로 반드시 확인하세요 — 잘못된 주소로 보낸 지급은 되돌릴 수 없습니다.',
    'stake.maxFee': '지급액 중 비트코인 수수료로 쓸 수 있는 최대액',
    'stake.minClaim': '지급할 가치가 있는 최소 금액',
    'stake.maxFeeShort': '지급당 최대 수수료',
    'stake.minClaimShort': '최소 지급액',
    'stake.feeNote':
      '수수료는 지급액에서 차감되며, sBTC 서명자는 수수료가 1,000 sats 미만인 지급은 보내지 않습니다. 최소 지급액은 수수료에 더스트 한도를 더한 {floor} sats를 넘어야 하며, 컨트랙트가 받는 최솟값은 {lowest} sats입니다. 그에 못 미치면 전송하지 않고 다음 지급까지 기다립니다.',
    'stake.problem.maxFeeFloor':
      'sBTC 서명자는 수수료가 1,000 sats 미만인 지급은 보내지 않습니다.',
    'stake.endingPill': '종료하기 — 언스테이킹',
    'stake.noMinClaim':
      '이 컨트랙트는 최소 지급액을 받지 않고 자체 값을 사용합니다.',
    'stake.sbtcNote':
      '보상은 같은 지갑으로 sBTC가 지급됩니다. 체인에 기록되는 비트코인 주소가 없으므로 잘못 입력할 일도, 갱신할 일도 없습니다.',
    'stake.projection': '현재 수익률 기준 예상 수익',
    'stake.projectionPayout': '지급 회차마다',
    'stake.projectionYear': '1년',
    'stake.projectionNote':
      '현재 수익률에서 계산한 추정치이며 약속이 아닙니다. 실제 지급액은 pox-5의 수익과 스테이킹된 STX 총량에 따라 달라집니다.',
    'stake.submitChange': '변경에 서명',
    'stake.submitFirst': '서명하고 스테이킹',
    'stake.keys':
      '이 트랜잭션의 생성·서명·전송은 모두 내 지갑이 합니다. 이 앱은 개인키를 보지 않습니다.',
    'stake.endingTitle': '종료하기',
    'stake.endingBody':
      '언스테이킹하면 선택했던 기간과 관계없이 이번 사이클이 끝날 때 포지션이 종료되며, 일찍 그만둔다고 불이익은 없습니다. 오늘 잠금이 풀리지도, STX가 움직이지도 않습니다.',
    'stake.unstake': '언스테이킹',
    'stake.failed': '처리되지 않았습니다',

    'stake.problem.connect': '스테이킹하려면 먼저 지갑을 연결하세요.',
    'stake.problem.watching':
      '조회 중인 주소이며 연결된 지갑이 아닙니다. 스테이킹하려면 지갑을 연결하세요.',
    'stake.problem.notAnAmount':
      'STX 금액이 아닙니다. 소수점 이하는 여섯 자리까지입니다.',
    'stake.problem.enterAmount': '스테이킹할 금액을 입력하세요.',
    'stake.problem.tooMuch': '잠글 수 있는 금액 {amount}을(를) 초과했습니다.',
    'stake.problem.cycles': '잠금 기간은 1~{max} 사이클입니다.',
    'stake.problem.btcAddress': '비트코인 주소 형식이 아닙니다.',
    'stake.problem.maxFee':
      '지급 시 쓸 수 있는 최대 수수료는 sats 단위 숫자여야 합니다.',
    'stake.problem.minClaim':
      '지급할 가치가 있는 최소 금액은 {floor} sats를 넘어야 합니다.',
    'stake.problem.nothingToChange':
      '변경할 내용이 없습니다 — STX를 추가하거나, 잠금을 연장하거나, 다른 풀로 옮기세요.',
    'stake.problem.preparePhase':
      'pox-5는 준비 단계에서는 변경을 거부합니다. 사이클이 바뀐 뒤 다시 시도하세요.',
    'stake.problem.refused': 'pox-5가 거부할 요청입니다: {reason}',

    // --------------------------------------------------------------- sent --
    'sent.stake': '스테이킹 전송됨',
    'sent.unstake': '언스테이킹 전송됨',
    'sent.pending': '체인 확인 대기 중',
    'sent.confirmed': '확정됨',
    'sent.failed': '처리되지 않음',
    'sent.headlinePending': '전송 완료 — 블록을 기다리는 중',
    'sent.headlineStaked': '{pool}에 스테이킹했습니다',
    'sent.headlineUnstaked': '이번 사이클을 끝으로 스테이킹이 종료됩니다',
    'sent.headlineFailed': '체인이 거부했습니다',
    'sent.watching': '트랜잭션을 확인하는 중',
    'sent.notePending':
      'Stacks 블록은 몇 분이 걸립니다. 이 화면을 벗어나도 트랜잭션은 그대로 진행됩니다.',
    'sent.noteFailed':
      '잠긴 금액은 없습니다. 수수료는 소모되었으며, 거부 사유는 익스플로러에서 확인할 수 있습니다.',
    'sent.noteConfirmed': '보상은 포지션이 포함되는 다음 사이클부터 시작됩니다.',
    'sent.transaction': '트랜잭션',
    'sent.copyId': 'ID 복사',
    'sent.explorer': '익스플로러 열기',
    'sent.backHome': '내 스테이킹으로 돌아가기',

    // ---------------------------------------------------------- contracts --
    'contracts.title': '컨트랙트 선택',
    'contracts.intro':
      '모든 풀은 이 중 하나를 실행합니다. 보상을 어떻게 계산해 지급하는지 — 비트코인 주소로 보낼 수 있는지, 풀이 얼마를 가져갈 수 있는지 — 를 정하는 코드입니다. 규칙을 먼저 고르고 풀은 그다음입니다.',
    'contracts.poolCount': '{count}개 풀',
    'contracts.poolCountOne': '{count}개 풀',
    'contracts.staked': '{amount} 스테이킹',

    'contract.missing': '이 데이터 사본에는 해당 컨트랙트가 없습니다.',
    'contract.runBy': '{count}개 풀이 이 코드를 실행합니다',
    'contract.runByOne': '{count}개 풀이 이 코드를 실행합니다',
    'contract.identiconOutliers':
      '이 중 {count}개 풀은 다른 아이콘을 표시합니다. 같은 코드를 실행하지만, 아이콘은 주석까지 포함한 원본에서 그려지므로 주석을 지운 풀은 다른 아이콘이 됩니다.',
    'contract.choosePool': '풀 선택',
    'contract.poolsRunning': '이 컨트랙트를 실행하는 풀',
    'contract.chooseIntro':
      '모두 위 컨트랙트를 실행하므로 보상 계산과 지급 방식은 같습니다. 다른 점은 각자의 수수료, 규모, 그리고 운영 주체입니다.',
    'contract.noPool': '참여할 수 있는 풀이 없습니다',
    'contract.noPoolBody':
      '이 컨트랙트를 실행하는 풀 중 등록되어 있고 열려 있는 곳이 없습니다.',
    'contract.hidden':
      '{count}개 풀이 이 컨트랙트를 더 실행하지만 등록되지 않았거나 누구에게나 열려 있지 않아 목록에서 제외했습니다.',
    'contract.hiddenOne':
      '{count}개 풀이 이 컨트랙트를 더 실행하지만 등록되지 않았거나 누구에게나 열려 있지 않아 목록에서 제외했습니다.',

    // --------------------------------------------------------------- pool --
    'pool.missing': '이 데이터 사본에는 해당 풀이 없습니다.',
    'pool.guessedName':
      '풀이 알려준 이름이 아니라 컨트랙트 ID에서 추정한 이름입니다.',
    'pool.stakedCycle': '{cycle} 사이클 스테이킹',
    'pool.nextCycle': '다음 {cycle} 사이클',
    'pool.fee': '수수료',
    'pool.stakeWith': '{pool}에 스테이킹',
    'pool.stakeGeneric': '이 풀에 스테이킹',
    'pool.notOpen':
      '이 풀은 아무나 받지 않으므로 앱에서 스테이킹을 제안하지 않습니다.',
    'pool.notRegistered':
      '이 풀은 현재 사이클에 등록되어 있지 않아 스테이킹이 거부됩니다.',
    'pool.contractSection': '실행 중인 컨트랙트',
    'pool.readIt': '내용 보기',
    'pool.unreviewed':
      '이 컨트랙트는 여기서 검토하지 않았습니다. 검증하지 않은 배지는 붙이지 않으며, 보상을 어떻게 계산해 지급하는지도 확인되지 않았습니다.',
    'pool.identity': '식별 정보',
    'pool.contractId': '컨트랙트',
    'pool.signerKey': '서명자 키',
    'pool.noSignerKey': '등록된 키 없음',
    'pool.registered': '등록됨',
    'pool.notRegisteredPill': '미등록',
    'pool.firstSeen': '{cycle} 사이클에 처음 확인',
    'pool.match': '일치: {match}',
    'pool.undistributed': '미분배',
    'pool.unclaimed': 'pox-5 미수령',
    'pool.unclaimedAsOf': '{cycle} 사이클 기준',

    // -------------------------------------------------------------- pools --
    'pools.title': '모든 풀',
    'pools.subtitle': 'pox-5의 서명자 컨트랙트 {count}개, 스테이킹 규모순입니다.',
    'pools.search': '이름 또는 컨트랙트로 검색',
    'pools.noMatch': '“{query}”와 일치하는 항목이 없습니다.',
    'pools.stakedPill': '{amount} 스테이킹',
    'pools.feePill': '수수료 {percent}%',
    'pools.feeUnknown': '수수료 불명',
    'pools.notRegistered': '미등록',
    'pools.notOpen': '전체 공개 아님',

    // ------------------------------------------------------------ history --
    'history.title': '지급 회차별 실제 지급액',
    'history.intro':
      'pox-5는 1,050 번 블록마다 — 보상 사이클의 절반, 약 일주일마다 — 보상을 계산하므로 아래 각 보상 사이클에는 두 번의 지급이 들어 있습니다.',
    'history.estimatedNow': '현재 추정치, {cycle} 사이클',
    'history.blended': '종합 추정치',
    'history.blendedUnit': 'sats 종합',
    'history.projected': '이번 회차 누적',
    'history.projectedHint': '외삽값이며 회차 초반에는 변동이 큽니다',
    'history.lastPayout': '{cycle} 사이클 지급',
    'history.lastPayoutGeneric': '직전 지급',
    'history.lastPayoutHint': 'pox-5가 실제로 지급한 금액',
    'history.read': '{when} 기준. 모든 수치는 1,000 STX당입니다.',
    'history.every': '기록된 모든 지급',
    'history.loading': '기록을 가져오는 중',
    'history.missing': '아직 기록이 없습니다 — 갱신이 아직 기록하지 않았습니다.',
    'history.failed': '기록을 가져오지 못했습니다.',
    'history.cycle': '{cycle} 사이클',
    'history.stillPaying': '지급 진행 중',
    'history.firstHalf': '전반',
    'history.secondHalf': '후반',
    'history.burn': '번 블록 {height}',
    'history.notWorkedOut': '계산되지 않음',

    // --------------------------------------------------------------- data --
    'data.title': '이 숫자들의 출처',
    'data.intro':
      '풀 데이터는 가이드 저장소의 스크립트가 매시간 생성해 브랜치에 커밋합니다. 이 앱은 그 브랜치를 읽고, 사용자에 관한 정보는 체인에서 직접 읽습니다.',
    'data.poolData': '풀 데이터',
    'data.origin.bundled': '이 빌드에 포함되어 배포된 사본',
    'data.origin.cache': '이 휴대폰이 마지막으로 내려받은 사본',
    'data.origin.network': '방금 읽은 공개 브랜치',
    'data.generated': '생성 시각',
    'data.downloaded': '내려받은 시각',
    'data.stale':
      '이번에는 브랜치가 응답하지 않아 저장된 사본을 표시하고 있습니다.',
    'data.refresh': '다시 가져오기',
    'data.howRate': '수익률 계산 방식',
    'data.howRateBody':
      'pox-5는 {blocks} 번 블록마다 지급합니다. 공개 수치는 이번 회차에 지금까지 쌓인 금액과 직전에 완료된 지급이 실제로 지급한 금액을 가중 평균한 값입니다. 회차 초반에는 누적액의 변동이 커서 실제 지급액 쪽에 더 큰 가중치를 둡니다.',
    'data.totalStaked': 'pox-5 총 스테이킹',
    'data.stxPrice': 'STX 가격',
    'data.burnHeight': '번 블록 높이',
    'data.talksTo': '이 앱이 통신하는 곳',
    'data.stacksNode': 'Stacks 노드',
    'data.wallets': '지갑',
    'data.walletsMock': '이 빌드에는 테스트 지갑이 켜져 있습니다',
    'data.walletsReal': 'WalletConnect로 Leather, Xverse, OKX에 연결',
    'data.walletsNone': '설정된 지갑 경로가 없습니다',
    'data.walletsMockHint':
      '아무것도 서명되지 않습니다. 이 빌드는 누구의 STX도 움직일 수 없습니다.',
    'data.walletsRealHint':
      '트랜잭션의 생성·서명·전송은 내 지갑이 합니다. 이 앱은 개인키를 보지 않습니다.',
    'data.openWeb': '웹에서 가이드 열기',
    'data.madeBy':
      '여기 나열된 풀 중 일부를 운영하는 Fast Pool이 만들었습니다. 그 풀들도 다른 모든 풀과 똑같은 탐지기로 설명되고 똑같은 규모 기준으로 정렬됩니다 — 이 모든 것을 공개하는 이유가 그것입니다.',

    // ------------------------------------------------------------ features --
    'feature.bitcoinYes': 'Stacks의 sBTC 대신 비트코인 주소로 보상 지급',
    'feature.bitcoinViaPool':
      '비트코인 주소를 기록하지만 지급은 sBTC로 — 비트코인은 풀이 직접 보냅니다',
    'feature.bitcoinNo': 'Stacks의 sBTC로 지급 — 비트코인으로는 보낼 수 없음',
    'feature.openYes': '누구나 참여 가능',
    'feature.openNo': '풀이 참여 대상을 정함',
    'feature.feeCapped': '컨트랙트가 수수료를 {percent}%로 제한',
    'feature.feeUncapped': '코드에 수수료 상한이 없음',
    'feature.feeNotice': '수수료 인상은 미리 공지해야 함',
    'feature.feeExemption': '일부 스테이커는 수수료가 면제될 수 있음',

    // ----------------------------------------------------------- identicon --
    'identicon.label': '이 컨트랙트 코드의 아이콘',
    'identicon.new': '새 코드, 아직 표준화되지 않음',
  },
};
