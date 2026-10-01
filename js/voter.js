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
