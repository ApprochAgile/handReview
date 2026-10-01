import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHand, parseHand, serializeHand, fileNameFor, publicHand } from '../js/hand-format.js';
import { sampleHand } from './fixtures.js';

test('validateHand : main valide', () => {
  assert.equal(validateHand(sampleHand()), null);
});

test('validateHand : erreurs de setup', () => {
  const h1 = sampleHand();
  h1.version = 2;
  assert.match(validateHand(h1), /Version/);

  const h2 = sampleHand();
  h2.setup.seats[1].hero = true;
  h2.setup.seats[1].cards = '2c3c';
  assert.match(validateHand(h2), /exactement un Hero/);

  const h3 = sampleHand();
  h3.setup.seats[0].cards = null;
  assert.match(validateHand(h3), /Siège 1 \(Hero\)/);

  const h4 = sampleHand();
  h4.setup.seats[0].position = 'SB';
  assert.match(validateHand(h4), /position attendue BTN/);
});

test('validateHand : carte en double', () => {
  const h = sampleHand();
  h.board.river = 'Ah';
  assert.match(validateHand(h), /double/);
});

test('validateHand : action illégale', () => {
  const h = sampleHand();
  h.actions[2] = { seat: 2, type: 'check' };
  assert.match(validateHand(h), /Action 3/);
});

test('validateHand : vote avec une seule option', () => {
  const h = sampleHand();
  h.actions[0].vote.options = ['Fold'];
  assert.match(validateHand(h), /Vote de l'action 1/);
});

test('validateHand : board incohérent', () => {
  const h1 = sampleHand();
  h1.board.river = null;
  assert.match(validateHand(h1), /river/);

  const h2 = sampleHand();
  h2.actions = [h2.actions[0], h2.actions[1], { seat: 2, type: 'fold' }];
  assert.match(validateHand(h2), /non atteinte/);
});

test('parseHand', () => {
  assert.match(parseHand('{oops').error, /illisible/);
  const { hand, error } = parseHand(serializeHand(sampleHand()));
  assert.equal(error, null);
  assert.deepEqual(hand, sampleHand());
});

test('parseHand : board absent normalisé', () => {
  const h = sampleHand();
  h.actions = [h.actions[0], h.actions[1], { seat: 2, type: 'fold' }];
  delete h.board;
  assert.deepEqual(parseHand(JSON.stringify(h)).hand.board, { flop: null, turn: null, river: null });
});

test('fileNameFor', () => {
  assert.equal(fileNameFor({ title: 'BTN open 15bb, BB jam' }), 'btn-open-15bb-bb-jam.json');
  assert.equal(fileNameFor({ title: 'Défense BB' }), 'defense-bb.json');
  assert.equal(fileNameFor({ title: '' }), 'main.json');
});

test('publicHand : rien de futur ni de caché', () => {
  const p = publicHand(sampleHand(), 0, false);
  assert.deepEqual(p.actions, []);
  assert.equal(p.setup.seats[0].cards, 'AhJd');
  assert.equal(p.setup.seats[2].cards, null);
  assert.deepEqual(p.board, { flop: null, turn: null, river: null });

  const p3 = publicHand(sampleHand(), 3, false);
  assert.equal(p3.actions.length, 3);
  assert.equal('vote' in p3.actions[0], false);
});

test('publicHand : tout révélé à la fin', () => {
  const p = publicHand(sampleHand(), 4, true);
  assert.equal(p.setup.seats[2].cards, 'QsQc');
  assert.equal(p.setup.seats[1].cards, null);
  assert.deepEqual(p.board, { flop: 'Kc7h2s', turn: '9d', river: '4c' });
});

test('validateHand : hero doit être un booléen', () => {
  const h = sampleHand();
  h.setup.seats[1].hero = 'false';
  assert.match(validateHand(h), /hero invalide/);
});

test('publicHand : liste blanche des champs', () => {
  const h = sampleHand();
  h.setup.seats[1].note = 'il a KK';
  h.setup.extra = 1;
  const p = publicHand(h, 0, false);
  assert.equal('note' in p.setup.seats[1], false);
  assert.equal('extra' in p.setup, false);
});

test('validateHand : entrées malformées et montants', () => {
  const h1 = sampleHand();
  h1.setup.seats[1] = null;
  assert.match(validateHand(h1), /Siège 2 : siège invalide/);

  const h2 = sampleHand();
  h2.actions[1] = null;
  assert.match(validateHand(h2), /Action 2 : action invalide/);

  const h3 = sampleHand();
  h3.actions[0].amount = '2';
  assert.match(validateHand(h3), /Action 1 : montant invalide/);

  const h4 = sampleHand();
  h4.actions[1] = { seat: 1, type: 'fold', amount: 3 };
  assert.match(validateHand(h4), /Action 2 : montant inattendu/);

  const h5 = sampleHand();
  h5.setup.seats[2].stack = 0.001;
  assert.match(validateHand(h5), /Siège 3 : stack invalide/);

  assert.equal(validateHand(sampleHand()), null);
});
