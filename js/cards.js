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
