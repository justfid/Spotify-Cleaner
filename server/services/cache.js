'use strict';

const store = new Map();

module.exports = {
  has: (key) => store.has(key),
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  clear: () => store.clear(),
};
