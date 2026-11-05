import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetAddress,
  rememberAddress,
  rememberedAddress,
} from './remembered-address';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('remembered address', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps one address, and forgets it on request', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(rememberedAddress()).toBeNull();
    rememberAddress('friedger.btc');
    expect(rememberedAddress()).toBe('friedger.btc');
    forgetAddress();
    expect(rememberedAddress()).toBeNull();
  });

  it('will not keep something that is not an address or a name', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    rememberAddress('<script>');
    expect(rememberedAddress()).toBeNull();
  });

  it('treats blocked storage as nothing remembered', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    expect(() => rememberAddress('friedger.btc')).not.toThrow();
    expect(rememberedAddress()).toBeNull();
  });
});
