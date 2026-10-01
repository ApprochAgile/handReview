import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, legalActions, applyAction, computeState, requiredBoard, totalPot } from '../js/engine.js';
import { positionsFor } from '../js/positions.js';

function setupOf(stacks) {
  const positions = positionsFor(stacks.length);
  return {
    players: stacks.length,
    seats: stacks.map((stack, i) => ({ name: `J${i + 1}`, position: positions[i], stack, cards: null, hero: i === 0 })),
  };
}
const types = (legal) => legal.map((l) => l.type);

test('3 joueurs : blinds postées, le BTN parle en premier', () => {
  const s = initialState(setupOf([15, 22, 13]));
  assert.equal(s.seats[1].bet, 0.5);
  assert.equal(s.seats[1].stack, 21.5);
  assert.equal(s.seats[2].bet, 1);
  assert.equal(s.seats[2].stack, 12);
  assert.equal(s.currentBet, 1);
  assert.equal(s.toAct, 0);
  assert.equal(s.street, 'preflop');
  assert.equal(totalPot(s), 1.5);
});

test('heads-up : le BTN poste la SB et parle en premier', () => {
  const s = initialState(setupOf([10, 10]));
  assert.equal(s.seats[0].bet, 0.5);
  assert.equal(s.seats[1].bet, 1);
  assert.equal(s.toAct, 0);
});

test('6 et 9 joueurs : le premier siège parle en premier', () => {
  assert.equal(initialState(setupOf(Array(6).fill(20))).toAct, 0);
  assert.equal(initialState(setupOf(Array(9).fill(20))).toAct, 0);
});

test('stack inférieur à la blind : la BB est à tapis', () => {
  const s = initialState(setupOf([10, 10, 0.6]));
  assert.equal(s.seats[2].bet, 0.6);
  assert.equal(s.seats[2].stack, 0);
  assert.equal(s.seats[2].allIn, true);
});

test('actions légales préflop du BTN', () => {
  assert.deepEqual(legalActions(initialState(setupOf([15, 22, 13]))), [
    { type: 'fold' },
    { type: 'call', amount: 1 },
    { type: 'raise', min: 2, max: 15 },
    { type: 'allin', amount: 15 },
  ]);
});

test('ligne de la spec : raise, fold, jam, call -> showdown', () => {
  const setup = setupOf([15, 22, 13]);
  const actions = [
    { seat: 0, type: 'raise', amount: 2 },
    { seat: 1, type: 'fold' },
    { seat: 2, type: 'allin' },
    { seat: 0, type: 'call' },
  ];
  const before = computeState(setup, actions, 3);
  assert.equal(before.toAct, 0);
  assert.deepEqual(types(legalActions(before)), ['fold', 'call']);
  const s = computeState(setup, actions);
  assert.equal(s.handOver, true);
  assert.equal(s.showdown, true);
  assert.equal(s.toAct, null);
  assert.equal(totalPot(s), 26.5);
  assert.deepEqual(requiredBoard(s), { flop: true, turn: true, river: true });
});

test('heads-up : limp, check -> flop, la BB parle en premier', () => {
  const setup = setupOf([10, 10]);
  let s = computeState(setup, [{ seat: 0, type: 'call' }]);
  assert.equal(s.toAct, 1);
  assert.deepEqual(types(legalActions(s)), ['check', 'raise', 'allin']);
  s = computeState(setup, [{ seat: 0, type: 'call' }, { seat: 1, type: 'check' }]);
  assert.equal(s.street, 'flop');
  assert.equal(s.toAct, 1);
  assert.equal(totalPot(s), 2);
  assert.deepEqual(types(legalActions(s)), ['check', 'bet', 'allin']);
});

test('3 joueurs : flop puis turn sur checks, la SB parle en premier postflop', () => {
  const setup = setupOf([15, 15, 15]);
  const pre = [{ seat: 0, type: 'call' }, { seat: 1, type: 'call' }, { seat: 2, type: 'check' }];
  let s = computeState(setup, pre);
  assert.equal(s.street, 'flop');
  assert.equal(s.toAct, 1);
  assert.equal(totalPot(s), 3);
  s = computeState(setup, [...pre, { seat: 1, type: 'check' }, { seat: 2, type: 'check' }, { seat: 0, type: 'check' }]);
  assert.equal(s.street, 'turn');
  assert.equal(s.toAct, 1);
  assert.deepEqual(requiredBoard(s), { flop: true, turn: true, river: false });
});

test('9 joueurs : tout le monde se couche jusqu\'à la BB', () => {
  const folds = Array.from({ length: 8 }, (_, i) => ({ seat: i, type: 'fold' }));
  const s = computeState(setupOf(Array(9).fill(20)), folds);
  assert.equal(s.handOver, true);
  assert.equal(s.showdown, false);
  assert.equal(totalPot(s), 1.5);
  assert.deepEqual(requiredBoard(s), { flop: false, turn: false, river: false });
});

test('relance minimum après un raise à 3', () => {
  const s = computeState(setupOf([30, 30, 30]), [{ seat: 0, type: 'raise', amount: 3 }]);
  const raise = legalActions(s).find((l) => l.type === 'raise');
  assert.equal(raise.min, 5);
  assert.equal(raise.max, 30);
});

test('actions illégales rejetées', () => {
  const setup = setupOf([15, 15, 15]);
  assert.throws(() => computeState(setup, [{ seat: 1, type: 'call' }]), /Action 1/);
  assert.throws(() => computeState(setup, [{ seat: 0, type: 'check' }]), /impossible/);
  assert.throws(() => computeState(setup, [{ seat: 0, type: 'raise', amount: 1.5 }]), /Montant invalide/);
});

test('raise du stack entier = tapis', () => {
  const s = computeState(setupOf([15, 15, 15]), [{ seat: 0, type: 'raise', amount: 15 }]);
  assert.equal(s.seats[0].allIn, true);
  assert.equal(s.seats[0].stack, 0);
  assert.equal(s.seats[0].lastAction.type, 'allin');
});

test('applyAction ne modifie pas l\'état précédent', () => {
  const s0 = initialState(setupOf([15, 15, 15]));
  applyAction(s0, { seat: 0, type: 'fold' });
  assert.equal(s0.seats[0].folded, false);
});

test('heads-up : SB à tapis en postant, la BB ne peut que checker', () => {
  const setup = setupOf([0.5, 10]);
  const s = initialState(setup);
  assert.equal(s.toAct, 1);
  assert.deepEqual(types(legalActions(s)), ['check']);
  const end = computeState(setup, [{ seat: 1, type: 'check' }]);
  assert.equal(end.handOver, true);
  assert.equal(end.showdown, true);
});
