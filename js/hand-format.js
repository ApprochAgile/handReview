import { positionsFor, MIN_PLAYERS, MAX_PLAYERS } from './positions.js';
import { parseCards } from './cards.js';
import { computeState, requiredBoard } from './engine.js';

export const VOTE_MIN_OPTIONS = 2;
export const VOTE_MAX_OPTIONS = 6;
const BOARD_SIZES = { flop: 3, turn: 1, river: 1 };

function fail(message) {
  throw new Error(message);
}

// Montant en BB : nombre fini > 0, au centième près.
export function isAmount(x) {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
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
    if (!seat || typeof seat !== 'object') fail(`${label} : siège invalide.`);
    if (seat.position !== positions[i]) fail(`${label} : position attendue ${positions[i]}.`);
    if (typeof seat.name !== 'string' || !seat.name.trim()) fail(`${label} : nom manquant.`);
    if (!isAmount(seat.stack)) fail(`${label} : stack invalide.`);
    if (seat.hero !== undefined && typeof seat.hero !== 'boolean') fail(`${label} : champ hero invalide.`);
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
    const label = `Action ${k + 1}`;
    if (!action || typeof action !== 'object') fail(`${label} : action invalide.`);
    if (!Number.isInteger(action.seat) || action.seat < 0 || action.seat >= setup.players) fail(`${label} : siège invalide.`);
    if (action.type === 'bet' || action.type === 'raise') {
      if (!isAmount(action.amount)) fail(`${label} : montant invalide.`);
    } else if (action.amount !== undefined) {
      fail(`${label} : montant inattendu.`);
    }
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
  const seats = hand.setup.seats.map((s) => ({
    name: s.name,
    position: s.position,
    stack: s.stack,
    hero: s.hero === true,
    cards: s.hero === true || reveal ? s.cards ?? null : null,
  }));
  return { version: hand.version, title: hand.title, setup: { players: hand.setup.players, seats }, board, actions };
}
