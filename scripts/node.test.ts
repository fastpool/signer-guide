import { describe, expect, it } from 'vitest';
import { mapPaced, normaliseApiUrl } from './node.js';

/*
 * `STACKS_API_URL=localhost:3999` is the mistake worth testing for. It is not
 * a URL `fetch` can use, but `new URL` accepts it — reading `localhost:` as
 * the scheme — so nothing here caught it and the run reported that the node
 * would not say what cycle it was in. Somebody then goes and looks at a node
 * that was fine all along.
 */

describe('normaliseApiUrl', () => {
  it('leaves a URL that was already one alone', () => {
    expect(normaliseApiUrl('https://api.hiro.so')).toBe('https://api.hiro.so');
    expect(normaliseApiUrl('http://localhost:3999')).toBe(
      'http://localhost:3999',
    );
  });

  it('completes a bare host and port', () => {
    expect(normaliseApiUrl('localhost:3999')).toBe('http://localhost:3999');
    expect(normaliseApiUrl('127.0.0.1:3999')).toBe('http://127.0.0.1:3999');
    expect(normaliseApiUrl('my-node.internal')).toBe('http://my-node.internal');
  });

  it('drops a trailing slash the callers would double up', () => {
    // Everything here builds paths as `${API_URL}/v2/…`.
    expect(normaliseApiUrl('https://api.hiro.so/')).toBe('https://api.hiro.so');
    expect(normaliseApiUrl('https://api.hiro.so///')).toBe(
      'https://api.hiro.so',
    );
  });

  it('keeps a path, for a node behind a prefix', () => {
    expect(normaliseApiUrl('https://gateway.example/stacks/')).toBe(
      'https://gateway.example/stacks',
    );
  });

  it('says so by name when the scheme is one fetch cannot use', () => {
    expect(() => normaliseApiUrl('ftp://api.hiro.so')).toThrow(
      /STACKS_API_URL has to be http or https/,
    );
    expect(() => normaliseApiUrl('ws://localhost:3999')).toThrow(
      /http or https/,
    );
  });

  it('says so by name when it is not a URL at all', () => {
    expect(() => normaliseApiUrl(':::')).toThrow(/STACKS_API_URL is not a URL/);
  });

  it('leaves the hostname readable, which the rate limiting depends on', () => {
    // `IDENTIFIED` asks whether the host is hiro.so to decide how hard to
    // lean on it. A URL with no hostname read as one silently paced the run
    // as though it were somebody's own node.
    expect(new URL(normaliseApiUrl('localhost:3999')).hostname).toBe(
      'localhost',
    );
    expect(new URL(normaliseApiUrl('https://api.hiro.so')).hostname).toBe(
      'api.hiro.so',
    );
  });
});

/*
 * The point of `mapPaced` is that a walk pays for its pacing once rather than
 * twice — the wait, and then the wait for the answer. So what is worth
 * pinning down is that the starts are still spaced, and that a slow job does
 * not hold the next one up behind it.
 */
describe('mapPaced', () => {
  it('keeps the order of the answers, whatever order they arrive in', async () => {
    const delays = [30, 0, 10];
    const answers = await mapPaced(
      delays,
      async (ms, index) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return index;
      },
      { spacingMs: 0 },
    );

    expect(answers).toEqual([0, 1, 2]);
  });

  it('starts the next job while the last is still in the air', async () => {
    let inFlight = 0;
    let mostAtOnce = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const all = mapPaced(
      [1, 2, 3],
      async () => {
        inFlight += 1;
        mostAtOnce = Math.max(mostAtOnce, inFlight);
        await held;
        inFlight -= 1;
      },
      { spacingMs: 0 },
    );

    // Every job is waiting on the same gate; sequential code would deadlock.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mostAtOnce).toBe(3);
    release();
    await all;
  });

  it('spaces the starts, which is the rate the endpoint sees', async () => {
    const started: number[] = [];
    const begin = Date.now();

    await mapPaced(
      [1, 2, 3],
      async () => {
        started.push(Date.now() - begin);
      },
      { spacingMs: 20 },
    );

    expect(started).toHaveLength(3);
    // Two gaps of 20ms between three starts. Timers overshoot, never undershoot.
    expect(started[2]).toBeGreaterThanOrEqual(35);
  });

  it('holds at maxInFlight rather than queueing everything at a slow endpoint', async () => {
    let inFlight = 0;
    let mostAtOnce = 0;

    await mapPaced(
      [1, 2, 3, 4, 5, 6],
      async () => {
        inFlight += 1;
        mostAtOnce = Math.max(mostAtOnce, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
      },
      { spacingMs: 0, maxInFlight: 2 },
    );

    expect(mostAtOnce).toBe(2);
  });

  it('lets the other jobs finish before it reports a job that threw', async () => {
    const finished: number[] = [];

    await expect(
      mapPaced(
        [1, 2, 3],
        async (item) => {
          if (item === 1) throw new Error('first one broke');
          await new Promise((resolve) => setTimeout(resolve, 10));
          finished.push(item);
        },
        { spacingMs: 0 },
      ),
    ).rejects.toThrow('first one broke');

    // Not left running behind the error, which would go on asking the node
    // for things after the caller had given up.
    expect(finished).toEqual([2, 3]);
  });
});
