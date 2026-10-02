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
