import { totalPot } from './engine.js';
import { parseCards } from './cards.js';
import { esc } from './dom.js';

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const ACTION_LABELS = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
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
  const cards = parseCards(seat.cards);
  const visible = cards.length > 0 && (seat.hero || !hideVillainCards);
  // Un joueur couché n'a plus de cartes, sauf si elles sont révélées (fin de main).
  if (st.folded) return visible ? cards.map(cardHtml).join('') : '';
  if (visible) return cards.map(cardHtml).join('');
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
