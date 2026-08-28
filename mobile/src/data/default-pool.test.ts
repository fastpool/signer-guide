import { BUNDLED } from './snapshot';
import { defaultPool, PREFERRED_POOL } from './default-pool';
import { isJoinable, stakedUstx } from './signers';
import { en } from '../i18n/en';
import { ko } from '../i18n/ko';

/*
 * The pool offered to somebody who has not asked to choose one.
 *
 * A default is a recommendation whether it is called one or not, so what is
 * tested here is that the rule is a rule: applied to every pool the same way,
 * blind to who deployed anything, and stated on screen in terms the person can
 * check for themselves.
 */

describe('defaultPool', () => {
  const chosen = defaultPool(BUNDLED);

  it('finds one in the data that ships with the app', () => {
    expect(chosen).not.toBeNull();
  });

  it('offers only a pool the chain would actually accept a stake for', () => {
    expect(isJoinable(chosen!.signer)).toBe(true);
  });

  it('offers only a contract that has been read and written up here', () => {
    expect(chosen!.signer.profileId).toBeTruthy();
    expect(chosen!.template.profile.name).toBeTruthy();
  });

  it('is the pool this app prefers, and says that is what it is', () => {
    /*
     * Fast Pool's own, and Fast Pool wrote the app. That is a preference, and
     * `preferred` is how the screen knows to say so rather than dressing it up
     * as a rule that happened to land here.
     */
    expect(chosen!.signer.contractId).toBe(PREFERRED_POOL);
    expect(chosen!.preferred).toBe(true);
  });

  it('falls back to a rule when that pool is not taking stakes', () => {
    const closed = {
      ...BUNDLED,
      signers: {
        ...BUNDLED.signers,
        signers: BUNDLED.signers.signers.map((s) =>
          s.contractId === PREFERRED_POOL ? { ...s, registered: false } : s,
        ),
      },
    };
    const fallback = defaultPool(closed)!;
    expect(fallback.signer.contractId).not.toBe(PREFERRED_POOL);
    expect(fallback.preferred).toBe(false);

    // And the rule is the one it always was: lowest fee among those it accepts.
    const fees = closed.signers.signers
      .filter(isJoinable)
      .map((s) => s.feeBips)
      .filter((f): f is number => typeof f === 'number');
    expect(fallback.signer.feeBips).toBe(Math.min(...fees));
  });

  it('breaks a fallback tie on size, so it does not depend on file order', () => {
    const closed = {
      ...BUNDLED,
      signers: {
        ...BUNDLED.signers,
        signers: BUNDLED.signers.signers.map((s) =>
          s.contractId === PREFERRED_POOL ? { ...s, registered: false } : s,
        ),
      },
    };
    const fallback = defaultPool(closed)!;
    const tied = closed.signers.signers
      .filter(isJoinable)
      .filter((s) => s.feeBips === fallback.signer.feeBips);
    const amounts = tied.map((s) => stakedUstx(BUNDLED.totals, s.contractId) ?? 0n);
    const largest = amounts.reduce((a, b) => (b > a ? b : a), 0n);
    expect(stakedUstx(BUNDLED.totals, fallback.signer.contractId)).toBe(largest);
  });

  it('is the same answer every time it is asked', () => {
    expect(defaultPool(BUNDLED)?.signer.contractId).toBe(chosen!.signer.contractId);
  });

  it('counts the pools that passed the same filters, so the offer is not a claim of uniqueness', () => {
    expect(chosen!.alternatives).toBeGreaterThan(0);
  });

  it('has nothing to offer rather than something unvetted, when nothing qualifies', () => {
    const empty = {
      ...BUNDLED,
      signers: { ...BUNDLED.signers, signers: [] },
    };
    expect(defaultPool(empty)).toBeNull();
  });

  it('never offers a pool whose fee is unknown', () => {
    const unknownFee = {
      ...BUNDLED,
      signers: {
        ...BUNDLED.signers,
        signers: BUNDLED.signers.signers.map((s) => ({ ...s, feeBips: null })),
      },
    };
    expect(defaultPool(unknownFee as never)).toBeNull();
  });
});

describe('the reason shown on screen', () => {
  /*
   * The rule and the sentence that states it have to say the same thing. The
   * sentence lives in the catalogue so it can be translated; this holds it to
   * naming all three filters, in whichever language somebody reads it.
   */
  it('names all three filters', () => {
    const reason = en.messages['start.reason'];
    expect(reason).toMatch(/\{contract\}/);
    expect(reason).toMatch(/anyone/);
    expect(reason).toMatch(/\{fee\}/);
  });

  it('has a fee clause for both cases the rule can land on', () => {
    expect(en.messages['start.reasonNoFee']).toMatch(/no fee/);
    expect(en.messages['start.reasonLowestFee']).toMatch(/\{percent\}/);
  });

  it('is translated', () => {
    for (const key of ['start.reason', 'start.reasonNoFee', 'start.reasonLowestFee'] as const) {
      expect(ko.messages[key]).toBeTruthy();
      expect(ko.messages[key]).not.toBe(en.messages[key]);
    }
  });
});
