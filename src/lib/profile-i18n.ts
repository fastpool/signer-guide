import type { Locale } from './i18n';
import type { ManagerProfile } from './profiles';

type ProfileTranslation = {
  name?: string;
  summary: string;
  detail: string;
};

const KO_PROFILE_TEXT: Record<string, ProfileTranslation> = {
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
};

export function localizeProfile(
  profile: ManagerProfile,
  locale: Locale,
): ManagerProfile {
  if (locale !== 'ko') return profile;
  const translated = KO_PROFILE_TEXT[profile.id];
  if (!translated) return profile;
  return {
    ...profile,
    name: translated.name ?? profile.name,
    summary: translated.summary,
    detail: translated.detail,
  };
}
