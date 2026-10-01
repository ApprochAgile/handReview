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
