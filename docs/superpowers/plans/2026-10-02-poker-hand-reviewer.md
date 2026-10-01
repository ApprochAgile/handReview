# Poker Hand Reviewer — Plan d'implémentation (V1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une page web statique où un éditeur saisit une main de poker sur une table visuelle avec des points de vote, et où un hôte rejoue cette main en direct pour un groupe privé qui vote sur son propre appareil (pourcentages révélés par l'hôte).

**Architecture:** HTML/CSS/JS vanilla en modules ES, sans build. La logique (moteur de main, format JSON, décompte des votes, état de session) est dans des modules purs testés avec `node --test`. L'interface (éditeur, hôte, votant) s'appuie dessus. La communication hôte ↔ votants passe en pair-à-pair par PeerJS (WebRTC), l'hôte étant l'unique source de vérité ; rien n'est stocké côté serveur.

**Tech Stack:** JavaScript ES2022 (modules), Node 22 (`node --test`, aucune dépendance npm), PeerJS 1.5.4 via unpkg, hébergement statique (GitHub Pages / Netlify), `npx serve` en local.

**Spec :** `docs/superpowers/specs/2026-10-02-poker-hand-reviewer-design.md`

**Précisions par rapport à la spec** (décisions prises en écrivant le plan) :
- Modules ajoutés : `session.js` (état de session pur, testable — sorti de `host.js`), `vote-view.js` (panneau de vote partagé hôte/votant), `dom.js` (échappement HTML, stockage protégé, téléchargement), `main.js` (routage).
- `hand-format.js` expose `publicHand()` au lieu d'un simple retrait des cartes vilains : les votants ne reçoivent ni les cartes des vilains, ni les **actions futures**, ni les **cartes de board non atteintes** (sinon on pourrait voir la ligne réelle avant de voter en inspectant la page).
- Reconnexion : chaque votant a un `clientId` (sessionStorage) envoyé dans `join` ; l'hôte reconnaît d'abord le `clientId`, puis à défaut le pseudo d'une connexion fermée (comme dans la spec).
- Le sélecteur de cartes est une grille complète 4 × 13 (une ligne par couleur) : moins de clics que « couleur puis rang ».

**Conventions :**
- Tous les chemins sont relatifs à la racine du dépôt `reviewer/`.
- Les commandes s'exécutent depuis `reviewer/` (Git Bash ou PowerShell).
- Textes d'interface en français, identifiants de code en anglais.
- Montants en BB, arrondis au centième.

## Structure des fichiers

```
reviewer/
  package.json            "type": "module" + script de test
  index.html              page unique (charge PeerJS puis js/main.js)
  README.md               lancer, tester, déployer
  css/style.css           thème tapis vert/or, table, responsive
  js/
    positions.js          positions par nombre de joueurs, index BTN/SB/BB (pur)
    cards.js              parsing des cartes, cartes utilisées (pur)
    engine.js             moteur de main : état après N actions, actions légales (pur)
    votes.js              décompte + pourcentages au plus fort reste (pur)
    hand-format.js        validation, import/export JSON, publicHand (pur)
    session.js            état de session côté hôte : participants, phases, votes (pur)
    dom.js                esc(), stockage protégé, randomId(), downloadText()
    table-view.js         rendu HTML de la table
    card-picker.js        modale de choix de cartes
    vote-view.js          panneau de vote (hôte + votant)
    editor.js             écran éditeur
    net.js                couche PeerJS (hôte / votant, reconnexion)
    host.js               écran hôte
    voter.js              écran votant
    main.js               routage : accueil, #edit, #host, #join=<id>
  tests/
    fixtures.js           main d'exemple de la spec
    *.test.js             tests node:test des modules purs
```

---

### Task 1 : Initialisation et positions

**Files:**
- Create: `package.json`
- Create: `js/positions.js`
- Test: `tests/positions.test.js`

- [ ] **Step 1 : Créer `package.json`**

