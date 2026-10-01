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
