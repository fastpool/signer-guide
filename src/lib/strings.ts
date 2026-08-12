// ellipse a string to a maximum length, adding ellipsis in the middle if necessary
export function ellipsedAddr(addr: string, maxLength = 8): string {
  if (addr.length <= maxLength) return addr;
  const half = Math.floor(maxLength / 2);
  return `${addr.slice(0, half)}…${addr.slice(-half)}`;
}

/**
 * A principal short enough for a column, keeping the part that identifies it.
 *
 * `ellipsedAddr` on a whole principal is wrong for the contracts that stake —
 * and several of the largest members of any signer are contracts. It cuts from
 * the middle, so `SP4SZE….stx-staker-blockdaemon-v2` comes out as
 * `SP4SZE4…don-v2`: the name, which is the only part a reader can recognise,
 * is exactly what gets eaten. So the address is shortened and the contract
 * name is left whole.
 */
export function shortPrincipal(principal: string, maxLength = 14): string {
  const [address, contract] = principal.split('.');
  if (!contract) return ellipsedAddr(address, maxLength);
  return `${ellipsedAddr(address, maxLength)}.${contract}`;
}
