import type { Locale } from './i18n';

type MetaCopy = {
  htmlLang: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogLocale: string;
};

const META_COPY: Record<Locale, MetaCopy> = {
  en: {
    htmlLang: 'en',
    title: 'Signer Guide - who can you stake your STX with?',
    description:
      'A plain-language guide to the Stacks signer pools you can stake your STX with.',
    ogTitle: 'Signer Guide - who can you stake your STX with?',
    ogDescription:
      "A plain-language guide to the Stacks signer pools you can stake your STX with. Fees, ceilings and who may join, read from each contract's own code.",
    ogLocale: 'en_US',
  },
  ko: {
    htmlLang: 'ko',
    title: 'Signer Guide - STX를 어디에 스테이킹할 수 있나요?',
    description:
      'STX를 스테이킹할 수 있는 Stacks 서명자 풀을 쉽게 설명하는 가이드입니다.',
    ogTitle: 'Signer Guide - STX를 어디에 스테이킹할 수 있나요?',
    ogDescription:
      'STX를 스테이킹할 수 있는 Stacks 서명자 풀을 쉽게 설명하는 가이드입니다. 수수료, 상한, 참여 조건을 각 컨트랙트 코드에서 직접 읽어 보여줍니다.',
    ogLocale: 'ko_KR',
  },
};

function setMeta(
  selector: string,
  value: string,
  attr: 'content' = 'content',
): void {
  const tag = document.querySelector(selector);
  if (!tag) return;
  tag.setAttribute(attr, value);
}

export function applyLocaleMetadata(locale: Locale): void {
  const copy = META_COPY[locale];

  document.documentElement.setAttribute('lang', copy.htmlLang);
  document.title = copy.title;

  setMeta('meta[name="description"]', copy.description);
  setMeta('meta[property="og:title"]', copy.ogTitle);
  setMeta('meta[property="og:description"]', copy.ogDescription);
  setMeta('meta[property="og:locale"]', copy.ogLocale);
}