```json
{
  "name": "poker-hand-reviewer",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

`node --test` sans argument trouve automatiquement les fichiers `**/*.test.js`.

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `tests/positions.test.js` :

```js
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
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/positions.js'`

- [ ] **Step 4 : Implémenter**

Créer `js/positions.js` :

```js
const POSITIONS = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 9;

export function positionsFor(players) {
  const list = POSITIONS[players];
  if (!list) throw new Error(`Nombre de joueurs invalide : ${players}`);
  return [...list];
}

// En heads-up, le BTN est aussi la SB.
export function buttonIndex(players) {
  return players === 2 ? 0 : players - 3;
}

export function smallBlindIndex(players) {
  return players === 2 ? 0 : players - 2;
}

export function bigBlindIndex(players) {
  return players - 1;
}
```

- [ ] **Step 5 : Lancer les tests**

Run: `npm test`
Expected: PASS — `# pass 3`, `# fail 0`

- [ ] **Step 6 : Commit**

```bash
git add package.json js/positions.js tests/positions.test.js
git commit -m "feat: positions par nombre de joueurs"
```

---

### Task 2 : Cartes

**Files:**
- Create: `js/cards.js`
- Test: `tests/cards.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/cards.test.js` :

```js
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/cards.js'`

- [ ] **Step 3 : Implémenter**

Créer `js/cards.js` :

```js
export const RANKS = 'AKQJT98765432';
export const SUITS = 'shdc';

export function isValidCard(card) {
  return typeof card === 'string' && card.length === 2 && RANKS.includes(card[0]) && SUITS.includes(card[1]);
}

// "AhJd" -> ["Ah", "Jd"] ; null ou "" -> []
export function parseCards(text) {
  if (text == null || text === '') return [];
  if (typeof text !== 'string' || text.length % 2 !== 0) throw new Error(`Cartes invalides : ${text}`);
  const cards = [];
  for (let i = 0; i < text.length; i += 2) {
    const card = text.slice(i, i + 2);
    if (!isValidCard(card)) throw new Error(`Carte invalide : ${card}`);
    cards.push(card);
  }
  return cards;
}

export function allCards() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push(rank + suit);
  return cards;
}

// Toutes les cartes déjà attribuées dans la main (sièges + board).
export function usedCards(hand) {
  const used = new Set();
  for (const seat of hand.setup.seats) for (const card of parseCards(seat.cards)) used.add(card);
  for (const street of ['flop', 'turn', 'river']) for (const card of parseCards(hand.board?.[street])) used.add(card);
  return used;
}
```

- [ ] **Step 4 : Vérifier le succès**

Run: `npm test`
Expected: PASS — `# pass 7`, `# fail 0`

- [ ] **Step 5 : Commit**

```bash
git add js/cards.js tests/cards.test.js
git commit -m "feat: parsing et suivi des cartes"
```

---

### Task 3 : Moteur de main

Le cœur du projet. `computeState(setup, actions, n)` rejoue les `n` premières actions et renvoie l'état de la table. Règles (spec §4) :
- Blinds fixes 0,5 / 1 ; un stack inférieur à la blind poste tout et passe à tapis.
- Préflop : le premier à parler est le siège après la BB (en heads-up, le BTN/SB). Postflop : premier joueur actif après le bouton (en heads-up, la BB).
- Un tour est clos quand tous les joueurs actifs non à tapis ont parlé depuis la dernière relance et égalisé.
- `amount` d'un bet/raise = total misé sur la street. Bet min 1 BB ; raise min = mise courante + dernier incrément. Max = tout le stack (un bet/raise du stack entier met à tapis).
- Si tout le monde (sauf au plus un joueur) est à tapis à la clôture d'un tour, la main va au showdown et tout le board devient nécessaire.
- Pas de side pots (un seul pot). Simplification : un all-in court rouvre quand même les enchères.

État renvoyé :

```
{
  n, pot, streetIndex (0..3), street ('preflop'|'flop'|'turn'|'river'),
  currentBet, minRaise, toAct (index ou null), handOver, showdown,
  seats: [{ stack, bet, folded, allIn, acted, lastAction: { type, amount } | null }]
}
```

**Files:**
- Create: `js/engine.js`
- Test: `tests/engine.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/engine.test.js` :

```js
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/engine.js'`

- [ ] **Step 3 : Implémenter**

Créer `js/engine.js` :

```js
import { buttonIndex, smallBlindIndex, bigBlindIndex } from './positions.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river'];

// Arrondi au centième pour éviter les erreurs de flottants (0.1 + 0.2...).
const r2 = (x) => Math.round(x * 100) / 100;

function post(seat, blind) {
  const amount = r2(Math.min(seat.stack, blind));
  seat.stack = r2(seat.stack - amount);
  seat.bet = amount;
  seat.allIn = seat.stack === 0;
  seat.lastAction = { type: 'post', amount };
}

function needsToAct(state, seat) {
  return !seat.folded && !seat.allIn && (!seat.acted || seat.bet < state.currentBet);
}

function nextToAct(state, from) {
  for (let k = 0; k < state.n; k++) {
    const i = (from + k) % state.n;
    if (needsToAct(state, state.seats[i])) return i;
  }
  return null;
}

function collectBets(state) {
  for (const seat of state.seats) {
    state.pot = r2(state.pot + seat.bet);
    seat.bet = 0;
  }
}

function endHand(state, showdown) {
  collectBets(state);
  state.toAct = null;
  state.handOver = true;
  state.showdown = showdown;
  if (showdown) {
    state.streetIndex = 3;
    state.street = STREETS[3];
  }
  return state;
}

function advance(state, from) {
  const alive = state.seats.filter((s) => !s.folded);
  if (alive.length === 1) return endHand(state, false);
  const next = nextToAct(state, from);
  if (next !== null) {
    state.toAct = next;
    return state;
  }
  // Tour d'enchères clos.
  collectBets(state);
  const canAct = alive.filter((s) => !s.allIn).length;
  if (state.streetIndex === 3 || canAct <= 1) return endHand(state, true);
  state.streetIndex += 1;
  state.street = STREETS[state.streetIndex];
  state.currentBet = 0;
  state.minRaise = 1;
  for (const seat of state.seats) {
    seat.acted = false;
    if (!seat.folded) seat.lastAction = null;
  }
  state.toAct = nextToAct(state, (buttonIndex(state.n) + 1) % state.n);
  return state;
}

export function initialState(setup) {
  const n = setup.players;
  const seats = setup.seats.map((s) => ({
    stack: s.stack, bet: 0, folded: false, allIn: false, acted: false, lastAction: null,
  }));
  post(seats[smallBlindIndex(n)], 0.5);
  post(seats[bigBlindIndex(n)], 1);
  const state = {
    n,
    seats,
    pot: 0,
    streetIndex: 0,
    street: STREETS[0],
    currentBet: Math.max(...seats.map((s) => s.bet)),
    minRaise: 1,
    toAct: null,
    handOver: false,
    showdown: false,
  };
  return advance(state, (bigBlindIndex(n) + 1) % n);
}

export function legalActions(state) {
  if (state.toAct === null) return [];
  const i = state.toAct;
  const seat = state.seats[i];
  const toCall = r2(state.currentBet - seat.bet);
  const max = r2(seat.bet + seat.stack);
  const othersCanAct = state.seats.some((o, j) => j !== i && !o.folded && !o.allIn);
  const legal = [];
  if (toCall > 0) legal.push({ type: 'fold' });
  if (toCall === 0) legal.push({ type: 'check' });
  if (toCall > 0 && seat.stack > toCall) legal.push({ type: 'call', amount: toCall });
  if (othersCanAct) {
    if (state.currentBet === 0 && max > 1) legal.push({ type: 'bet', min: 1, max });
    const minTo = r2(state.currentBet + state.minRaise);
    if (state.currentBet > 0 && max > minTo) legal.push({ type: 'raise', min: minTo, max });
  }
  if (othersCanAct || seat.stack <= toCall) legal.push({ type: 'allin', amount: max });
  return legal;
}

export function applyAction(previous, action) {
  if (previous.toAct === null) throw new Error('La main est terminée');
  if (action.seat !== previous.toAct) throw new Error(`Ce n'est pas au siège ${action.seat + 1} de parler`);
  const legal = legalActions(previous).find((l) => l.type === action.type);
  if (!legal) throw new Error(`Action « ${action.type} » impossible ici`);

  const state = structuredClone(previous);
  const i = action.seat;
  const seat = state.seats[i];
  const putTo = (total) => {
    seat.stack = r2(seat.stack - (total - seat.bet));
    seat.bet = r2(total);
    if (seat.stack === 0) seat.allIn = true;
    if (seat.bet > state.currentBet) {
      const increment = r2(seat.bet - state.currentBet);
      if (increment >= state.minRaise) state.minRaise = increment;
      state.currentBet = seat.bet;
      state.seats.forEach((o, j) => { if (j !== i) o.acted = false; });
    }
  };

  switch (action.type) {
    case 'fold':
      seat.folded = true;
      break;
    case 'check':
      break;
    case 'call':
      putTo(state.currentBet);
      break;
    case 'bet':
    case 'raise': {
      const amount = Number(action.amount);
      if (!(amount >= legal.min && amount <= legal.max)) {
        throw new Error(`Montant invalide : ${action.amount} (entre ${legal.min} et ${legal.max})`);
      }
      putTo(amount);
      break;
    }
    case 'allin':
      putTo(r2(seat.bet + seat.stack));
      break;
    default:
      throw new Error(`Type d'action inconnu : ${action.type}`);
  }
  seat.acted = true;
  seat.lastAction = { type: seat.allIn ? 'allin' : action.type, amount: seat.bet };
  return advance(state, (i + 1) % state.n);
}

export function computeState(setup, actions, count = actions.length) {
  let state = initialState(setup);
  for (let k = 0; k < count; k++) {
    try {
      state = applyAction(state, actions[k]);
    } catch (e) {
      throw new Error(`Action ${k + 1} : ${e.message}`);
    }
  }
  return state;
}

export function requiredBoard(state) {
  return { flop: state.streetIndex >= 1, turn: state.streetIndex >= 2, river: state.streetIndex >= 3 };
}

export function totalPot(state) {
  return r2(state.pot + state.seats.reduce((sum, s) => sum + s.bet, 0));
}
```

- [ ] **Step 4 : Vérifier le succès**

Run: `npm test`
Expected: PASS — `# pass 21`, `# fail 0`

- [ ] **Step 5 : Commit**

```bash
git add js/engine.js tests/engine.test.js
git commit -m "feat: moteur de main (blinds, ordre de parole, streets, actions légales)"
```

---

### Task 4 : Décompte des votes

**Files:**
- Create: `js/votes.js`
- Test: `tests/votes.test.js`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `tests/votes.test.js` :

```js
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/votes.js'`

- [ ] **Step 3 : Implémenter**

Créer `js/votes.js` :

```js
// choices : liste d'index d'options. Pourcentages entiers dont la somme fait 100
// (méthode du plus fort reste), sauf s'il n'y a aucun vote.
export function tally(choices, optionCount) {
  const counts = Array(optionCount).fill(0);
  for (const c of choices) if (Number.isInteger(c) && c >= 0 && c < optionCount) counts[c]++;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return { counts, percents: Array(optionCount).fill(0), total };
  const raw = counts.map((c) => (c * 100) / total);
  const percents = raw.map(Math.floor);
  const missing = 100 - percents.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < missing; k++) percents[order[k].i]++;
  return { counts, percents, total };
}
```

- [ ] **Step 4 : Vérifier le succès**

Run: `npm test`
Expected: PASS — `# pass 25`, `# fail 0`

- [ ] **Step 5 : Commit**

```bash
git add js/votes.js tests/votes.test.js
git commit -m "feat: décompte des votes et pourcentages"
```

---

### Task 5 : Format de la main (validation, import/export, vue publique)

**Files:**
- Create: `tests/fixtures.js`
- Create: `js/hand-format.js`
- Test: `tests/hand-format.test.js`

- [ ] **Step 1 : Créer la main d'exemple partagée par les tests**

Créer `tests/fixtures.js` (ce n'est pas un fichier de test : il ne finit pas par `.test.js`) :

```js
// Main d'exemple de la spec (§3), valide.
export function sampleHand() {
  return {
    version: 1,
    title: 'BTN open 15bb, BB jam',
    setup: {
      players: 3,
      seats: [
        { name: 'Hero', position: 'BTN', stack: 15, cards: 'AhJd', hero: true },
        { name: 'Vilain 1', position: 'SB', stack: 22, cards: null, hero: false },
        { name: 'Vilain 2', position: 'BB', stack: 13, cards: 'QsQc', hero: false },
      ],
    },
    board: { flop: 'Kc7h2s', turn: '9d', river: '4c' },
    actions: [
      { seat: 0, type: 'raise', amount: 2, vote: { question: 'Que fais-tu ?', options: ['Fold', 'Limp', 'Raise 2bb', 'All-in'] } },
      { seat: 1, type: 'fold' },
      { seat: 2, type: 'allin' },
      { seat: 0, type: 'call', vote: { question: '', options: ['Fold', 'Call'] } },
    ],
  };
}
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `tests/hand-format.test.js` :

```js
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
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/hand-format.js'`

- [ ] **Step 4 : Implémenter**

Créer `js/hand-format.js` :

```js
import { positionsFor, MIN_PLAYERS, MAX_PLAYERS } from './positions.js';
import { parseCards } from './cards.js';
import { computeState, requiredBoard } from './engine.js';

export const VOTE_MIN_OPTIONS = 2;
export const VOTE_MAX_OPTIONS = 6;
const BOARD_SIZES = { flop: 3, turn: 1, river: 1 };

function fail(message) {
  throw new Error(message);
}

// Retourne null si la main est valide, sinon le message du premier problème.
export function validateHand(hand) {
  try {
    check(hand);
    return null;
  } catch (e) {
    return e.message;
  }
}

function check(hand) {
  if (!hand || typeof hand !== 'object') fail('Le fichier ne contient pas une main.');
  if (hand.version !== 1) fail('Version de format non prise en charge.');
  if (typeof hand.title !== 'string') fail('Titre manquant.');
  const setup = hand.setup;
  if (!setup || !Number.isInteger(setup.players) || setup.players < MIN_PLAYERS || setup.players > MAX_PLAYERS) {
    fail('Nombre de joueurs invalide (2 à 9).');
  }
  const positions = positionsFor(setup.players);
  if (!Array.isArray(setup.seats) || setup.seats.length !== setup.players) {
    fail('Le nombre de sièges ne correspond pas au nombre de joueurs.');
  }

  const seen = new Set();
  const addCards = (text, expected, label) => {
    let cards;
    try {
      cards = parseCards(text);
    } catch (e) {
      fail(`${label} : ${e.message}`);
    }
    if (cards.length !== expected) fail(`${label} : ${expected} carte(s) attendue(s).`);
    for (const card of cards) {
      if (seen.has(card)) fail(`Carte en double : ${card}`);
      seen.add(card);
    }
  };

  let heroes = 0;
  setup.seats.forEach((seat, i) => {
    const label = `Siège ${i + 1}`;
    if (seat.position !== positions[i]) fail(`${label} : position attendue ${positions[i]}.`);
    if (typeof seat.name !== 'string' || !seat.name.trim()) fail(`${label} : nom manquant.`);
    if (typeof seat.stack !== 'number' || !(seat.stack > 0)) fail(`${label} : stack invalide.`);
    if (seat.hero === true) {
      heroes++;
      addCards(seat.cards, 2, `${label} (Hero)`);
    } else if (seat.cards != null) {
      addCards(seat.cards, 2, label);
    }
  });
  if (heroes !== 1) fail('Il faut exactement un Hero.');

  if (!Array.isArray(hand.actions)) fail("Liste d'actions manquante.");
  hand.actions.forEach((action, k) => {
    if (action.vote !== undefined) checkVote(action.vote, k);
  });
  let state;
  try {
    state = computeState(setup, hand.actions);
  } catch (e) {
    fail(e.message);
  }

  const required = requiredBoard(state);
  const board = hand.board ?? {};
  for (const street of ['flop', 'turn', 'river']) {
    const label = `Board (${street})`;
    if (required[street]) addCards(board[street], BOARD_SIZES[street], label);
    else if (board[street] != null) fail(`${label} : street non atteinte, doit être vide.`);
  }
}

function checkVote(vote, k) {
  const label = `Vote de l'action ${k + 1}`;
  if (!vote || typeof vote !== 'object') fail(`${label} : invalide.`);
  if (vote.question !== undefined && typeof vote.question !== 'string') fail(`${label} : question invalide.`);
  if (!Array.isArray(vote.options) || vote.options.length < VOTE_MIN_OPTIONS || vote.options.length > VOTE_MAX_OPTIONS) {
    fail(`${label} : il faut entre ${VOTE_MIN_OPTIONS} et ${VOTE_MAX_OPTIONS} options.`);
  }
  if (vote.options.some((o) => typeof o !== 'string' || !o.trim())) fail(`${label} : option vide.`);
}

export function parseHand(text) {
  let hand;
  try {
    hand = JSON.parse(text);
  } catch {
    return { hand: null, error: 'Fichier JSON illisible.' };
  }
  const error = validateHand(hand);
  if (error) return { hand: null, error };
  hand.board = { flop: null, turn: null, river: null, ...(hand.board ?? {}) };
  return { hand, error: null };
}

export function serializeHand(hand) {
  return JSON.stringify(hand, null, 2);
}

export function fileNameFor(hand) {
  const slug = (hand.title ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'main'}.json`;
}

// Ce que les votants ont le droit de voir après `cursor` actions :
// pas d'actions futures, pas de votes, pas de board non atteint,
// et cartes des vilains seulement si `reveal`.
export function publicHand(hand, cursor, reveal) {
  const actions = hand.actions
    .slice(0, cursor)
    .map(({ seat, type, amount }) => (amount === undefined ? { seat, type } : { seat, type, amount }));
  const required = requiredBoard(computeState(hand.setup, actions));
  const board = {};
  for (const street of ['flop', 'turn', 'river']) board[street] = required[street] ? hand.board?.[street] ?? null : null;
  const seats = hand.setup.seats.map((s) => ({ ...s, cards: s.hero || reveal ? s.cards ?? null : null }));
  return { version: hand.version, title: hand.title, setup: { ...hand.setup, seats }, board, actions };
}
```

- [ ] **Step 5 : Vérifier le succès**

Run: `npm test`
Expected: PASS — `# pass 36`, `# fail 0`

- [ ] **Step 6 : Commit**

```bash
git add js/hand-format.js tests/fixtures.js tests/hand-format.test.js
git commit -m "feat: validation, import/export et vue publique d'une main"
```

---

### Task 6 : État de session (côté hôte)

`Session` ne connaît ni le réseau ni le DOM. Phases : `lobby` → `replay` → (`voting` → `revealed` → `replay`)* → `finished`. `tick()` joue une action de replay et renvoie `true` tant qu'il faut rappeler (l'hôte le rappelle toutes les 700 ms) ; il s'arrête sur un point de vote ou à la fin. `view(clientId)` construit le message `state` envoyé à un participant.

**Files:**
- Create: `js/session.js`
- Test: `tests/session.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `tests/session.test.js` :

```js
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
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/session.js'`

- [ ] **Step 3 : Implémenter**

Créer `js/session.js` :

```js
import { tally } from './votes.js';
import { publicHand } from './hand-format.js';

const MAX_NAME_LENGTH = 24;

// État d'une session de vote, côté hôte. Aucune dépendance réseau ni DOM.
export class Session {
  constructor(hand) {
    this.hand = hand;
    this.phase = 'lobby'; // lobby | replay | voting | revealed | finished
    this.cursor = 0; // nombre d'actions déjà montrées
    this.voteAt = null; // index de l'action en cours de vote
    this.votes = new Map(); // clientId -> index d'option
    this.results = null;
    this.participants = []; // { id, name, connected }
  }

  join(clientId, wantedName) {
    const name = String(wantedName).trim().slice(0, MAX_NAME_LENGTH) || 'Anonyme';
    let p = this.participants.find((x) => x.id === clientId);
    if (!p) {
      p = this.participants.find((x) => x.name === name && !x.connected);
      if (p) {
        if (this.votes.has(p.id)) {
          this.votes.set(clientId, this.votes.get(p.id));
          this.votes.delete(p.id);
        }
        p.id = clientId;
      }
    }
    if (p) {
      p.connected = true;
      return p;
    }
    let unique = name;
    for (let k = 2; this.participants.some((x) => x.name === unique); k++) unique = `${name} (${k})`;
    p = { id: clientId, name: unique, connected: true };
    this.participants.push(p);
    return p;
  }

  leave(clientId) {
    const p = this.participants.find((x) => x.id === clientId);
    if (p) p.connected = false;
  }

  start() {
    if (this.phase === 'lobby') this.phase = 'replay';
  }

  // Une étape de replay. Retourne true si une action a été jouée
  // (l'hôte rappelle tick après un délai), false si on s'arrête (vote ou fin).
  tick() {
    if (this.phase !== 'replay') return false;
    if (this.cursor >= this.hand.actions.length) {
      this.phase = 'finished';
      return false;
    }
    if (this.hand.actions[this.cursor].vote) {
      this.phase = 'voting';
      this.voteAt = this.cursor;
      this.votes = new Map();
      this.results = null;
      return false;
    }
    this.cursor++;
    return true;
  }

  currentVote() {
    return this.voteAt === null ? null : this.hand.actions[this.voteAt].vote;
  }

  vote(clientId, option) {
    if (this.phase !== 'voting') return false;
    if (!Number.isInteger(option) || option < 0 || option >= this.currentVote().options.length) return false;
    this.votes.set(clientId, option);
    return true;
  }

  reveal() {
    if (this.phase !== 'voting') return;
    this.results = tally([...this.votes.values()], this.currentVote().options.length);
    this.phase = 'revealed';
  }

  next() {
    if (this.phase !== 'revealed') return;
    this.cursor = this.voteAt + 1;
    this.voteAt = null;
    this.votes = new Map();
    this.results = null;
    this.phase = 'replay';
  }

  // Message `state` envoyé à un participant.
  view(clientId) {
    const vote = this.currentVote();
    return {
      type: 'state',
      hand: publicHand(this.hand, this.cursor, this.phase === 'finished'),
      phase: this.phase,
      vote: vote ? { question: vote.question ?? '', options: [...vote.options] } : null,
      participants: this.participants.map((p) => ({ name: p.name, connected: p.connected })),
      voteCount: this.votes.size,
      voterCount: this.participants.filter((p) => p.connected).length,
      you: this.participants.find((p) => p.id === clientId)?.name ?? null,
      myVote: this.votes.has(clientId) ? this.votes.get(clientId) : null,
      results: this.phase === 'revealed' ? this.results : null,
    };
  }
}
```

- [ ] **Step 4 : Vérifier le succès**

Run: `npm test`
Expected: PASS — `# pass 42`, `# fail 0`

- [ ] **Step 5 : Commit**

```bash
git add js/session.js tests/session.test.js
git commit -m "feat: état de session (participants, phases, votes)"
```

---

### Task 7 : Squelette de la page (HTML, CSS, utilitaires DOM, routage)

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/dom.js`
- Create: `js/main.js`

- [ ] **Step 1 : Créer `index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Poker Hand Reviewer</title>
<link rel="stylesheet" href="css/style.css">
<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
<script type="module" src="js/main.js"></script>
</head>
<body>
<header class="topbar"><a href="#" class="brand"><span class="suit">♠</span> Hand Reviewer</a></header>
<main id="app" class="container"></main>
</body>
</html>
```

- [ ] **Step 2 : Créer `css/style.css`**

```css
:root {
  --felt-dark: #0a1f14;
  --felt-mid: #103a26;
  --felt-light: #1a5c3d;
  --gold: #d4af37;
  --gold-dim: #a8861e;
  --text: #e8e6df;
  --text-dim: #8a9a90;
  --panel: #0d2818;
  --border: #2d5a3f;
  --accent: #c9302c;
  --turn: #f39c12;
  --card: #fafaf7;
  --shadow: rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
[hidden] { display: none !important; }

body {
  background: radial-gradient(ellipse at top, var(--felt-mid) 0%, var(--felt-dark) 100%) fixed;
  background-color: var(--felt-dark);
  min-height: 100vh;
  overflow-x: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
}

.topbar { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.brand { color: var(--gold); font-weight: 600; font-size: 20px; text-decoration: none; }
.brand .suit { color: var(--accent); }
.container { max-width: 1000px; margin: 0 auto; padding: 16px; }
h2 { color: var(--gold); font-size: 20px; font-weight: 600; }
h3 { color: var(--gold); font-size: 17px; font-weight: 600; }

/* Blocs et formulaires */
.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn {
  appearance: none;
  border: 1px solid var(--gold-dim);
  background: transparent;
  color: var(--gold);
  padding: 8px 14px;
  border-radius: 6px;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: rgba(212, 175, 55, 0.12); }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn.primary { background: var(--gold); color: var(--felt-dark); font-weight: 600; }
