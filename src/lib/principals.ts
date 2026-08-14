/**
 * Reading a list of addresses somebody pasted in.
 *
 * Shared by `scripts/address-report.ts`, which takes a file, and the status
 * page, which takes a textarea. The lists people keep are not a format — they
 * are whatever was to hand — so this is deliberately relaxed about what a line
 * looks like, and deliberately loud about what it could not read.
 *
 * Nothing here imports anything: the page needs it and so does a node script,
 * which is the same rule `signer-groups.ts` follows and for the same reason.
 */

/** A principal, near enough: the API is the one that decides. */
const PRINCIPAL = /^S[PM][0-9A-Z]{20,50}(\.[a-zA-Z]([a-zA-Z0-9]|[-_])*)?$/;

/**
 * Whether this is a principal — an address, or a contract on one.
 *
 * Case-folded on the address half only. A Stacks address is upper-case c32,
 * and people paste them lower-cased out of block explorers and chat clients;
 * a contract name is genuinely case-sensitive and is left alone.
 */
export function isPrincipal(value: string): boolean {
  const [address, ...rest] = value.split('.');
  const candidate = [address.toUpperCase(), ...rest].join('.');
  return PRINCIPAL.test(candidate);
}

/**
 * A BNS name: `label.namespace`, both lower case.
 *
 * The lengths are the BNS v2 registry's own — `(buff 48)` for the label and
 * `(buff 20)` for the namespace — so anything longer is a string the contract
 * could not be asked about rather than a name it would fail to find.
 *
 * Lower case is what keeps this from colliding with a contract principal,
 * which is the other thing here with a dot in it: a Stacks address is
 * upper-case c32, so `SP2C2….my-contract` cannot be read as a name and
 * `friedger.btc` cannot be read as a contract.
 *
 * The test lives here rather than beside the resolver so that this file stays
 * free of imports — `scripts/address-report.ts` reads it, and a node script
 * cannot follow `@stacks/transactions` and `import.meta.env` in behind it.
 */
const BNS_NAME = /^[a-z0-9][a-z0-9\-_]{0,47}\.[a-z0-9][a-z0-9\-_]{0,19}$/;

export function isBnsName(value: string): boolean {
  return BNS_NAME.test(value);
}

/**
 * Anything the status page can look up: an address, a contract on one, or a
 * BNS name.
 *
 * Principal first, because it is the stricter pattern of the two. That the
 * order cannot matter is the point of the case rule above; asking in this
 * order makes it a property of the code rather than only of the alphabet.
 */
export function isLookupTarget(value: string): boolean {
  return isPrincipal(value) || isBnsName(value);
}

/** How many addresses one look-up will take on. */
export const MAX_ADDRESSES = 20;

export interface AddressEntry {
  address: string;
  /** What the list calls it, if it calls it anything. */
  label: string | null;
}

/**
 * The addresses in a block of text, in the order they appear.
 *
 * A line pasted out of a JSON array keeps its quotes and its trailing comma; a
 * line typed by hand has neither; both mean the same address and both are
 * taken. `//` and `#` start a comment, and `[` or `]` on its own is the array
 * it was pasted from.
 *
 * What the comment says is kept as a label. Somebody who has written
 * `// Fast Pool Reserve` beside an address has already said what they call it,
 * and making them match `SP2ZNPXG…` back up to that by eye would be throwing
 * away the most useful thing in their file.
 *
 * A line holding several principals is several addresses, not one address with
 * a label made of the others — which is how anyone pasting a comma-separated
 * list would otherwise lose all but the first. One principal followed by words
 * keeps the label reading, because that is what a list with names in it looks
 * like and the two cannot be confused: a label is not a principal.
 *
 * A line that is neither is returned in `rejected` rather than dropped. A typo
 * silently skipped is an address nobody hears about again, and on this page it
 * would be somebody quietly not being told about their own money.
 */
export function parseAddressList(text: string): {
  entries: AddressEntry[];
  rejected: string[];
} {
  const entries: AddressEntry[] = [];
  const rejected: string[] = [];

  for (const raw of text.split('\n')) {
    const [body, ...rest] = raw.split(/\/\/|#/);
    const comment = rest.join('#').trim();
    const line = body.trim();
    if (!line || line === '[' || line === ']') continue;

    const tokens = line
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((token) => token.replace(/^['"]|['"]$/g, ''));
    if (tokens.length === 0) continue;

    const principals = tokens.filter(isLookupTarget);
    if (principals.length === 0) {
      rejected.push(line);
      continue;
    }

    // Several on one line: a pasted list, and every one of them is an address.
    if (principals.length > 1) {
      for (const address of principals) entries.push({ address, label: null });
      continue;
    }

    // One, and it has to be the first thing on the line — anything before it
    // is not a label, it is a line this cannot make sense of.
    if (!isLookupTarget(tokens[0])) {
      rejected.push(line);
      continue;
    }
    const trailing = tokens.slice(1).join(' ').trim();
    entries.push({ address: tokens[0], label: comment || trailing || null });
  }

  return { entries, rejected };
}

/**
 * The list as the page will actually look it up: deduplicated, and cut to the
 * limit with what was cut reported rather than dropped in silence.
 */
export function takeAddresses(
  entries: AddressEntry[],
  limit = MAX_ADDRESSES,
): { taken: AddressEntry[]; dropped: number } {
  const seen = new Set<string>();
  const unique: AddressEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.address)) continue;
    seen.add(entry.address);
    unique.push(entry);
  }
  return {
    taken: unique.slice(0, limit),
    dropped: Math.max(0, unique.length - limit),
  };
}
