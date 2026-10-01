import { positionsFor, MIN_PLAYERS, MAX_PLAYERS } from './positions.js';
import { parseCards, usedCards } from './cards.js';
import { computeState, legalActions, requiredBoard } from './engine.js';
import { validateHand, isAmount, parseHand, serializeHand, fileNameFor, VOTE_MIN_OPTIONS, VOTE_MAX_OPTIONS } from './hand-format.js';
import { renderTable, cardHtml, ACTION_LABELS } from './table-view.js';
import { pickCards } from './card-picker.js';
import { esc, storageGet, storageSet, downloadText } from './dom.js';

const DRAFT_KEY = 'reviewer.draft';
const BOARD_STREETS = [['flop', 3, 'Flop'], ['turn', 1, 'Turn'], ['river', 1, 'River']];

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

function setupProblem(hand) {
  if (!hand.setup.seats.find((s) => s.hero)?.cards) return 'Choisis les cartes du Hero.';
  return validateHand({ ...hand, actions: [], board: emptyBoard() });
}

function defaultOptions(legal) {
  return legal.map((l) => (l.type === 'call' ? `Call ${l.amount}` : ACTION_LABELS[l.type]));
}

function actionButtonLabel(l) {
  if (l.type === 'call') return `Call ${l.amount}`;
  if (l.type === 'allin') return `All-in ${l.amount}`;
  return ACTION_LABELS[l.type];
}

export function mountEditor(root) {
  let { hand, step } = loadDraft() ?? { hand: emptyHand(), step: 'setup' };
  const controller = new AbortController();
  render();
  return () => controller.abort();

  function save() {
    storageSet('localStorage', DRAFT_KEY, JSON.stringify({ hand, step }));
  }

  function render() {
    save();
    try {
      if (step === 'setup') renderSetup();
      else renderActions();
    } catch {
      // brouillon corrompu : on repart d'une main vide
      hand = emptyHand();
      step = 'setup';
      save();
      renderSetup();
    }
  }

  function showError(message) {
    root.querySelector('[data-error]').textContent = message;
  }

  function renderSetup() {
    const seatRows = hand.setup.seats.map((s, i) => `
      <div class="seat-row${s.hero ? ' is-hero' : ''}">
        <span class="pos">${s.position}</span>
        <input type="text" data-name="${i}" value="${esc(s.name)}" maxlength="20" aria-label="Nom du siège ${i + 1}">
        <label class="stack"><input type="number" data-stack="${i}" value="${s.stack}" min="0.01" step="0.01" aria-label="Stack du siège ${i + 1}"> BB</label>
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
      const cards = await pickCards({ count: 2, used, title: `Cartes de ${seat.name}`, signal: controller.signal });
      if (controller.signal.aborted) return;
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
      const problem = setupProblem(hand);
      if (problem) return showError(problem);
      step = 'actions';
      render();
    });
    root.querySelector('[data-import]').addEventListener('change', async (e) => {
      const input = e.target;
      const file = input.files[0];
      if (!file) return;
      if (hand.actions.length && !confirm('Remplacer la main en cours ?')) {
        input.value = '';
        return;
      }
      const result = parseHand(await file.text());
      input.value = '';
      if (controller.signal.aborted) return;
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
        ${sized ? `<label class="field amount">Montant total sur la street (${sized.min} à ${sized.max} BB)<input type="number" data-amount min="${sized.min}" max="${sized.max}" step="0.01" value="${sized.min}"></label>` : ''}
        <div class="action-buttons">${legal.map((l) => `<button type="button" class="btn action" data-action="${l.type}">${actionButtonLabel(l)}</button>`).join('')}</div>
      </div>`;
  }

  function actionLog() {
    if (!hand.actions.length) return '';
    const items = hand.actions.map((a) => {
      const seat = hand.setup.seats[a.seat];
      const amount = a.amount !== undefined ? ` ${a.amount}` : '';
      return `<li>${seat.position} ${esc(seat.name)} : ${ACTION_LABELS[a.type]}${amount}${a.vote ? ' <span class="tag">vote</span>' : ''}</li>`;
    }).join('');
    return `<ol class="log">${items}</ol>`;
  }

  async function play(type) {
    const state = computeState(hand.setup, hand.actions);
    const action = { seat: state.toAct, type };
    const draft = {
      checked: root.querySelector('[data-vote-toggle]').checked,
      question: root.querySelector('[data-vote-question]').value,
      options: root.querySelector('[data-vote-options]').value,
      amount: root.querySelector('[data-amount]')?.value,
    };
    if (type === 'bet' || type === 'raise') {
      const amount = Number(draft.amount);
      if (!isAmount(amount)) return showError('Montant invalide : nombre positif, 2 décimales maximum.');
      action.amount = amount;
    }
    if (draft.checked) {
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
    const filled = await fillBoard(next);
    if (!filled) {
      hand.actions.pop();
      pruneBoard();
    }
    if (controller.signal.aborted) {
      save();
      return;
    }
    render();
    if (!filled) restoreDraft(draft);
  }

  // Réinjecte la saisie de l'action annulée dans le nouveau panneau.
  function restoreDraft({ checked, question, options, amount }) {
    const toggle = root.querySelector('[data-vote-toggle]');
    if (!toggle) return;
    toggle.checked = checked;
    root.querySelector('[data-vote-editor]').hidden = !checked;
    root.querySelector('[data-vote-question]').value = question;
    root.querySelector('[data-vote-options]').value = options;
    const amountInput = root.querySelector('[data-amount]');
    if (amountInput && amount !== undefined) amountInput.value = amount;
  }

  // Demande les cartes des streets nouvellement atteintes. false si annulé.
  async function fillBoard(state) {
    const required = requiredBoard(state);
    for (const [street, count, label] of BOARD_STREETS) {
      if (!required[street] || hand.board[street]) continue;
      const cards = await pickCards({ count, used: usedCards(hand), title: `Cartes du ${label}`, signal: controller.signal });
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
