import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidCard, parseCards, allCards, usedCards } from '../js/cards.js';

test('isValidCard', () => {
  assert.equal(isValidCard('Ah'), true);
  assert.equal(isValidCard('Tc'), true);
  assert.equal(isValidCard('1h'), false);
  assert.equal(isValidCard('Ax'), false);
  assert.equal(isValidCard('A'), false);
});

test('parseCards', () => {
  assert.deepEqual(parseCards('AhJd'), ['Ah', 'Jd']);
  assert.deepEqual(parseCards('Kc7h2s'), ['Kc', '7h', '2s']);
  assert.deepEqual(parseCards(null), []);
  assert.deepEqual(parseCards(''), []);
  assert.throws(() => parseCards('AhJ'), /invalides/);
  assert.throws(() => parseCards('AhZz'), /Carte invalide : Zz/);
});

test('allCards : 52 cartes distinctes', () => {
  const cards = allCards();
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards).size, 52);
});

test('usedCards : sièges + board', () => {
  const hand = {
    setup: { seats: [{ cards: 'AhJd' }, { cards: null }] },
    board: { flop: 'Kc7h2s', turn: null, river: null },
  };
  assert.deepEqual([...usedCards(hand)].sort(), ['2s', '7h', 'Ah', 'Jd', 'Kc']);
});
