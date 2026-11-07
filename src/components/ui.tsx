import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

/**
 * The few pieces every page is built from.
 *
 * Each page used to lay out its own boxes, and so each said "a figure and
 * what it is" a slightly different way — a bold line in one card, a
 * definition list in the next, a sentence in a third. These are the shapes
 * the pages agree on now: a stat tile for a headline figure, a facts grid for
 * the things every pool is compared on, a card for a section, an alert for
 * the one thing a reader must not miss.
 */

/** A page's main column. Wide for a table, narrow for reading. */
export function Page({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={`mx-auto px-4 pt-6 pb-16 sm:px-6 md:pt-8 ${
        wide ? 'max-w-6xl' : 'max-w-4xl'
      }`}
    >
      {children}
    </main>
  );
}

/** One headline figure: what it is, the number, and a line under it. */
export function StatTile({
  label,
  value,
  unit,
  children,
  bare,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  children?: ReactNode;
  /** No card of its own: it sits in a panel with others. */
  bare?: boolean;
}) {
  return (
    <div
      className={
        bare ? 'min-w-0' : 'rounded-2xl bg-card p-3 shadow-lift sm:p-4'
      }
    >
      <div className='text-xs font-semibold text-muted'>{label}</div>
      <div className='mt-0.5 text-xl font-extrabold tabular-nums sm:text-2xl'>
        {value}
        {unit && (
          <span className='ml-1 text-sm font-bold text-muted'>{unit}</span>
        )}
      </div>
      {children && (
        <div className='mt-1 text-xs text-muted sm:text-[0.8rem]'>
          {children}
        </div>
      )}
    </div>
  );
}

