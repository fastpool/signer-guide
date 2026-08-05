/**
 * A readable name for a pool, worked out from its contract name.
 *
 * Its own module rather than part of the generator, because importing the
 * generator runs it: `generate-signers.ts` calls `main()` at the top level, so
 * a test that reached in for this function would read the chain and overwrite
 * `src/data/signers.json` as a side effect of being imported.
 *
 * Where this cannot do better than the contract name — a contract called
 * `signer-manager-pox5` is run by Senseinode, and nothing in the name says so —
 * the answer belongs in `src/data/signers-manual.json` instead.
 */

/**
 * Drop the plumbing words every contract carries, and title-case the rest.
 *   signer-manager-hiro        -> Hiro
 *   fastpool-1-signer-manager  -> Fastpool 1
 *   native-pool-signer-manager -> Native Pool
 * Falls back to the raw contract name when nothing distinctive is left.
 */
export function humanizeContractName(contractId: string): string {
  const name = contractId.split('.')[1] ?? contractId;
  const words = name
    .split('-')
    .filter((word) => !['signer', 'manager'].includes(word));
  if (words.length === 0) return name;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
