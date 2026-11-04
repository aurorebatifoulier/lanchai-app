import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural } from '../../utils/plural';

test('plural', () => {
  assert.equal(plural(0, 'item'), '0 items');
  assert.equal(plural(1, 'item'), '1 item');
  assert.equal(plural(3, 'pick-up'), '3 pick-ups');
});
