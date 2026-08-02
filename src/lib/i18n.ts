export type Locale = 'en' | 'ko';

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function languageName(locale: Locale): string {
  return locale === 'ko' ? '한국어' : 'English';
}

export function formatLastUpdate(generatedAt: string, locale: Locale): string {
  const at = new Date(generatedAt);
  const day = at.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${day}, ${hh}:${mm} UTC`;
}
