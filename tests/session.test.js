import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../js/session.js';
import { sampleHand } from './fixtures.js';

test('join : pseudo en double -> suffixe', () => {
  const s = new Session(sampleHand());
  assert.equal(s.join('c-a', 'Max').name, 'Max');
  assert.equal(s.join('c-b', 'Max').name, 'Max (2)');
});

test('join : même clientId = reconnexion', () => {
  const s = new Session(sampleHand());
  s.join('c-a', 'Max');
  s.leave('c-a');
  const p = s.join('c-a', 'Max');
  assert.equal(p.name, 'Max');
  assert.equal(p.connected, true);
  assert.equal(s.participants.length, 1);
});

test('join : pseudo d\'une connexion fermée repris avec son vote', () => {
  const s = new Session(sampleHand());
  s.join('c-a', 'Max');
  s.start();
  s.tick();
  s.vote('c-a', 2);
  s.leave('c-a');
  const p = s.join('c-z', 'Max');
  assert.equal(p.name, 'Max');
  assert.equal(p.id, 'c-z');
  assert.equal(s.participants.length, 1);
  assert.equal(s.view('c-z').myVote, 2);
});

test('déroulé complet de la main d\'exemple', () => {
  const s = new Session(sampleHand());
  s.join('host', 'Hôte');
  s.join('c-a', 'Max');
  assert.equal(s.phase, 'lobby');

  s.start();
  assert.equal(s.tick(), false);
  assert.equal(s.phase, 'voting');
  assert.equal(s.voteAt, 0);
  assert.equal(s.cursor, 0);

  assert.equal(s.vote('c-a', 3), true);
  assert.equal(s.vote('host', 3), true);
  assert.equal(s.vote('c-a', 2), true); // changement de vote
  assert.equal(s.vote('c-a', 9), false);
  assert.equal(s.view('c-a').voteCount, 2);

  s.reveal();
  assert.equal(s.phase, 'revealed');
  assert.deepEqual(s.view('c-a').results.percents, [0, 0, 50, 50]);
  assert.equal(s.vote('c-a', 0), false);

  s.next();
  assert.equal(s.phase, 'replay');
  assert.equal(s.cursor, 1);
  assert.equal(s.view('c-a').results, null);
  assert.equal(s.tick(), true);
  assert.equal(s.cursor, 2);
  assert.equal(s.tick(), true);
  assert.equal(s.cursor, 3);
  assert.equal(s.tick(), false);
  assert.equal(s.phase, 'voting');
  assert.equal(s.voteAt, 3);

  s.reveal();
  assert.equal(s.results.total, 0);
  s.next();
  assert.equal(s.cursor, 4);
  assert.equal(s.tick(), false);
  assert.equal(s.phase, 'finished');
});

test('view : actions futures et cartes des vilains cachées', () => {
  const s = new Session(sampleHand());
  s.join('c-a', 'Max');
  s.start();
  s.tick();
  const v = s.view('c-a');
  assert.equal(v.type, 'state');
  assert.equal(v.hand.actions.length, 0);
  assert.equal(v.hand.setup.seats[2].cards, null);
  assert.deepEqual(v.vote, { question: 'Que fais-tu ?', options: ['Fold', 'Limp', 'Raise 2bb', 'All-in'] });
  assert.equal(v.results, null);
  assert.equal(v.you, 'Max');
  assert.equal(v.myVote, null);
  assert.equal(v.voterCount, 1);
});

test('view : tout est révélé à la fin', () => {
  const s = new Session(sampleHand());
  s.start();
  s.tick();
  s.reveal();
  s.next();
  while (s.tick());
  s.reveal();
  s.next();
  s.tick();
  const v = s.view('c-a');
  assert.equal(v.phase, 'finished');
  assert.equal(v.hand.actions.length, 4);
  assert.equal(v.hand.setup.seats[2].cards, 'QsQc');
  assert.equal(v.hand.board.river, '4c');
});

test('join : pseudo absent -> Anonyme', () => {
  const s = new Session(sampleHand());
  assert.equal(s.join('c-x', undefined).name, 'Anonyme');
});

test('vote : refusé pour un inconnu ou un participant déconnecté', () => {
  const s = new Session(sampleHand());
  s.join('c-a', 'Max');
  s.start();
  s.tick();
  assert.equal(s.vote('c-inconnu', 0), false);
  s.leave('c-a');
  assert.equal(s.vote('c-a', 0), false);
});

test('view : le dénominateur inclut les votes des déconnectés', () => {
  const s = new Session(sampleHand());
  s.join('c-a', 'A');
  s.join('c-b', 'B');
  s.start();
  s.tick();
  assert.equal(s.vote('c-a', 0), true);
  s.leave('c-a');
  s.leave('c-b');
  const v = s.view('c-a');
  assert.equal(v.voteCount, 1);
  assert.equal(v.voterCount, 1);
});