/** A bar that fills to `percent`. */
export function Meter({ percent, label }: { percent: number; label?: string }) {
  return (
    <div
      className='mt-2 h-1.5 overflow-hidden rounded-full bg-trough'
      role='progressbar'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div
        className='h-full rounded-full bg-grape'
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

export interface Fact {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** An explanation, shown on hover and read out by a screen reader. */
  help?: string;
}

/**
 * The facts a pool is compared on, always in the same cells.
 *
 * Four across on a wide screen and two on a phone, so the same fact is in the
 * same place on every pool's page and two pages can be compared by flicking
 * between them.
 */
export function FactGrid({ facts }: { facts: Fact[] }) {
  return (
    <dl className='grid grid-cols-2 overflow-hidden rounded-2xl bg-card shadow-lift md:grid-cols-4'>
      {facts.map((fact, index) => (
        <div
          key={index}
          className='border-b border-hairline p-3 odd:border-r md:border-r md:p-4 md:[&:nth-child(4n)]:border-r-0'
        >
          <dt className='flex items-center gap-1 text-xs font-semibold text-muted'>
            {fact.label}
            {fact.help && <InfoTip text={fact.help} />}
          </dt>
          <dd className='mt-0.5 text-base font-extrabold md:text-lg'>
            {fact.value}
          </dd>
          {fact.note && (
            <dd className='text-xs text-muted md:text-[0.8rem]'>{fact.note}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/**
 * A small ⓘ that explains a term where it is used.
 *
 * The paragraphs that opened every box used to explain these at length,
 * every time. A reader who already knows what vote share means now reads
 * past one character instead of three sentences.
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role='img'
      className='inline-grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-faint text-[0.55rem] leading-none font-extrabold text-faint'
    >
      i
    </span>
  );
}

/** The one thing on a page a reader must not miss. */
export function Alert({
  tone = 'warm',
  title,
  children,
}: {
  tone?: 'warm' | 'bad';
  title: ReactNode;
  children?: ReactNode;
}) {
  const colours =
    tone === 'bad'
      ? { box: 'bg-rose-soft', dot: 'bg-rose', title: 'text-rose' }
      : {
          box: 'bg-amber-soft',
          dot: 'bg-amber-warm',
          title: 'text-amber-warm',
        };
  return (
    <div
      role='note'
      className={`flex gap-3 rounded-2xl p-3 text-sm sm:p-4 ${colours.box}`}
    >
      <span
        aria-hidden='true'
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-black text-surface ${colours.dot}`}
      >
        !
      </span>
      <div>
        <strong className={colours.title}>{title}</strong>{' '}
        {children && <span className='text-ink'>{children}</span>}
      </div>
    </div>
  );
}

/** A section of a page, in a card, with its heading and a one-line caption. */
export function Card({
  id,
  title,
  caption,
  children,
}: {
  id?: string;
  title: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className='scroll-mt-16 rounded-2xl bg-card p-4 shadow-lift sm:p-5'
    >
      <h2 id={id ? `${id}-title` : undefined} className='text-lg font-bold'>
        {title}
      </h2>
      {caption && <p className='mt-0.5 text-sm text-muted'>{caption}</p>}
      <div className='mt-3'>{children}</div>
    </section>
  );
}

const FADE = 'linear-gradient(to right, black calc(100% - 3rem), transparent)';

/**
 * A fade on the right edge of a row that scrolls sideways, while there is
 * more of it off-screen — the only sign on a phone that a row of chips or
 * tabs goes on. Gone once the end is reached, so the last item is never
 * left half-faded.
 */
export function useEdgeFade(
  ref: RefObject<HTMLElement | null>,
): CSSProperties | undefined {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref]);
  return more ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined;
}

/**
 * Links to the sections of a long page, kept at the top as it scrolls.
 *
 * Buttons that scroll rather than `#id` links: the app routes on the hash,
 * so a fragment link would navigate away from the page it is on.
 *
 * The section being read is marked, so the bar says where you are rather
 * than only where you could go. "Being read" is the last section whose top
 * has passed under the bar; on a two-column page two sections can start at
 * the same height, and the one earlier in `sections` wins. List the sections
 * in the order a phone stacks them, so the bar and the page agree there.
 *
 * On a phone the bar scrolls sideways; a fade on the right edge says there
 * is more until the end has been reached.
 */
export function SectionNav({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const bar = useRef<HTMLElement>(null);
  const fade = useEdgeFade(bar);
  const ids = sections.map((section) => section.id).join(' ');

  useEffect(() => {
    const list = ids.split(' ');
    const update = () => {
      const line = (bar.current?.offsetHeight ?? 0) + 16;
      let best: string | null = null;
      let bestTop = -Infinity;
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top === undefined || top > line) continue;
        if (top > bestTop + 1) {
          best = id;
          bestTop = top;
        }
      }
      // The page's end: the last section may never reach the top.
      const atEnd =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      setCurrent(atEnd && best ? list[list.length - 1] : best);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ids]);

  // Keep the marked one in view on a bar that scrolls sideways.
  useEffect(() => {
    if (!current || !bar.current) return;
    const button = bar.current.querySelector<HTMLElement>(
      `[data-section="${current}"]`,
    );
    const el = bar.current;
    if (!button || el.scrollWidth <= el.clientWidth) return;
    const left = button.offsetLeft - el.offsetLeft;
    if (
      left < el.scrollLeft ||
      left + button.offsetWidth > el.scrollLeft + el.clientWidth
    ) {
      el.scrollTo({ left: left - 16, behavior: 'smooth' });
    }
  }, [current]);

  return (
    <nav
      ref={bar}
      aria-label='Sections'
      className='sticky top-0 z-10 -mx-4 mt-6 mb-4 flex gap-1 overflow-x-auto border-b border-hairline bg-surface px-4 sm:-mx-6 sm:px-6'
      style={fade}
    >
      {sections.map((section) => {
        const on = section.id === current;
        return (
          <button
            key={section.id}
            type='button'
            data-section={section.id}
            aria-current={on ? 'location' : undefined}
            onClick={() =>
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-bold whitespace-nowrap transition-colors hover:border-grape hover:text-grape ${
              on ? 'border-grape text-grape' : 'border-transparent text-muted'
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}

/** "Pools › Stacking DAO › Native Pool V2". The last one is where you are. */
export function Breadcrumbs({
  items,
}: {
  items: { label: ReactNode; href?: string }[];
}) {
  return (
    <nav aria-label='Breadcrumb' className='mb-3 text-sm text-muted'>
      <ol className='flex flex-wrap items-center gap-x-1.5 gap-y-1'>
        {items.map((item, index) => (
          <li key={index} className='flex items-center gap-1.5'>
            {index > 0 && <span aria-hidden='true'>›</span>}
            {item.href && index < items.length - 1 ? (
              <a
                href={item.href}
                className='font-semibold text-grape hover:underline'
              >
                {item.label}
              </a>
            ) : (
              <span aria-current='page'>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** A page's heading and the sentence under it. */
export function PageHeading({
  title,
  intro,
}: {
  title: ReactNode;
  intro?: ReactNode;
}) {
  return (
    <header className='mb-5'>
      <h1 className='text-3xl font-extrabold tracking-tight md:text-4xl'>
        {title}
      </h1>
      {intro && <p className='mt-2 max-w-2xl text-muted md:text-lg'>{intro}</p>}
    </header>
  );
}
