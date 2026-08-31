/**
 * What the page is allowed to say about a signer's conduct.
 *
 * These run against the committed record as well as against made-up rows: a
 * rule about how to read the data is worth little if the data it is read
 * against has stopped having the shape the rule assumes.
 */

import { describe, expect, it } from 'vitest';
import {
  acceptedRate,
  answered,
  answeredRate,
  bareKey,
  medianResponseMs,
  neverAnswered,
  performanceFor,
  proposals,
  responseSeconds,
  PERFORMANCE,
} from './performance';
import type { SignerCyclePerformance } from './types';

const row = (over: Partial<SignerCyclePerformance> = {}): SignerCyclePerformance => ({
  cycle: 142,
  accepted: 90,
  rejected: 5,
  missed: 5,
  responseMs: 5000,
  lastSeen: '2026-08-31T07:42:40.276Z',
  weight: 100,
  weightPercent: 2.5,
  final: false,
  ...over,
});

describe('answering and agreeing', () => {
  it('counts a rejection as having turned up', () => {
    // A signer that reads a block and refuses it is doing the job. Leading
    // with acceptance would rank a node that rubber stamps above one that
    // checks, which is the opposite of what this page is for.
    expect(answered(row())).toBe(95);
    expect(answeredRate(row())).toBeCloseTo(0.95);
    expect(acceptedRate(row())).toBeCloseTo(90 / 95);
  });

  it('reports nothing rather than zero for a signer asked nothing', () => {
    const idle = row({ accepted: 0, rejected: 0, missed: 0 });
    expect(proposals(idle)).toBe(0);
    expect(answeredRate(idle)).toBeNull();
    expect(acceptedRate(idle)).toBeNull();
  });

  it('separates never answered from answered badly', () => {
    const silent = row({ accepted: 0, rejected: 0, missed: 33976, lastSeen: null, responseMs: null });
    const poor = row({ accepted: 20, rejected: 10, missed: 70 });

    expect(neverAnswered(silent)).toBe(true);
    expect(neverAnswered(poor)).toBe(false);
    // The distinction the copy turns on: one is an absence, the other a score.
    expect(answeredRate(silent)).toBe(0);
    expect(answeredRate(poor)).toBeCloseTo(0.3);
  });

  it('gives seconds, or nothing at all', () => {
    expect(responseSeconds(row())).toBe(5);
    expect(responseSeconds(row({ responseMs: null }))).toBeNull();
  });
});

describe('the committed record', () => {
  it('covers the current cycle for every signer it names', () => {
    expect(PERFORMANCE.cycles.length).toBeGreaterThan(0);
    expect(PERFORMANCE.cycles).toContain(PERFORMANCE.cycle);
    for (const [key, entry] of Object.entries(PERFORMANCE.signers)) {
      expect(bareKey(key), key).toBe(key);
      expect(entry.cycle, key).toBe(PERFORMANCE.cycle);
    }
  });

  it('never carries a response time for a signer that answered nothing', () => {
    // The rule the generator enforces, checked against what it actually wrote.
    for (const [key, entry] of Object.entries(PERFORMANCE.signers)) {
      if (answered(entry) === 0) expect(entry.responseMs, key).toBeNull();
    }
  });

  it('finds a key by either spelling', () => {
    const key = Object.keys(PERFORMANCE.signers)[0];
    expect(performanceFor(key)).not.toBeNull();
    expect(performanceFor(`0x${key}`)).toEqual(performanceFor(key));
    expect(performanceFor(null)).toBeNull();
    expect(performanceFor('not a key')).toBeNull();
  });

  it('has a middle to compare a signer against', () => {
    const middle = medianResponseMs();
    expect(middle).not.toBeNull();
    // Sanity, not a threshold: blocks come about every ten seconds, so a
    // median outside this range means the unit or the field has changed.
    expect(middle!).toBeGreaterThan(100);
    expect(middle!).toBeLessThan(120_000);
  });
});
