import { describe, expect, it } from 'vitest';
import { normaliseApiUrl } from './node.js';

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
