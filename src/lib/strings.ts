// ellipse a string to a maximum length, adding ellipsis in the middle if necessary
export function ellipsedAddr(addr: string, maxLength = 8): string {
  if (addr.length <= maxLength) return addr;
  const half = Math.floor(maxLength / 2);
  return `${addr.slice(0, half)}…${addr.slice(-half)}`;
}