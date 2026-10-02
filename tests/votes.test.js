import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tally } from '../js/votes.js';

test('tally : comptes et pourcentages', () => {
  assert.deepEqual(tally([0, 0, 1], 3), { counts: [2, 1, 0], percents: [67, 33, 0], total: 3 });
});

test('tally : arrondi au plus fort reste, somme = 100', () => {
  const r = tally([0, 1, 2], 3);
  assert.deepEqual(r.percents, [34, 33, 33]);
  const r2 = tally([0, 0, 1, 1, 1, 2, 3], 4);
  assert.equal(r2.percents.reduce((a, b) => a + b, 0), 100);
});

test('tally : aucun vote', () => {
  assert.deepEqual(tally([], 2), { counts: [0, 0], percents: [0, 0], total: 0 });
});

test('tally : votes hors plage ignorés', () => {
  assert.deepEqual(tally([0, 5, -1, 1.5], 2).counts, [1, 0]);
});
