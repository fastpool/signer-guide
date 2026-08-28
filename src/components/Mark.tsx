/**
 * The guide's own mark: two circles on one axis, one filled and one outlined,
 * overlapping.
 *
 * Stacks and bitcoin are linked, and two pools showing the same icon run the
 * same code — the same idea the identicons carry. It is a sibling of
 * `public/fastpool-logo.svg` rather than a copy of it: same grape, same
 * container radius, same stroke weight, a different glyph. The site used to
 * lead with Fast Pool's own glyph alone, which made the guide look like a Fast
 * Pool product rather than a guide that lists Fast Pool among forty-four
 * others. Fast Pool is still named — in the byline beside this, and in the
 * footer — which is the accurate relationship.
 *
 * Geometry is the redesign handoff's, in a 32-unit box, and the same numbers
 * `mobile/src/components/Mark.tsx` and `public/app-icon.svg` draw from, so the
 * phone icon, the favicon and this cannot drift apart.
 *
 * Drawn in `currentColor` with no container of its own: the caller supplies
 * the tile, which is what lets the same glyph sit white-on-grape in the header
 * and grape-on-cream anywhere else.
 */
export default function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 32 32'
      className={className}
      role='img'
      aria-hidden='true'
      focusable='false'
    >
      <circle cx='12.5' cy='16' r='5.4' fill='currentColor' />
      <circle
        cx='20.5'
        cy='16'
        r='5.4'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
      />
    </svg>
  );
}
