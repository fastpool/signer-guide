import Svg, { Circle, Rect } from 'react-native-svg';
import { useColors } from '../settings';

/**
 * The app's own mark: two circles on one axis, one filled and one outlined,
 * overlapping.
 *
 * Stacks and bitcoin are linked, and two pools showing the same icon run the
 * same code — the same idea the identicons carry. It is a sibling of
 * `public/fastpool-logo.svg` rather than a copy of it: same grape, same
 * container radius, same stroke weight, a different glyph. The app used to
 * ship Fast Pool's own glyph, which made the guide look like a Fast Pool
 * product rather than a guide that lists Fast Pool among forty-four others.
 *
 * Geometry is the hand-off's, in a 32-unit box, so this and the exported PNGs
 * cannot drift.
 */
export default function Mark({
  size = 30,
  /** On grape, everything is white; on cream, the container is grape. */
  onGrape = false,
  testID,
}: {
  size?: number;
  onGrape?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const glyph = onGrape ? '#ffffff' : colors.onAccent;

  return (
    <Svg
      width={size}
      height={size}
      viewBox='0 0 32 32'
      testID={testID}
      accessibilityRole='image'
    >
      {onGrape ? null : (
        <Rect width={32} height={32} rx={9} fill={colors.stx} />
      )}
      <Circle cx={12.5} cy={16} r={5.4} fill={glyph} />
      <Circle
        cx={20.5}
        cy={16}
        r={5.4}
        stroke={glyph}
        strokeWidth={2}
        fill='none'
      />
    </Svg>
  );
}

/** The preferences control: a circular card with a gear drawn in it. */
export function GearGlyph({ size = 22 }: { size?: number }) {
  const colors = useColors();
  return (
    <Svg width={size} height={size} viewBox='0 0 24 24'>
      <Circle
        cx={12}
        cy={12}
        r={8.4}
        stroke={colors.stx}
        strokeWidth={1.8}
        strokeDasharray='3 3.2'
        fill='none'
      />
      <Circle
        cx={12}
        cy={12}
        r={3.1}
        stroke={colors.stx}
        strokeWidth={1.8}
        fill='none'
      />
    </Svg>
  );
}
