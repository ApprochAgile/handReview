import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionsFor, buttonIndex, smallBlindIndex, bigBlindIndex } from '../js/positions.js';

test('positionsFor : une position par joueur, la BB en dernier', () => {
  for (let n = 2; n <= 9; n++) {
    const positions = positionsFor(n);
    assert.equal(positions.length, n);
    assert.equal(positions.at(-1), 'BB');
  }
  assert.deepEqual(positionsFor(6), ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
});

test('positionsFor : refuse un nombre de joueurs hors 2-9', () => {
  assert.throws(() => positionsFor(1), /invalide/);
  assert.throws(() => positionsFor(10), /invalide/);
});

test('index du bouton et des blinds', () => {
  assert.deepEqual([buttonIndex(2), smallBlindIndex(2), bigBlindIndex(2)], [0, 0, 1]);
  assert.deepEqual([buttonIndex(3), smallBlindIndex(3), bigBlindIndex(3)], [0, 1, 2]);
  assert.deepEqual([buttonIndex(9), smallBlindIndex(9), bigBlindIndex(9)], [6, 7, 8]);
});
