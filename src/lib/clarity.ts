/**
 * Just enough Clarity to ask pox-5 a question.
 *
 * The node's read-only endpoint takes its arguments as hex-encoded Clarity
 * values, and there are exactly two here: a contract principal and a uint.
 * That is a few dozen lines, against about half a megabyte for `@stacks/
 * transactions` — which this guide, a static page people read on a phone,
 * would otherwise have to ship in full.
 *
 * The encodings are pinned in clarity.test.ts against output from the real
 * library, so "few dozen lines" does not become "few dozen lines that are
 * subtly wrong".
 */

/** Crockford's base-32, as Stacks uses it: no I, L, O or U. */
const C32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Address body: a 20-byte hash plus a 4-byte checksum. */
const ADDRESS_BYTES = 24;

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * A Stacks address back into the version and hash the chain knows it by.
 *
 * `SP…` is 'S', a character for the version, then the hash and checksum in
 * c32. The checksum is not verified: these ids come from the chain by way of
 * our own generated data, and a mistyped one would read as a principal that
 * has never staked, which shows as nothing rather than as somebody else's
 * money.
 */
export function decodeStacksAddress(address: string): {
  version: number;
  hash160: Uint8Array;
} {
  const normalized = address
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  // Length varies: c32 drops leading zeros rather than padding to a fixed
  // width, so an address whose hash starts with a low byte is a character or
  // two shorter. The zeros come back as padding when the bytes are laid out.
  if (!/^S[0-9A-Z]{38,41}$/.test(normalized)) {
    throw new Error(`Not a Stacks address: ${address}`);
  }

  const version = C32.indexOf(normalized[1]);
  if (version < 0) throw new Error(`Bad address version: ${address}`);

  let value = 0n;
  for (const character of normalized.slice(2)) {
    const index = C32.indexOf(character);
    if (index < 0) throw new Error(`Bad character in address: ${address}`);
    value = value * 32n + BigInt(index);
  }

  // Fixed width, so the leading zero bytes a c32 decoder normally has to
  // count are simply the padding here.
  const bytes = new Uint8Array(ADDRESS_BYTES);
  for (let i = ADDRESS_BYTES - 1; i >= 0; i -= 1) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  if (value !== 0n) throw new Error(`Address too long: ${address}`);

  return { version, hash160: bytes.slice(0, 20) };
}

/**
 * `SP….my-contract` as the wire format: type 0x06, the address version, the
 * 20-byte hash, then the contract name with a one-byte length.
 */
export function serializeContractPrincipal(contractId: string): string {
  const [address, name] = contractId.split('.');
  if (!address || !name) {
    throw new Error(`Not a contract id: ${contractId}`);
  }
  if (!/^[a-zA-Z]([a-zA-Z0-9]|[-_])*$/.test(name) || name.length > 128) {
    throw new Error(`Not a contract name: ${name}`);
  }

  const { version, hash160 } = decodeStacksAddress(address);
  const nameHex = [...name]
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');

  return (
    '06' +
    version.toString(16).padStart(2, '0') +
    toHex(hash160) +
    name.length.toString(16).padStart(2, '0') +
    nameHex
  );
}

/** Type 0x01 and 16 bytes big-endian. */
export function serializeUint(value: number | bigint): string {
  const asBigInt = BigInt(value);
  if (asBigInt < 0n) throw new Error('A uint cannot be negative');
  return '01' + asBigInt.toString(16).padStart(32, '0');
}

/**
 * The uint a read-only call answered with.
 *
 * Anything that is not a uint — a response type, an error — comes back null
 * rather than as a number, because a wrong number here is worse than none.
 */
export function parseUint(hex: string): bigint | null {
  const body = hex.replace(/^0x/, '');
  if (!/^01[0-9a-f]{32}$/i.test(body)) return null;
  return BigInt(`0x${body.slice(2)}`);
}
