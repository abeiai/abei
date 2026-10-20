import assert from 'node:assert/strict';
import test from 'node:test';
import { creatorMainOrigin } from '../src/creator-auth/creator-auth.protocol.js';

test('creator authorization defaults to the production account origin and preserves explicit local configuration', () => {
  const previous = process.env.CREATOR_MAIN_ORIGIN;
  try {
    delete process.env.CREATOR_MAIN_ORIGIN;
    assert.equal(creatorMainOrigin(), 'https://abeiai.com');
    process.env.CREATOR_MAIN_ORIGIN = 'https://accounts.example.test';
    assert.equal(creatorMainOrigin(), 'https://accounts.example.test');
    process.env.CREATOR_MAIN_ORIGIN = 'https://abeiai.com/creator';
    assert.throws(() => creatorMainOrigin(), /主站地址配置无效/);
  } finally {
    if (previous === undefined) delete process.env.CREATOR_MAIN_ORIGIN;
    else process.env.CREATOR_MAIN_ORIGIN = previous;
  }
});