.btn.primary:hover:not(:disabled) { background: #e2c25a; }
.btn.ghost { border-color: var(--border); color: var(--text); }
.btn.choice { min-width: 42px; }
.btn.choice.active { background: var(--gold); color: var(--felt-dark); }
.btn.action { min-width: 90px; background: var(--turn); border-color: var(--turn); color: #1b1b1b; font-weight: 600; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-dim); }
input[type="text"], input[type="number"], textarea {
  width: 100%;
  background: var(--felt-dark);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 8px;
  font: inherit;
  font-size: 15px;
}
.label { font-size: 13px; color: var(--text-dim); }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.error { color: #ff8a80; min-height: 1.2em; font-size: 14px; }
.info { color: var(--gold); font-size: 14px; }
.check { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.link { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 20px; line-height: 1; }

/* Éditeur : sièges */
.seats-form { display: flex; flex-direction: column; gap: 8px; }
.seat-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.seat-row.is-hero { border-color: var(--gold); }
.seat-row .pos { width: 52px; font-weight: 600; color: var(--gold); }
.seat-row input[type="text"] { flex: 1 1 120px; width: auto; }
.seat-row .stack { display: flex; align-items: center; gap: 4px; font-size: 13px; }
.seat-row .stack input { width: 80px; }
.hero-radio { display: flex; align-items: center; gap: 4px; font-size: 13px; }
.cards-btn {
  display: flex;
  gap: 2px;
  align-items: center;
  background: none;
  border: 1px dashed var(--border);
  color: var(--text-dim);
  border-radius: 6px;
  padding: 4px 8px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

/* Éditeur : actions */
.action-panel { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 12px; }
.action-buttons { display: flex; flex-wrap: wrap; gap: 8px; }
.vote-editor { display: flex; flex-direction: column; gap: 8px; }
.amount input { max-width: 160px; }
.log { padding-left: 22px; font-size: 13px; color: var(--text-dim); display: flex; flex-direction: column; gap: 2px; }
.tag { font-size: 11px; color: var(--felt-dark); background: var(--gold); border-radius: 8px; padding: 0 6px; }

/* Cartes */
.card {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 42px;
  background: var(--card);
  color: #111;
  border-radius: 4px;
  font-weight: 700;
  font-size: 15px;
  line-height: 1;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.card small { font-size: 14px; }
.card.red { color: #c62828; }
.card.back { background: repeating-linear-gradient(45deg, #7a1c1c 0 4px, #5a1010 4px 8px); border: 2px solid var(--card); }
.card.back.known { outline: 2px solid var(--gold); }
.card.slot { background: transparent; border: 1px dashed var(--border); box-shadow: none; }

/* Table */
.table-wrap { width: 100%; }
.table { position: relative; width: 100%; max-width: 900px; margin: 0 auto; aspect-ratio: 16 / 10; }
.felt {
  position: absolute;
  inset: 12% 10%;
  background: radial-gradient(ellipse, var(--felt-light), var(--felt-mid));
  border: 10px solid #3b2a1a;
  border-radius: 50%;
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.5), 0 8px 24px var(--shadow);
}
.center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.pot { font-size: 14px; font-weight: 600; color: var(--gold); }
.board { display: flex; gap: 4px; min-height: 42px; }
.seat {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 112px;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 6px;
  text-align: center;
  font-size: 12px;
}
.seat.hero { border-color: var(--gold); }
.seat.to-act { border-color: var(--turn); box-shadow: 0 0 0 2px var(--turn); }
.seat.folded { opacity: 0.45; }
.seat .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seat .seat-pos { color: var(--gold); margin-right: 4px; }
.seat .hole { display: flex; justify-content: center; gap: 2px; margin: 3px 0; min-height: 42px; }
.seat .stack-amt { color: var(--text-dim); }
.seat .last { min-height: 1.2em; font-size: 11px; color: var(--turn); }
.bet {
  position: absolute;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--gold-dim);
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 12px;
}

/* Sélecteur de cartes */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.7);
}
.modal {
  width: 100%;
  max-width: 560px;
  max-height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
}
.picker-slots { display: flex; gap: 6px; min-height: 42px; }
.picker-grid { display: grid; grid-template-columns: repeat(13, 1fr); gap: 3px; }
.pick { display: flex; justify-content: center; background: none; border: 2px solid transparent; border-radius: 5px; padding: 0; cursor: pointer; }
.pick .card { width: 100%; max-width: 34px; height: auto; aspect-ratio: 5 / 7; font-size: 13px; }
.pick .card small { font-size: 11px; }
.pick.selected { border-color: var(--turn); }
.pick:disabled { opacity: 0.2; cursor: default; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Vote */
.vote-panel { display: flex; flex-direction: column; gap: 10px; }
.vote-question { font-size: 16px; font-weight: 600; }
.vote-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.vote-option {
  position: relative;
  overflow: hidden;
  min-height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px;
  background: var(--felt-dark);
  border: 1px solid var(--gold-dim);
  border-radius: 8px;
  color: var(--text);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
.vote-option:disabled { cursor: default; }
.vote-option.mine { border-color: var(--turn); box-shadow: 0 0 0 2px var(--turn); }
.vote-fill { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(212, 175, 55, 0.28); }
.vote-label, .vote-pct { position: relative; }
.vote-pct { font-size: 13px; color: var(--gold); }
.vote-status { font-size: 13px; color: var(--text-dim); }

/* Session */
.share { display: flex; gap: 8px; }
.share input { flex: 1; min-width: 0; }
.participants { display: flex; flex-wrap: wrap; gap: 6px; font-size: 13px; }
.participants span { padding: 2px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); }
.participants .off { opacity: 0.4; text-decoration: line-through; }
.host-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.phase-info { font-size: 14px; color: var(--text-dim); }
.me { font-size: 13px; color: var(--text-dim); }
.banner { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; background: rgba(255, 255, 255, 0.06); font-size: 14px; }
.banner.error { background: rgba(201, 48, 44, 0.2); color: #ffb4ab; }
.name-form { display: flex; flex-wrap: wrap; gap: 8px; }
.name-form input { flex: 1 1 180px; width: auto; }

/* Accueil */
.home { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.home-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  text-decoration: none;
}
a.home-card:hover { border-color: var(--gold); }
.home-card form { display: flex; gap: 8px; }
.home-card input { min-width: 0; }

/* Mobile */
@media (max-width: 600px) {
  .table { aspect-ratio: 3 / 4; }
  .felt { inset: 10% 14%; border-width: 6px; }
  .seat { width: 76px; padding: 3px 4px; font-size: 11px; }
  .card { width: 24px; height: 34px; font-size: 12px; }
  .card small { font-size: 11px; }
  .seat .hole, .board { min-height: 34px; }
}
```

- [ ] **Step 3 : Créer `js/dom.js`**

```js
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// kind : 'localStorage' ou 'sessionStorage'. Le stockage peut être indisponible
// (navigation privée, données bloquées) : on ignore silencieusement.
export function storageGet(kind, key) {
  try {
    return window[kind].getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(kind, key, value) {
  try {
    window[kind].setItem(key, value);
  } catch {
    // stockage indisponible
  }
}

export function randomId(prefix = '') {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 4 : Créer `js/main.js`** (aucun écran branché pour l'instant ; les tâches 9, 11 et 12 les ajoutent)

```js
const root = document.getElementById('app');
const ROUTES = {};
let cleanup = null;

function show(name, arg) {
  const mount = ROUTES[name];
  if (!mount) {
    root.innerHTML = '<section class="panel"><p>Écran pas encore disponible.</p></section>';
    return;
  }
  cleanup = mount(root, arg) ?? null;
}

function renderHome() {
  root.innerHTML = `
    <section class="home">
      <a class="home-card" href="#edit">
        <h2>Créer une main</h2>
        <p>Saisis une main et ses points de vote, puis exporte-la en JSON.</p>
      </a>
      <a class="home-card" href="#host">
        <h2>Héberger une session</h2>
        <p>Importe une main, partage le lien et pilote le vote.</p>
      </a>
      <div class="home-card">
        <h2>Rejoindre</h2>
        <p>Ouvre le lien envoyé par l'hôte, ou colle-le ici.</p>
        <form data-join>
          <input type="text" name="link" placeholder="Lien de la session" aria-label="Lien de la session">
          <button class="btn primary">Rejoindre</button>
        </form>
      </div>
    </section>`;
  root.querySelector('[data-join]').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = String(new FormData(e.target).get('link') ?? '').trim();
    const id = value.match(/#join=(.+)$/)?.[1] ?? value;
    if (id) location.hash = `#join=${id}`;
  });
}

function route() {
  cleanup?.();
  cleanup = null;
  const hash = location.hash;
  if (hash.startsWith('#join=')) return show('voter', decodeURIComponent(hash.slice('#join='.length)));
  if (hash === '#edit') return show('editor');
  if (hash === '#host') return show('host');
  renderHome();
}

window.addEventListener('hashchange', route);
route();
```

- [ ] **Step 5 : Vérifier dans le navigateur**

Run: `npx --yes serve -l 5173`
Ouvrir `http://localhost:5173` :
- Expected : en-tête « ♠ Hand Reviewer », trois cartes « Créer une main », « Héberger une session », « Rejoindre » sur fond vert.
- Cliquer « Créer une main » → l'URL devient `#edit` et le texte « Écran pas encore disponible. » s'affiche. Cliquer sur le logo → retour à l'accueil.
- Console du navigateur : aucune erreur ; `typeof Peer` renvoie `"function"`.
- Largeur 375 px (outils de dev, mode mobile) : les cartes d'accueil s'empilent, pas de défilement horizontal.

- [ ] **Step 6 : Vérifier que les tests passent toujours**

Run: `npm test`
Expected: PASS — `# pass 42`

- [ ] **Step 7 : Commit**

```bash
git add index.html css/style.css js/dom.js js/main.js
git commit -m "feat: squelette de page, thème et routage"
```

---

### Task 8 : Rendu de la table et sélecteur de cartes

`renderTable(container, { hand, state, hideVillainCards })` dessine la table : le Hero toujours en bas, les autres sièges dans le sens horaire (ordre de parole), mises devant les joueurs, pot total au centre, board selon la street. Avec `hideVillainCards` (éditeur), les cartes vilains saisies sont montrées de dos avec un liseré doré. `pickCards({ count, used, title })` renvoie une promesse résolue avec les cartes choisies ou `null`.

**Files:**
- Create: `js/table-view.js`
- Create: `js/card-picker.js`

- [ ] **Step 1 : Créer `js/table-view.js`**

```js
import { totalPot } from './engine.js';
import { parseCards } from './cards.js';
import { esc } from './dom.js';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
const ACTION_LABELS = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
const fmt = (x) => String(Math.round(x * 100) / 100);

export function cardHtml(card) {
  const red = card[1] === 'h' || card[1] === 'd';
  const rank = card[0] === 'T' ? '10' : card[0];
  return `<span class="card${red ? ' red' : ''}">${rank}<small>${SUIT_SYMBOLS[card[1]]}</small></span>`;
}

function backHtml(known) {
  return `<span class="card back${known ? ' known' : ''}"></span>`;
}

function holeCards(seat, st, hideVillainCards) {
  if (st.folded) return '';
  const cards = parseCards(seat.cards);
  if (cards.length && (seat.hero || !hideVillainCards)) return cards.map(cardHtml).join('');
  return backHtml(cards.length > 0) + backHtml(cards.length > 0);
}

function boardCards(board, streetIndex) {
  const cards = [];
  if (streetIndex >= 1) cards.push(...parseCards(board?.flop));
  if (streetIndex >= 2) cards.push(...parseCards(board?.turn));
  if (streetIndex >= 3) cards.push(...parseCards(board?.river));
  return cards.map(cardHtml).join('');
}

function lastActionLabel(action) {
  if (!action || action.type === 'post') return '';
  const label = ACTION_LABELS[action.type];
  return ['bet', 'raise', 'allin'].includes(action.type) ? `${label} ${fmt(action.amount)}` : label;
}

// Dessine la table. Le Hero est toujours en bas, les autres sièges
// dans le sens des aiguilles d'une montre.
// hideVillainCards : true dans l'éditeur (cartes saisies montrées de dos).
export function renderTable(container, { hand, state, hideVillainCards = false }) {
  const seats = hand.setup.seats;
  const n = seats.length;
  const heroIdx = Math.max(0, seats.findIndex((s) => s.hero));
  const parts = seats.map((seat, i) => {
    const st = state.seats[i];
    const angle = Math.PI / 2 + ((i - heroIdx) * 2 * Math.PI) / n;
    const at = (rx, ry) => `left:${50 + rx * Math.cos(angle)}%;top:${50 + ry * Math.sin(angle)}%`;
    const classes = ['seat', seat.hero && 'hero', st.folded && 'folded', state.toAct === i && 'to-act'].filter(Boolean).join(' ');
    const bet = st.bet > 0 ? `<div class="bet" style="${at(24, 24)}">${fmt(st.bet)}</div>` : '';
    return `
      <div class="${classes}" style="${at(38, 41)}">
        <div class="name"><span class="seat-pos">${seat.position}</span>${esc(seat.name)}</div>
        <div class="hole">${holeCards(seat, st, hideVillainCards)}</div>
        <div class="stack-amt">${fmt(st.stack)} BB</div>
        <div class="last">${lastActionLabel(st.lastAction)}</div>
      </div>${bet}`;
  }).join('');
  container.innerHTML = `
    <div class="table">
      <div class="felt"></div>
      <div class="center">
        <div class="pot">Pot ${fmt(totalPot(state))} BB</div>
        <div class="board">${boardCards(hand.board, state.streetIndex)}</div>
      </div>
      ${parts}
    </div>`;
}
```

- [ ] **Step 2 : Créer `js/card-picker.js`**

```js
import { RANKS, SUITS } from './cards.js';
import { cardHtml } from './table-view.js';
import { esc } from './dom.js';

// Ouvre une modale de choix de `count` cartes. Résout avec la liste des cartes
// choisies, ou null si l'utilisateur annule. Les cartes de `used` sont grisées.
export function pickCards({ count, used = new Set(), title = 'Choisir des cartes' }) {
  return new Promise((resolve) => {
    const selected = [];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const grid = [...SUITS].map((suit) => [...RANKS].map((rank) => {
      const card = rank + suit;
      return `<button type="button" class="pick" data-card="${card}" ${used.has(card) ? 'disabled' : ''}>${cardHtml(card)}</button>`;
    }).join('')).join('');
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3>
        <div class="picker-slots" data-slots></div>
        <div class="picker-grid">${grid}</div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-cancel>Annuler</button>
          <button type="button" class="btn primary" data-ok disabled>Valider</button>
        </div>
      </div>`;

    const refresh = () => {
      const slots = selected.map(cardHtml);
      while (slots.length < count) slots.push('<span class="card slot"></span>');
      overlay.querySelector('[data-slots]').innerHTML = slots.join('');
      overlay.querySelectorAll('[data-card]').forEach((b) => b.classList.toggle('selected', selected.includes(b.dataset.card)));
      overlay.querySelector('[data-ok]').disabled = selected.length !== count;
    };
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };

    overlay.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-card]');
      if (pick) {
        const card = pick.dataset.card;
        const i = selected.indexOf(card);
        if (i >= 0) selected.splice(i, 1);
        else if (selected.length < count) selected.push(card);
        refresh();
      } else if (e.target.closest('[data-cancel]')) {
        close(null);
      } else if (e.target.closest('[data-ok]') && selected.length === count) {
        close([...selected]);
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    refresh();
  });
}
```

- [ ] **Step 3 : Vérifier dans le navigateur**

Avec `npx --yes serve -l 5173` lancé, ouvrir `http://localhost:5173` puis dans la console :

```js
const { renderTable } = await import('./js/table-view.js');
const { computeState } = await import('./js/engine.js');
const { pickCards } = await import('./js/card-picker.js');
const hand = {
  setup: { players: 3, seats: [
    { name: 'Hero', position: 'BTN', stack: 15, cards: 'AhJd', hero: true },
    { name: 'Vilain 1', position: 'SB', stack: 22, cards: null },
    { name: 'Vilain 2', position: 'BB', stack: 13, cards: 'QsQc' } ] },
  board: { flop: 'Kc7h2s', turn: '9d', river: '4c' },
  actions: [],
};
renderTable(document.getElementById('app'), { hand, state: computeState(hand.setup, [{ seat: 0, type: 'raise', amount: 2 }]), hideVillainCards: true });
```

Expected :
- Hero (BTN) en bas avec A♥ J♦ visibles et « Raise 2 » en orange ; mise « 2 » devant lui.
- SB surlignée en orange (c'est à elle de parler), mise 0.5 ; BB mise 1.
- Vilain 2 : deux dos de cartes avec liseré doré ; Vilain 1 : dos sans liseré.
- Centre : « Pot 3.5 BB », pas de board.

Puis :

```js
await pickCards({ count: 2, used: new Set(['Ah', 'Jd']), title: 'Test' });
```

Expected : modale avec 4 lignes de 13 cartes, A♥ et J♦ grisés et non cliquables ; « Valider » actif seulement après 2 cartes choisies ; recliquer une carte la désélectionne ; « Valider » résout la promesse avec par exemple `['Kc', '7h']`, « Annuler » ou Échap avec `null`. En largeur 375 px, la grille tient sans défilement horizontal.

- [ ] **Step 4 : Commit**

```bash
git add js/table-view.js js/card-picker.js
git commit -m "feat: rendu de la table et sélecteur de cartes"
```

---

### Task 9 : Éditeur de main

Deux étapes : **Setup** (titre, nombre de joueurs, nom, stack, Hero, cartes) puis **Actions** (la table, boutons des seules actions légales, montant pour Bet/Raise, case « Faire voter ici » avec options pré-remplies, annulation, export). Le board est demandé via le sélecteur dès qu'une street est atteinte ; annuler le sélecteur annule l'action. Le brouillon est sauvegardé dans `localStorage` (`reviewer.draft`).

**Files:**
- Create: `js/editor.js`
- Modify: `js/main.js` (brancher l'écran éditeur)

- [ ] **Step 1 : Créer `js/editor.js`**

```js
import { positionsFor, MIN_PLAYERS, MAX_PLAYERS } from './positions.js';
import { parseCards, usedCards } from './cards.js';
import { computeState, legalActions, requiredBoard } from './engine.js';
import { validateHand, parseHand, serializeHand, fileNameFor, VOTE_MIN_OPTIONS, VOTE_MAX_OPTIONS } from './hand-format.js';
import { renderTable, cardHtml } from './table-view.js';
import { pickCards } from './card-picker.js';
import { esc, storageGet, storageSet, downloadText } from './dom.js';

const DRAFT_KEY = 'reviewer.draft';
const BOARD_STREETS = [['flop', 3, 'Flop'], ['turn', 1, 'Turn'], ['river', 1, 'River']];
const ACTION_NAMES = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };

const emptyBoard = () => ({ flop: null, turn: null, river: null });

function makeSeats(players, previous) {
  const seats = positionsFor(players).map((position, i) => {
    const prev = previous[i];
    return {
      name: prev?.name ?? (i === 0 ? 'Hero' : `Vilain ${i}`),
      position,
      stack: prev?.stack ?? 15,
      cards: prev?.cards ?? null,
      hero: prev?.hero ?? false,
    };
  });
  if (!seats.some((s) => s.hero)) seats[0].hero = true;
  return seats;
}

function emptyHand(players = 3) {
  return { version: 1, title: '', setup: { players, seats: makeSeats(players, []) }, board: emptyBoard(), actions: [] };
}

function loadDraft() {
  try {
    const draft = JSON.parse(storageGet('localStorage', DRAFT_KEY));
    if (Array.isArray(draft?.hand?.setup?.seats) && Array.isArray(draft.hand.actions)) return draft;
  } catch {
    // brouillon illisible : on repart de zéro
  }
  return null;
}

function setupProblem(setup) {
  for (const [i, seat] of setup.seats.entries()) {
    if (!seat.name.trim()) return `Siège ${i + 1} : nom manquant.`;
    if (!(seat.stack > 0)) return `Siège ${i + 1} : stack invalide.`;
  }
  if (!setup.seats.find((s) => s.hero)?.cards) return 'Choisis les cartes du Hero.';
  return null;
}

function defaultOptions(legal) {
  return legal.map((l) => (l.type === 'call' ? `Call ${l.amount}` : ACTION_NAMES[l.type]));
}

function actionButtonLabel(l) {
  if (l.type === 'call') return `Call ${l.amount}`;
  if (l.type === 'allin') return `All-in ${l.amount}`;
  return ACTION_NAMES[l.type];
}

export function mountEditor(root) {
  let { hand, step } = loadDraft() ?? { hand: emptyHand(), step: 'setup' };
  render();
  return () => {};

  function save() {
    storageSet('localStorage', DRAFT_KEY, JSON.stringify({ hand, step }));
  }

  function render() {
    save();
    if (step === 'setup') renderSetup();
    else renderActions();
  }

  function showError(message) {
    root.querySelector('[data-error]').textContent = message;
  }

  function renderSetup() {
    const seatRows = hand.setup.seats.map((s, i) => `
      <div class="seat-row${s.hero ? ' is-hero' : ''}">
        <span class="pos">${s.position}</span>
        <input type="text" data-name="${i}" value="${esc(s.name)}" maxlength="20" aria-label="Nom du siège ${i + 1}">
        <label class="stack"><input type="number" data-stack="${i}" value="${s.stack}" min="0.5" step="0.5" aria-label="Stack du siège ${i + 1}"> BB</label>
        <label class="hero-radio"><input type="radio" name="hero" data-hero="${i}" ${s.hero ? 'checked' : ''}> Hero</label>
        <button type="button" class="cards-btn" data-cards="${i}">${s.cards ? parseCards(s.cards).map(cardHtml).join('') : (s.hero ? 'Cartes ?' : 'Cartes (option)')}</button>
        ${s.cards ? `<button type="button" class="link" data-clear-cards="${i}" aria-label="Retirer les cartes">×</button>` : ''}
      </div>`).join('');
    const counts = [];
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      counts.push(`<button type="button" class="btn choice${n === hand.setup.players ? ' active' : ''}" data-players="${n}">${n}</button>`);
    }
    root.innerHTML = `
      <section class="panel">
        <div class="toolbar">
          <h2>Créer une main</h2>
          <div class="toolbar-actions">
            <label class="btn ghost">Importer JSON<input type="file" accept=".json,application/json" data-import hidden></label>
            <button type="button" class="btn ghost" data-reset>Nouvelle main</button>
          </div>
        </div>
        <label class="field">Titre<input type="text" data-title maxlength="80" value="${esc(hand.title)}" placeholder="ex. BTN open 15bb, BB jam"></label>
        <p class="label">Joueurs à la table</p>
        <div class="choices">${counts.join('')}</div>
        <p class="label">Sièges (stacks en BB, blinds 0,5 / 1)</p>
        <div class="seats-form">${seatRows}</div>
        <p class="error" data-error></p>
        <div><button type="button" class="btn primary" data-start>Saisir les actions →</button></div>
      </section>`;

    root.querySelector('[data-title]').addEventListener('input', (e) => { hand.title = e.target.value; save(); });
    root.querySelectorAll('[data-players]').forEach((btn) => btn.addEventListener('click', () => {
      const players = Number(btn.dataset.players);
      hand.setup = { players, seats: makeSeats(players, hand.setup.seats) };
      render();
    }));
    root.querySelectorAll('[data-name]').forEach((input) => input.addEventListener('input', () => {
      hand.setup.seats[Number(input.dataset.name)].name = input.value;
      save();
    }));
    root.querySelectorAll('[data-stack]').forEach((input) => input.addEventListener('input', () => {
      hand.setup.seats[Number(input.dataset.stack)].stack = Number(input.value);
      save();
    }));
    root.querySelectorAll('[data-hero]').forEach((radio) => radio.addEventListener('change', () => {
      hand.setup.seats.forEach((s, i) => { s.hero = i === Number(radio.dataset.hero); });
      render();
    }));
    root.querySelectorAll('[data-cards]').forEach((btn) => btn.addEventListener('click', async () => {
      const seat = hand.setup.seats[Number(btn.dataset.cards)];
      const used = usedCards(hand);
      for (const card of parseCards(seat.cards)) used.delete(card);
      const cards = await pickCards({ count: 2, used, title: `Cartes de ${seat.name}` });
      if (cards) {
        seat.cards = cards.join('');
        render();
      }
    }));
    root.querySelectorAll('[data-clear-cards]').forEach((btn) => btn.addEventListener('click', () => {
      hand.setup.seats[Number(btn.dataset.clearCards)].cards = null;
      render();
    }));
    root.querySelector('[data-start]').addEventListener('click', () => {
      const problem = setupProblem(hand.setup);
      if (problem) return showError(problem);
      step = 'actions';
      render();
    });
    root.querySelector('[data-import]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const result = parseHand(await file.text());
      if (result.error) return showError(result.error);
      hand = result.hand;
      step = 'actions';
      render();
    });
    root.querySelector('[data-reset]').addEventListener('click', () => {
      if (!confirm('Effacer la main en cours ?')) return;
      hand = emptyHand();
      step = 'setup';
      render();
    });
  }

  function renderActions() {
    let state;
    try {
      state = computeState(hand.setup, hand.actions);
    } catch {
      hand.actions = [];
      hand.board = emptyBoard();
      state = computeState(hand.setup, []);
    }
    const legal = legalActions(state);
    root.innerHTML = `
      <section class="panel">
        <div class="toolbar">
          <h2>${esc(hand.title || 'Main sans titre')}</h2>
          <div class="toolbar-actions">
            <button type="button" class="btn ghost" data-back>← Setup</button>
            <button type="button" class="btn ghost" data-undo ${hand.actions.length ? '' : 'disabled'}>Annuler la dernière action</button>
            <button type="button" class="btn" data-export>Exporter JSON</button>
          </div>
        </div>
        <div class="table-wrap" data-table></div>
        <p class="error" data-error></p>
        ${state.handOver ? '<p class="info">Main terminée. Exporte le JSON pour l\'envoyer à l\'hôte.</p>' : actionPanel(hand.setup.seats[state.toAct], legal)}
        ${actionLog()}
      </section>`;
    renderTable(root.querySelector('[data-table]'), { hand, state, hideVillainCards: true });

    root.querySelector('[data-back]').addEventListener('click', () => {
      if (hand.actions.length && !confirm('Revenir au setup efface les actions et le board. Continuer ?')) return;
      hand.actions = [];
      hand.board = emptyBoard();
      step = 'setup';
      render();
    });
    root.querySelector('[data-undo]').addEventListener('click', () => {
      hand.actions.pop();
      pruneBoard();
      render();
    });
    root.querySelector('[data-export]').addEventListener('click', () => {
      const error = validateHand(hand);
      if (error) return showError(error);
      downloadText(fileNameFor(hand), serializeHand(hand));
    });
    const toggle = root.querySelector('[data-vote-toggle]');
    toggle?.addEventListener('change', () => { root.querySelector('[data-vote-editor]').hidden = !toggle.checked; });
    root.querySelectorAll('[data-action]').forEach((btn) => btn.addEventListener('click', () => play(btn.dataset.action)));
  }

  function actionPanel(seat, legal) {
    const sized = legal.find((l) => l.type === 'bet' || l.type === 'raise');
    return `
      <div class="action-panel">
        <p>À <b>${esc(seat.name)}</b> (${seat.position}) de parler</p>
        <label class="check"><input type="checkbox" data-vote-toggle> Faire voter ici</label>
        <div class="vote-editor" data-vote-editor hidden>
          <label class="field">Question (facultative)<input type="text" data-vote-question maxlength="120" placeholder="Que fais-tu ?"></label>
          <label class="field">Options, une par ligne (${VOTE_MIN_OPTIONS} à ${VOTE_MAX_OPTIONS})<textarea data-vote-options rows="4">${esc(defaultOptions(legal).join('\n'))}</textarea></label>
        </div>
        ${sized ? `<label class="field amount">Montant total sur la street (${sized.min} à ${sized.max} BB)<input type="number" data-amount min="${sized.min}" max="${sized.max}" step="0.5" value="${sized.min}"></label>` : ''}
        <div class="action-buttons">${legal.map((l) => `<button type="button" class="btn action" data-action="${l.type}">${actionButtonLabel(l)}</button>`).join('')}</div>
      </div>`;
  }

  function actionLog() {
    if (!hand.actions.length) return '';
    const items = hand.actions.map((a) => {
      const seat = hand.setup.seats[a.seat];
      const amount = a.amount !== undefined ? ` ${a.amount}` : '';
      return `<li>${seat.position} ${esc(seat.name)} : ${ACTION_NAMES[a.type]}${amount}${a.vote ? ' <span class="tag">vote</span>' : ''}</li>`;
    }).join('');
    return `<ol class="log">${items}</ol>`;
  }

  async function play(type) {
    const state = computeState(hand.setup, hand.actions);
    const action = { seat: state.toAct, type };
    if (type === 'bet' || type === 'raise') action.amount = Number(root.querySelector('[data-amount]').value);
    if (root.querySelector('[data-vote-toggle]').checked) {
      const options = root.querySelector('[data-vote-options]').value.split('\n').map((o) => o.trim()).filter(Boolean);
      if (options.length < VOTE_MIN_OPTIONS || options.length > VOTE_MAX_OPTIONS) {
        return showError(`Le vote doit avoir entre ${VOTE_MIN_OPTIONS} et ${VOTE_MAX_OPTIONS} options.`);
      }
      action.vote = { question: root.querySelector('[data-vote-question]').value.trim(), options };
    }
    let next;
    try {
      next = computeState(hand.setup, [...hand.actions, action]);
    } catch (e) {
      return showError(e.message.replace(/^Action \d+ : /, ''));
    }
    hand.actions.push(action);
    if (!(await fillBoard(next))) {
      hand.actions.pop();
      pruneBoard();
    }
    render();
  }

  // Demande les cartes des streets nouvellement atteintes. false si annulé.
  async function fillBoard(state) {
    const required = requiredBoard(state);
    for (const [street, count, label] of BOARD_STREETS) {
      if (!required[street] || hand.board[street]) continue;
      const cards = await pickCards({ count, used: usedCards(hand), title: `Cartes du ${label}` });
      if (!cards) return false;
      hand.board[street] = cards.join('');
    }
    return true;
  }

  function pruneBoard() {
    const required = requiredBoard(computeState(hand.setup, hand.actions));
    for (const [street] of BOARD_STREETS) if (!required[street]) hand.board[street] = null;
  }
}
```

- [ ] **Step 2 : Brancher l'éditeur dans `js/main.js`**

Remplacer :

```js
const root = document.getElementById('app');
const ROUTES = {};
```

par :

```js
import { mountEditor } from './editor.js';

const root = document.getElementById('app');
const ROUTES = { editor: mountEditor };
```

- [ ] **Step 3 : Vérifier dans le navigateur (scénario de la spec)**

`npx --yes serve -l 5173`, ouvrir `http://localhost:5173/#edit` :
1. Setup : titre « BTN open 15bb, BB jam », 3 joueurs. Siège BTN « Hero », 15, Hero coché, cartes A♥ J♦. SB « Vilain 1 », 22. BB « Vilain 2 », 13, cartes Q♠ Q♣. Dans le sélecteur des cartes de Vilain 2, A♥ et J♦ sont grisés.
2. « Saisir les actions → » : la table s'affiche, BTN surligné, boutons `Fold`, `Call 1`, `Raise`, `All-in 15`, champ montant 2 à 15.
3. Cocher « Faire voter ici » : options pré-remplies `Fold / Call 1 / Raise / All-in`. Les remplacer par `Fold`, `Limp`, `Raise 2bb`, `All-in`, question « Que fais-tu ? ». Montant 2 → `Raise`.
4. SB : `Fold`. BB : `All-in 13`. BTN : seulement `Fold` et `Call 11` ; cocher le vote avec `Fold` / `Call` puis `Call 11`.
5. Le sélecteur demande le Flop (K♣ 7♥ 2♠), puis le Turn (9♦), puis la River (4♣). Message « Main terminée ».
6. « Exporter JSON » télécharge `btn-open-15bb-bb-jam.json`, identique (à l'ordre près des clés) à `tests/fixtures.js`.
7. « Annuler la dernière action » → le board redevient vide, BTN doit de nouveau parler. Recommencer `Call 11` puis « Annuler » dans le sélecteur du Flop → l'action n'est pas ajoutée.
8. Recharger la page → le brouillon est restauré. « ← Setup » demande confirmation et vide les actions.
9. « Importer JSON » avec le fichier exporté → retour à l'étape Actions, main complète.
10. Erreurs : sans cartes Hero, « Saisir les actions » affiche « Choisis les cartes du Hero. » ; un vote avec une seule option affiche « Le vote doit avoir entre 2 et 6 options. » ; un raise sous le minimum affiche « Montant invalide… ».

- [ ] **Step 4 : Vérifier les tests**

Run: `npm test`
Expected: PASS — `# pass 42`

- [ ] **Step 5 : Commit**

```bash
git add js/editor.js js/main.js
git commit -m "feat: éditeur de main (setup, actions, points de vote, export JSON)"
```

---

### Task 10 : Couche réseau et panneau de vote

`openHost({ onMessage, onClose, onError })` → `Promise<{ id, close }>`. `joinHost(hostId, { hello, onMessage, onStatus })` → `{ send, close }` ; `onStatus` reçoit `{ kind: 'connected' | 'reconnecting' | 'ended' | 'error' | 'closed', message?, attempt? }`. Le votant renvoie `hello()` (message `join`) à chaque (re)connexion, retente 5 fois toutes les 2 s, et s'arrête sur un message `{ type: 'bye' }` de l'hôte.

`renderVotePanel(container, { vote, phase, myVote, results, voteCount, voterCount, onVote })` affiche les options en gros boutons ; après révélation, barre de remplissage et « 42 % (3) » sur chaque option.

**Files:**
- Create: `js/net.js`
- Create: `js/vote-view.js`

- [ ] **Step 1 : Créer `js/net.js`**

```js
import { randomId } from './dom.js';

// Couche mince autour de PeerJS (chargé en global par index.html).
export const MAX_ATTEMPTS = 5;
const RETRY_MS = 2000;
const PEER_OPTIONS = { debug: 0 };
const PEER_MISSING = 'Bibliothèque PeerJS non chargée. Vérifie ta connexion internet.';

function describeError(err) {
  switch (err?.type) {
    case 'peer-unavailable':
      return "Session introuvable : le lien est invalide ou l'hôte est parti.";
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Serveur de connexion injoignable. Vérifie ta connexion puis réessaie.';
    case 'browser-incompatible':
      return 'Ce navigateur ne prend pas en charge WebRTC.';
    default:
      return `Erreur de connexion (${err?.type ?? 'inconnue'}).`;
  }
}

// Côté hôte. Résout avec { id, close } une fois enregistré auprès du serveur PeerJS.
export function openHost({ onMessage, onClose, onError }) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error(PEER_MISSING));
    const peer = new Peer(randomId('pkr-'), PEER_OPTIONS);
    let opened = false;
    peer.on('open', (id) => {
      opened = true;
      resolve({ id, close: () => peer.destroy() });
    });
    peer.on('connection', (conn) => {
      conn.on('data', (msg) => onMessage(conn, msg));
      conn.on('close', () => onClose(conn));
      conn.on('error', () => onClose(conn));
    });
    peer.on('disconnected', () => {
      // Perte du serveur de signalisation : les connexions existantes continuent.
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      const message = describeError(err);
      if (!opened) {
        peer.destroy();
        reject(new Error(message));
      } else {
        onError(message);
      }
    });
  });
}

// Côté votant. hello() donne le message `join` envoyé à chaque (re)connexion.
// onStatus reçoit { kind: 'connected' | 'reconnecting' | 'ended' | 'error' | 'closed', ... }.
export function joinHost(hostId, { hello, onMessage, onStatus }) {
  if (typeof Peer === 'undefined') {
    queueMicrotask(() => onStatus({ kind: 'error', message: PEER_MISSING }));
    return { send() {}, close() {} };
  }
  const peer = new Peer(undefined, PEER_OPTIONS);
  let conn = null;
  let attempts = 0;
  let everConnected = false;
  let stopped = false;

  const stop = (status) => {
    if (stopped) return;
    stopped = true;
    onStatus(status);
    peer.destroy();
  };
  const scheduleRetry = () => {
    if (stopped) return;
    attempts++;
    if (attempts > MAX_ATTEMPTS) return stop({ kind: 'ended', message: 'Session terminée : hôte déconnecté.' });
    onStatus({ kind: 'reconnecting', attempt: attempts });
    setTimeout(connect, RETRY_MS);
  };
  function connect() {
    if (stopped) return;
    const c = peer.connect(hostId, { reliable: true });
    conn = c;
    let lost = false;
    const onLost = () => {
      if (lost || c !== conn) return;
      lost = true;
      scheduleRetry();
    };
    c.on('open', () => {
      everConnected = true;
      attempts = 0;
      onStatus({ kind: 'connected' });
      c.send(hello());
    });
    c.on('data', (msg) => {
      if (msg?.type === 'bye') return stop({ kind: 'ended', message: "Session terminée par l'hôte." });
      onMessage(msg);
    });
    c.on('close', onLost);
    c.on('error', onLost);
  }

  peer.on('open', connect);
  peer.on('disconnected', () => {
    if (!stopped && !peer.destroyed) peer.reconnect();
  });
  peer.on('error', (err) => {
    if (stopped) return;
    if (err.type === 'peer-unavailable' && everConnected) {
      conn = null;
      return scheduleRetry();
    }
    stop({ kind: 'error', message: describeError(err) });
  });

  return {
    send: (msg) => { if (conn?.open) conn.send(msg); },
    close: () => stop({ kind: 'closed' }),
  };
}
```

- [ ] **Step 2 : Créer `js/vote-view.js`**

```js
import { esc } from './dom.js';

// Panneau de vote commun à l'hôte et aux votants.
// `view` est le message `state` de la session (voir session.js).
export function renderVotePanel(container, { vote, phase, myVote, results, voteCount, voterCount, onVote }) {
  if (!vote || (phase !== 'voting' && phase !== 'revealed')) {
    container.innerHTML = '';
    return;
  }
  const revealed = phase === 'revealed';
  const options = vote.options.map((option, i) => {
    const pct = revealed ? results.percents[i] : 0;
    return `
      <button type="button" class="vote-option${myVote === i ? ' mine' : ''}" data-option="${i}" ${revealed ? 'disabled' : ''}>
        ${revealed ? `<span class="vote-fill" style="width:${pct}%"></span>` : ''}
        <span class="vote-label">${esc(option)}</span>
        ${revealed ? `<span class="vote-pct">${pct} % (${results.counts[i]})</span>` : ''}
      </button>`;
  }).join('');
  let status;
  if (revealed) status = `${results.total} vote${results.total > 1 ? 's' : ''}`;
  else if (myVote === null) status = `Choisis une option · ${voteCount}/${voterCount} ont voté`;
  else status = `Vote enregistré, modifiable jusqu'à la révélation · ${voteCount}/${voterCount} ont voté`;

  container.innerHTML = `
    <div class="vote-panel">
      ${vote.question ? `<p class="vote-question">${esc(vote.question)}</p>` : ''}
      <div class="vote-options">${options}</div>
      <p class="vote-status">${status}</p>
    </div>`;
  if (!revealed) {
    container.querySelectorAll('[data-option]').forEach((button) => {
      button.addEventListener('click', () => onVote(Number(button.dataset.option)));
    });
  }
}
```

- [ ] **Step 3 : Vérifier le panneau de vote dans le navigateur**

Console sur `http://localhost:5173` :

```js
const { renderVotePanel } = await import('./js/vote-view.js');
const app = document.getElementById('app');
const vote = { question: 'Que fais-tu ?', options: ['Fold', 'Call', 'All-in'] };
renderVotePanel(app, { vote, phase: 'voting', myVote: 1, results: null, voteCount: 2, voterCount: 4, onVote: (i) => console.log('vote', i) });
```

Expected : question + 3 boutons, « Call » surligné en orange, « Vote enregistré, modifiable jusqu'à la révélation · 2/4 ont voté » ; un clic sur « Fold » affiche `vote 0` dans la console.

```js
renderVotePanel(app, { vote, phase: 'revealed', myVote: 1, results: { counts: [1, 2, 0], percents: [33, 67, 0], total: 3 }, voteCount: 3, voterCount: 4, onVote: () => {} });
```

Expected : boutons désactivés, barres dorées à 33 % / 67 % / 0 %, libellés « 33 % (1) », « 67 % (2) », « 0 % (0) », « Call » toujours surligné, « 3 votes ».

- [ ] **Step 4 : Vérifier PeerJS en isolation**

Console : `const { openHost } = await import('./js/net.js'); const h = await openHost({ onMessage: console.log, onClose: console.log, onError: console.error }); h.id`
Expected : un identifiant `pkr-xxxxxxxxxx` en quelques secondes. Puis `h.close()`.

- [ ] **Step 5 : Commit**

```bash
git add js/net.js js/vote-view.js
git commit -m "feat: couche PeerJS et panneau de vote"
```

---

### Task 11 : Écran hôte

L'hôte importe le JSON, choisit son pseudo, ouvre la session (lien `#join=<id>` + bouton Copier), voit les participants et pilote : **Démarrer** → replay automatique (700 ms par action) jusqu'au point de vote → compteur « x/y ont voté » + **Révéler** → **Suivant** (joue l'action réelle et continue). Il vote comme les autres (identifiant `host`). Après chaque changement, il renvoie l'état complet à chaque votant (`session.view(id)`). En quittant : message `bye` aux votants (`pagehide` ou changement d'écran) et avertissement du navigateur (`beforeunload`).

**Files:**
- Create: `js/host.js`
- Modify: `js/main.js` (brancher l'écran hôte)

- [ ] **Step 1 : Créer `js/host.js`**

```js
import { parseHand } from './hand-format.js';
import { computeState } from './engine.js';
import { Session } from './session.js';
import { openHost } from './net.js';
import { renderTable } from './table-view.js';
import { renderVotePanel } from './vote-view.js';
import { esc, storageGet, storageSet } from './dom.js';

const REPLAY_DELAY_MS = 700;
const HOST_ID = 'host';
const NAME_KEY = 'reviewer.name';

export function mountHost(root) {
  let hand = null;
  let session = null;
  let link = '';
  let banner = '';
  let closePeer = null;
  let timer = null;
  let hostName = storageGet('localStorage', NAME_KEY) ?? '';
  const connsById = new Map();
  const idsByConn = new Map();

  const sayBye = () => {
    for (const conn of connsById.values()) if (conn.open) conn.send({ type: 'bye' });
  };
  const onBeforeUnload = (e) => {
    if (!session) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', sayBye);

  renderSetup();

  return () => {
    clearTimeout(timer);
    sayBye();
    closePeer?.();
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pagehide', sayBye);
  };

  function renderSetup(error = '') {
    const voteCount = hand ? hand.actions.filter((a) => a.vote).length : 0;
    root.innerHTML = `
      <section class="panel">
        <h2>Héberger une session</h2>
        <label class="field">Fichier de la main (.json)<input type="file" accept=".json,application/json" data-file></label>
        <p class="info">${hand ? `Main chargée : <b>${esc(hand.title || 'sans titre')}</b> (${hand.setup.players} joueurs, ${voteCount} point(s) de vote)` : ''}</p>
        <label class="field">Ton pseudo<input type="text" data-name maxlength="24" value="${esc(hostName)}"></label>
        <p class="error">${esc(error)}</p>
        <div><button type="button" class="btn primary" data-open ${hand ? '' : 'disabled'}>Ouvrir la session</button></div>
      </section>`;
    root.querySelector('[data-file]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const result = parseHand(await file.text());
      hand = result.hand;
      renderSetup(result.error ?? '');
    });
    root.querySelector('[data-name]').addEventListener('input', (e) => { hostName = e.target.value; });
    root.querySelector('[data-open]').addEventListener('click', openSession);
  }

  async function openSession() {
    const name = hostName.trim();
    if (!name) return renderSetup('Choisis un pseudo.');
    storageSet('localStorage', NAME_KEY, name);
    const button = root.querySelector('[data-open]');
    button.disabled = true;
    button.textContent = 'Connexion…';
    try {
      const host = await openHost({ onMessage, onClose, onError: (message) => { banner = message; renderSession(); } });
      closePeer = host.close;
      link = `${location.origin}${location.pathname}#join=${encodeURIComponent(host.id)}`;
      session = new Session(hand);
      session.join(HOST_ID, name);
      renderSession();
    } catch (e) {
      renderSetup(`${e.message} Réessaie.`);
    }
  }

  function onMessage(conn, msg) {
    if (msg?.type === 'join' && typeof msg.clientId === 'string' && msg.clientId.startsWith('c-') && typeof msg.name === 'string') {
      const p = session.join(msg.clientId, msg.name);
      connsById.set(p.id, conn);
      idsByConn.set(conn, p.id);
      update();
    } else if (msg?.type === 'vote') {
      const id = idsByConn.get(conn);
      if (id && session.vote(id, msg.option)) update();
    }
  }

  function onClose(conn) {
    const id = idsByConn.get(conn);
    idsByConn.delete(conn);
    if (id && connsById.get(id) === conn) {
      connsById.delete(id);
      session.leave(id);
      update();
    }
  }

  function update() {
    for (const [id, conn] of connsById) if (conn.open) conn.send(session.view(id));
    renderSession();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(run, REPLAY_DELAY_MS);
  }

  function run() {
    const more = session.tick();
    update();
    if (more) schedule();
  }

  function controls(view) {
    switch (view.phase) {
      case 'lobby': return '<button type="button" class="btn primary" data-start>Démarrer</button>';
      case 'replay': return '<span class="phase-info">Lecture de la main…</span>';
      case 'voting': return `<span class="phase-info">${view.voteCount}/${view.voterCount} ont voté</span><button type="button" class="btn primary" data-reveal>Révéler</button>`;
      case 'revealed': return '<button type="button" class="btn primary" data-next>Suivant</button>';
      default: return '<span class="phase-info">Main terminée.</span>';
    }
  }

  function renderSession() {
    const view = session.view(HOST_ID);
    const state = computeState(view.hand.setup, view.hand.actions);
    root.innerHTML = `
      <section class="panel">
        <div class="toolbar"><h2>${esc(hand.title || 'Session')}</h2><span class="me">Hôte : ${esc(view.you)}</span></div>
        ${banner ? `<div class="banner error">${esc(banner)}</div>` : ''}
        <div class="share">
          <input type="text" readonly value="${esc(link)}" data-link aria-label="Lien de la session">
          <button type="button" class="btn" data-copy>Copier le lien</button>
        </div>
        <div class="participants">${view.participants.map((p) => `<span class="${p.connected ? '' : 'off'}">${esc(p.name)}</span>`).join('')}</div>
        <div class="table-wrap" data-table></div>
        <div data-vote></div>
        <div class="host-controls">${controls(view)}</div>
      </section>`;
    renderTable(root.querySelector('[data-table]'), { hand: view.hand, state });
    renderVotePanel(root.querySelector('[data-vote]'), {
      ...view,
      onVote: (option) => { if (session.vote(HOST_ID, option)) update(); },
    });
    root.querySelector('[data-copy]').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(link);
        e.target.textContent = 'Copié !';
      } catch {
        root.querySelector('[data-link]').select();
      }
    });
    root.querySelector('[data-start]')?.addEventListener('click', () => { session.start(); run(); });
    root.querySelector('[data-reveal]')?.addEventListener('click', () => { session.reveal(); update(); });
    root.querySelector('[data-next]')?.addEventListener('click', () => { session.next(); update(); schedule(); });
  }
}
```

- [ ] **Step 2 : Brancher l'hôte dans `js/main.js`**

Remplacer :

```js
import { mountEditor } from './editor.js';

const root = document.getElementById('app');
const ROUTES = { editor: mountEditor };
```

par :

```js
import { mountEditor } from './editor.js';
import { mountHost } from './host.js';

const root = document.getElementById('app');
const ROUTES = { editor: mountEditor, host: mountHost };
```

- [ ] **Step 3 : Vérifier dans le navigateur (hôte seul)**

`http://localhost:5173/#host` :
1. Importer un JSON invalide (par exemple un fichier texte renommé en `.json`) → « Fichier JSON illisible. », bouton « Ouvrir la session » désactivé.
2. Importer le JSON exporté à la tâche 9 → « Main chargée : BTN open 15bb, BB jam (3 joueurs, 2 point(s) de vote) ».
3. Pseudo vide puis « Ouvrir la session » → « Choisis un pseudo. ». Pseudo « Hôte » → lien `http://localhost:5173/#join=pkr-…` affiché, participant « Hôte ».
4. La table montre la main avant toute action (blinds postées) ; les cartes de Vilain 2 ne sont **pas** visibles.
5. « Démarrer » → vote immédiat (point de vote sur la 1ʳᵉ action) : 4 options, « 0/1 ont voté ». Voter « Raise 2bb » → « 1/1 ». « Révéler » → 100 % sur Raise 2bb. « Suivant » → le raise s'affiche, puis fold, puis all-in (environ 700 ms d'écart), puis 2ᵉ vote.
6. « Révéler » sans voter → « 0 vote ». « Suivant » → call, le board complet s'affiche, Q♠ Q♣ de Vilain 2 sont retournées, « Main terminée. ».
7. Recharger la page pendant une session → le navigateur demande confirmation.

- [ ] **Step 4 : Commit**

```bash
git add js/host.js js/main.js
git commit -m "feat: écran hôte (session, pilotage, révélation)"
```

---

### Task 12 : Écran votant

Ouvert via `#join=<id>` : saisie du pseudo (mémorisé), connexion, puis table + panneau de vote synchronisés sur les messages `state` de l'hôte. Bandeau d'état pour connexion / reconnexion / fin / erreur (avec « Réessayer »).

**Files:**
- Create: `js/voter.js`
- Modify: `js/main.js` (brancher l'écran votant)

- [ ] **Step 1 : Créer `js/voter.js`**

```js
import { computeState } from './engine.js';
import { joinHost, MAX_ATTEMPTS } from './net.js';
import { renderTable } from './table-view.js';
import { renderVotePanel } from './vote-view.js';
import { esc, randomId, storageGet, storageSet } from './dom.js';

const NAME_KEY = 'reviewer.name';
const CLIENT_KEY = 'reviewer.clientId';
const PHASE_TEXT = {
  lobby: "En attente du démarrage par l'hôte…",
  replay: 'Lecture de la main…',
  voting: '',
  revealed: "En attente de l'étape suivante…",
  finished: 'Main terminée : les cartes des vilains sont révélées.',
};

export function mountVoter(root, hostId) {
  let clientId = storageGet('sessionStorage', CLIENT_KEY);
  if (!clientId) {
    clientId = randomId('c-');
    storageSet('sessionStorage', CLIENT_KEY, clientId);
  }
  let name = storageGet('localStorage', NAME_KEY) ?? '';
  let link = null;
  let view = null;
  let status = { kind: 'connecting' };

  renderNameForm();
  return () => link?.close();

  function renderNameForm(error = '') {
    root.innerHTML = `
      <section class="panel">
        <h2>Rejoindre la session</h2>
        <form class="name-form" data-form>
          <input type="text" data-name maxlength="24" placeholder="Ton pseudo" value="${esc(name)}" aria-label="Pseudo">
          <button class="btn primary">Rejoindre</button>
        </form>
        <p class="error">${esc(error)}</p>
      </section>`;
    root.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const value = root.querySelector('[data-name]').value.trim();
      if (!value) return renderNameForm('Choisis un pseudo.');
      name = value;
      storageSet('localStorage', NAME_KEY, name);
      connect();
    });
  }

  function connect() {
    link?.close();
    view = null;
    status = { kind: 'connecting' };
    render();
    link = joinHost(hostId, {
      hello: () => ({ type: 'join', clientId, name }),
      onMessage: (msg) => {
        if (msg?.type === 'state') {
          view = msg;
          render();
        }
      },
      onStatus: (s) => {
        status = s;
        render();
      },
    });
  }

  function statusBanner() {
    switch (status.kind) {
      case 'connecting': return '<div class="banner">Connexion à la session…</div>';
      case 'reconnecting': return `<div class="banner">Connexion perdue, reconnexion (essai ${status.attempt}/${MAX_ATTEMPTS})…</div>`;
      case 'ended': return `<div class="banner error">${esc(status.message)}</div>`;
      case 'error': return `<div class="banner error">${esc(status.message)} <button type="button" class="btn" data-retry>Réessayer</button></div>`;
      default: return '';
    }
  }

  function render() {
    if (!view) {
      root.innerHTML = `<section class="panel"><h2>Session</h2>${statusBanner()}</section>`;
    } else {
      const state = computeState(view.hand.setup, view.hand.actions);
      root.innerHTML = `
        <section class="panel">
          <div class="toolbar"><h2>${esc(view.hand.title || 'Session')}</h2><span class="me">${esc(view.you ?? name)}</span></div>
          ${statusBanner()}
          <div class="table-wrap" data-table></div>
          <div data-vote></div>
          <p class="phase-info">${PHASE_TEXT[view.phase] ?? ''}</p>
        </section>`;
      renderTable(root.querySelector('[data-table]'), { hand: view.hand, state });
      renderVotePanel(root.querySelector('[data-vote]'), {
        ...view,
        onVote: (option) => link.send({ type: 'vote', option }),
      });
    }
    root.querySelector('[data-retry]')?.addEventListener('click', connect);
  }
}
```

- [ ] **Step 2 : Brancher le votant dans `js/main.js`**

Remplacer :

```js
import { mountEditor } from './editor.js';
import { mountHost } from './host.js';

const root = document.getElementById('app');
const ROUTES = { editor: mountEditor, host: mountHost };
```

par :

```js
import { mountEditor } from './editor.js';
import { mountHost } from './host.js';
import { mountVoter } from './voter.js';

const root = document.getElementById('app');
const ROUTES = { editor: mountEditor, host: mountHost, voter: mountVoter };
```

- [ ] **Step 3 : Vérifier : session à trois (1 hôte + 2 votants)**

Onglet A : `http://localhost:5173/#host`, importer la main, pseudo « Hôte », ouvrir la session, copier le lien.
Onglet B : coller le lien, pseudo « Max ». Fenêtre de navigation privée C : coller le lien, pseudo « Max » aussi.

Expected :
1. A affiche les participants « Hôte », « Max », « Max (2) ». B et C affichent la table et « En attente du démarrage par l'hôte… ».
2. A : « Démarrer » → B et C voient les 4 options. B vote « Raise 2bb » puis change pour « All-in » ; C vote « All-in » ; A affiche « 2/3 ont voté ».
3. B et C ne voient que les cartes du Hero (le contenu des messages `state` est couvert par les tests `publicHand` et `view` des tâches 5 et 6).
4. A : « Révéler » → partout « All-in 100 % (2) », le choix de chacun reste surligné ; B et C ne peuvent plus voter.
5. A : « Suivant » → les actions défilent chez tout le monde jusqu'au 2ᵉ vote.
6. Fermer la fenêtre C, attendre que « Max (2) » apparaisse barré chez A (détection de fermeture WebRTC, quelques secondes), puis rouvrir le lien dans une nouvelle fenêtre privée avec le pseudo « Max (2) » → il reprend sa place (pas de « Max (2) (2) »).
7. Recharger l'onglet B (même onglet → même `clientId`), rejoindre → son vote en cours est conservé.
8. Finir la main : les cartes de Vilain 2 sont retournées chez B et C, « Main terminée : les cartes des vilains sont révélées. ».
9. Fermer l'onglet A → B affiche « Session terminée par l'hôte. ».
10. Ouvrir `http://localhost:5173/#join=pkr-inexistant` → « Session introuvable… » avec « Réessayer ».
11. Mode mobile 375 px sur B : table lisible, boutons de vote sur une ou deux colonnes, pas de défilement horizontal.

- [ ] **Step 4 : Vérifier les tests**

Run: `npm test`
Expected: PASS — `# pass 42`

- [ ] **Step 5 : Commit**

```bash
git add js/voter.js js/main.js
git commit -m "feat: écran votant (rejoindre, voter, reconnexion)"
```

---

### Task 13 : README et vérification finale

**Files:**
- Create: `README.md`

- [ ] **Step 1 : Créer `README.md`**

````markdown
# Poker Hand Reviewer

Review de mains de poker en groupe : un éditeur saisit une main et ses points de vote,
un hôte la rejoue en direct, chaque participant vote sur son appareil et l'hôte révèle les pourcentages.

## Lancer en local

```bash
npx --yes serve -l 5173
```

Puis ouvrir http://localhost:5173. (Les modules ES ne fonctionnent pas en ouvrant
`index.html` par double-clic.)

## Tests

```bash
npm test
```

Node 22+, aucune dépendance à installer.

## Utilisation

1. **Créer une main** : setup (joueurs, stacks en BB, cartes), puis actions sur la table.
   Cocher « Faire voter ici » avant une action pour en faire un point de vote. Exporter le JSON.
2. **Héberger une session** : importer le JSON, ouvrir la session, partager le lien.
   Démarrer, Révéler, Suivant. Garder l'onglet ouvert pendant toute la session.
3. **Rejoindre** : ouvrir le lien, choisir un pseudo, voter.

## Déployer (gratuit)

Le dossier est un site statique : GitHub Pages (Settings → Pages → branche `main`, dossier racine)
ou Netlify (glisser-déposer le dossier). La mise en relation passe par le serveur public gratuit de PeerJS ;
les votes transitent directement entre navigateurs et ne sont stockés nulle part.
````

- [ ] **Step 2 : Vérification finale**

Run: `npm test`
Expected: PASS — `# tests 42`, `# fail 0`

Refaire le scénario de la tâche 12 (étapes 1, 2, 4, 5, 8) entre deux appareils réels du même réseau, en servant le dossier sur l'IP locale (`npx --yes serve -l 5173` affiche l'adresse réseau) ou après un déploiement GitHub Pages / Netlify : un ordinateur hôte et un téléphone votant.

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "docs: README (lancer, tester, déployer)"
```
