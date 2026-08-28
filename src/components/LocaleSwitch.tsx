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
    <div className='inline-flex rounded-full bg-card p-1 shadow-lift'>
      {LOCALES.map((choice) => (
        <button
          key={choice}
          type='button'
          onClick={() => onChange(choice)}
          aria-pressed={locale === choice}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
            locale === choice
              ? 'bg-grape text-on-grape'
              : 'text-muted hover:text-ink'
          }`}
        >
          {languageName(choice)}
        </button>
      ))}
    </div>
  );
}
