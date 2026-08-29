import { isArchived } from '@guide/lib/profiles';
import { buildTemplates, type Template } from '@guide/lib/templates';
import { signerNameFromContractId } from '@guide/lib/stx-amounts';
import type { LockedTotals, Signer } from '@guide/lib/types';
import type { Snapshot } from './snapshot';

/**
 * Finding a pool, and putting the pools in the order somebody should meet
 * them in.
 *
 * "Most staked first" is not a recommendation and this app does not make one.
 * It is the order that puts the pools a reader has heard of at the top, and
 * the order the guide's own list uses, so the two agree about what is near the
 * top of the page.
 */

export function stakedUstx(totals: LockedTotals, contractId: string): bigint | null {
  const amount = totals.ustx?.[contractId];
  if (typeof amount !== 'string' || !/^\d+$/.test(amount)) return null;
  return BigInt(amount);
}

export function signerFor(snapshot: Snapshot, contractId: string): Signer | null {
  return (
    snapshot.signers.signers.find((s) => s.contractId === contractId) ?? null
  );
}

/**
 * What to call a pool.
 *
 * `displayNameSource` is the part that matters: `manual` means somebody put
 * the name in and said where they got it, `contract` means the generator made
 * the best it could of the contract's own name. The second is a guess, and the
 * screens that show it mark it as one rather than printing it like a fact.
 */
export function poolName(signer: Signer | null, contractId: string): {
  name: string;
  guessed: boolean;
} {
  if (!signer) return { name: signerNameFromContractId(contractId), guessed: true };
  return {
    name: signer.displayName,
    guessed: signer.displayNameSource !== 'manual',
  };
}

/** Only pools that are registered and will take a stake from anyone. */
export function isJoinable(signer: Signer): boolean {
  return signer.registered && signer.openToAnyone && !isArchived(signer);
}

/*
 * Archived contract types are left out of every list here — the contracts to
 * choose from, and the pools running them — because they are code the operator
 * has replaced and there is nothing to choose. A position already held in one
 * still reads normally: the position is looked up in the snapshot by contract
 * id, which is untouched by any of this.
 */
export function templatesFrom(snapshot: Snapshot): Template[] {
  return buildTemplates(snapshot.signers.signers).filter(
    (template) => !template.profile.archived,
  );
}

/** Pools running one contract, biggest first, unjoinable ones left out. */
export function joinableSigners(
  template: Template,
  totals: LockedTotals,
): Signer[] {
  return [...template.signers]
    .filter(isJoinable)
    .sort((a, b) => compareStaked(totals, a, b));
}

/** Every pool, biggest first — the full list, for the part of the app that shows everything. */
export function allSigners(snapshot: Snapshot): Signer[] {
  return snapshot.signers.signers
    .filter((signer) => !isArchived(signer))
    .sort((a, b) => compareStaked(snapshot.totals, a, b));
}

function compareStaked(totals: LockedTotals, a: Signer, b: Signer): number {
  const left = stakedUstx(totals, a.contractId) ?? -1n;
  const right = stakedUstx(totals, b.contractId) ?? -1n;
  if (left === right) return a.contractId.localeCompare(b.contractId);
  return right > left ? 1 : -1;
}

/** How much is staked across every pool running this contract. */
export function templateStakedUstx(
  template: Template,
  totals: LockedTotals,
): bigint | null {
  let sum = 0n;
  let known = false;
  for (const signer of template.signers) {
    const amount = stakedUstx(totals, signer.contractId);
    if (amount === null) continue;
    sum += amount;
    known = true;
  }
  return known ? sum : null;
}

export type { Template };
