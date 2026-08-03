import { languageName, LOCALES, type Locale } from '../lib/i18n';

/** Each language named in itself, so it is readable to the reader who needs it. */
export default function LocaleSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className='inline-flex rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(44,42,53,0.08)]'>
      {LOCALES.map((choice) => (
        <button
          key={choice}
          type='button'
          onClick={() => onChange(choice)}
          aria-pressed={locale === choice}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
            locale === choice
              ? 'bg-grape text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          {languageName(choice)}
        </button>
      ))}
    </div>
  );
}
