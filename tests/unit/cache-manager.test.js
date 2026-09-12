import { describe, it, expect, beforeEach } from 'bun:test';
import { CacheManager } from '../../js/cache-manager.js';

describe('CacheManager', () => {
  let cache;
  beforeEach(() => { cache = new CacheManager({ maxEntries: 3, defaultTtlMs: 60000 }); });

  it('stores and retrieves values', () => {
    cache.set('a', { value: 1 });
    expect(cache.get('a')).toEqual({ value: 1 });
  });

  it('returns undefined for missing keys', () => {
    expect(cache.get('nope')).toBeUndefined();
  });

  it('expires entries after their TTL', async () => {
    const shortCache = new CacheManager({ maxEntries: 5, defaultTtlMs: 10 });
    shortCache.set('a', 1);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(shortCache.get('a')).toBeUndefined();
  });

  it('honours per-entry TTL overrides', async () => {
    const mixed = new CacheManager({ maxEntries: 5, defaultTtlMs: 60000 });
    mixed.set('short', 1, 10);
    mixed.set('long', 2);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mixed.get('short')).toBeUndefined();
    expect(mixed.get('long')).toBe(2);
  });

  it('evicts the least recently used entry when full', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // touch a so b becomes LRU
    cache.set('d', 4);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('supports invalidation and clearing', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.invalidate('a');
    expect(cache.get('a')).toBeUndefined();
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('builds stable cache keys from request parameters', () => {
    const k1 = CacheManager.buildKey('report', { user: 'u', repo: 'r', branch: 'main' });
    const k2 = CacheManager.buildKey('report', { branch: 'main', repo: 'r', user: 'u' });
    expect(k1).toBe(k2);
  });
});
