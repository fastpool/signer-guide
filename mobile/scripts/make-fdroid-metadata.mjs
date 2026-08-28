#!/usr/bin/env node
/**
 * The Fastlane metadata tree F-Droid reads out of this repository.
 *
 * F-Droid does not take a listing from the merge request. It looks in the app's
 * own source for `fastlane/metadata/android/<locale>/`, and builds the store
 * page from whatever is there — which means the listing is versioned with the
 * code, and a release that changes the copy changes the page.
 *
 * It goes at the top of the repository, not next to the app in `mobile/`.
 * F-Droid accepts the tree in exactly three places (update.py, around the
 * `found_in_subdir` test): the repository root, `<subdir>/`, or under a build
 * flavour. Our `subdir` is `mobile/android`, so `mobile/fastlane` is none of
 * the three and gets skipped in silence — the app would publish with no
 * description and no screenshots, and nothing would say why. `mobile/android`
 * is out too: `expo prebuild --clean` deletes that directory wholesale.
 *
 * Generated, like the Zapstore config, from the same text the Play and App
 * Store listings use. Four listings hand-written separately is four listings
 * that disagree by the third release.
 *
 * Korean ships too. The app speaks it, so the store page should.
 *
 *   node scripts/make-fdroid-metadata.mjs
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/** The listing is read from the top of the repository — see above. */
const repoRoot = path.resolve(root, '..');
const read = (relative) =>
  readFileSync(path.join(root, relative), 'utf8').trim();

const versionCode = 1;

/** F-Droid's own limits, which are Play's. */
const LIMITS = { title: 50, short: 80, full: 4000 };

/**
 * Korean, for the locale F-Droid calls `ko`.
 *
 * Taken from the app's own catalogue rather than translated again here — the
 * summary is the app's own one-line description of itself, and the description
 * is the English one with its opening paragraph replaced. F-Droid falls back to
 * en-US for anything a locale does not carry, so a partial Korean page is a
 * page, not a hole.
 */
const KO_SHORT = 'STX를 자기 지갑에 잠그고 매주 비트코인을 받는 스테이킹 가이드.';
const KO_FULL = `Stacks의 비트코인 스테이킹. STX는 지갑을 떠나지 않습니다. 지금 있는 자리에서 잠기고, 그 물량이 서명자에게 힘을 실어 주며, 매주 비트코인이 돌아옵니다.

Signer Guide는 pox-5에 등록된 45개 풀을 모두 보여 주고, 각 풀을 배포한 이름이 아니라 컨트랙트 코드의 해시로 식별합니다. 수수료는 체인에서 직접 읽습니다. 코드가 강제하는 상한과 운영자가 오늘 바꿀 수 있는 요율을 구분해 표시합니다.

서명은 Leather, Xverse, OKX에서 이루어집니다. 트랜잭션의 생성·서명·전송은 모두 내 지갑이 합니다. 이 앱은 개인키를 보지도, 묻지도 않습니다. 계정도, 가입도, 수집하는 정보도 없습니다.

여기 나열된 풀 중 일부를 운영하는 Fast Pool이 만들었으며, 그 풀들도 다른 모든 풀과 똑같은 탐지기로 설명됩니다.`;

const LOCALES = {
  'en-US': {
    title: 'Signer Guide',
    short: read('store/play/en-US/short_description.txt'),
    full: read('store/play/en-US/full_description.txt'),
    changelog: read('store/play/en-US/changelogs/default.txt'),
  },
  ko: {
    title: 'Signer Guide',
    short: KO_SHORT,
    full: KO_FULL,
    changelog: read('store/play/en-US/changelogs/default.txt'),
  },
};

const SCREENSHOTS = [
  '01-welcome',
  '02-start',
  '03-your-stake',
  '04-contracts',
  '05-pools',
  '06-payouts',
  '07-the-data',
  '08-preferences',
];

function within(name, text, limit) {
  if (text.length > limit) {
    throw new Error(
      `${name} is ${text.length} characters; F-Droid takes ${limit}`,
    );
  }
  return text;
}

for (const [locale, copy] of Object.entries(LOCALES)) {
  const dir = path.join(repoRoot, 'fastlane/metadata/android', locale);
  mkdirSync(path.join(dir, 'changelogs'), { recursive: true });
  mkdirSync(path.join(dir, 'images/phoneScreenshots'), { recursive: true });

  writeFileSync(
    path.join(dir, 'title.txt'),
    `${within('title', copy.title, LIMITS.title)}\n`,
  );
  writeFileSync(
    path.join(dir, 'short_description.txt'),
    `${within('short_description', copy.short, LIMITS.short)}\n`,
  );
  writeFileSync(
    path.join(dir, 'full_description.txt'),
    `${within('full_description', copy.full, LIMITS.full)}\n`,
  );
  writeFileSync(
    path.join(dir, `changelogs/${versionCode}.txt`),
    `${copy.changelog}\n`,
  );

  copyFileSync(
    path.join(root, 'assets/icon.png'),
    path.join(dir, 'images/icon.png'),
  );
  SCREENSHOTS.forEach((name, index) => {
    copyFileSync(
      /*
       * The framed captures, not the raw ones. F-Droid shows screenshots at
       * full width with nothing around them, so the caption band is what
       * carries the claim — the same job it does in Play's carousel.
       */
      path.join(root, `store/screenshots/play/${name}.png`),
      path.join(
        dir,
        `images/phoneScreenshots/${String(index + 1).padStart(2, '0')}.png`,
      ),
    );
  });

  console.log(`wrote fastlane/metadata/android/${locale}`);
}
