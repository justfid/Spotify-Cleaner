'use strict';

const cache = require('../../server/services/cache');

afterEach(() => cache.clear());

describe('cache', () => {
  it('has() returns false for an unknown key', () => {
    expect(cache.has('missing')).toBe(false);
  });

  it('get() returns undefined for an unknown key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('set() stores a value retrievable by get()', () => {
    cache.set('k', { data: 42 });
    expect(cache.get('k')).toEqual({ data: 42 });
  });

  it('has() returns true after set()', () => {
    cache.set('k', 'v');
    expect(cache.has('k')).toBe(true);
  });

  it('clear() removes all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
  });

  it('stores multiple independent keys', () => {
    cache.set('x', 'foo');
    cache.set('y', 'bar');
    expect(cache.get('x')).toBe('foo');
    expect(cache.get('y')).toBe('bar');
  });
});
