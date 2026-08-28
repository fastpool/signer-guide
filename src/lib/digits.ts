/**
 * Grouping the digits of a number, without asking the platform.
 *
 * `Number.prototype.toLocaleString` does this correctly in a browser and in
 * Node. `BigInt.prototype.toLocaleString` does not do it under Hermes, which
 * is the engine the phone app runs on: it returns the digits and ignores the
 * locale, so a reward of six million sats printed as `6135000` on a phone
 * while every test asserting `6,135,000` passed under Node.
 *
 * Both languages this guide speaks group by threes with a comma — `en-US` and
 * `ko-KR` agree — so doing it here rather than per locale loses nothing and
 * removes the whole class of bug. A language that groups differently would
 * need this to take a locale; none of them does yet, and pretending otherwise
 * would be a parameter nobody could test.
 */
export function groupDigits(value: bigint | number): string {
  const digits = value.toString();
  const negative = digits.startsWith('-');
  const body = negative ? digits.slice(1) : digits;
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${grouped}` : grouped;
}
