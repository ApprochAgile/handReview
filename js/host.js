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
const MAX_PARTICIPANTS = 50;
const MAX_CLIENT_ID_LENGTH = 32;
const CLOSE_DELAY_MS = 300;

export function mountHost(root) {
  let hand = null;
  let session = null;
  let link = '';
  let banner = '';
  let closePeer = null;
  let timer = null;
  let disposed = false;
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

  const cleanup = () => {
    disposed = true;
    clearTimeout(timer);
    sayBye();
    // Laisse partir les messages `bye` avant de fermer le peer.
    setTimeout(() => closePeer?.(), CLOSE_DELAY_MS);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pagehide', sayBye);
  };
  // Demandé par main.js avant de quitter l'écran par navigation interne.
  cleanup.confirmLeave = () => session !== null;
  return cleanup;

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
      if (disposed) return;
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
      const host = await openHost({ onMessage, onClose, onStatus });
      if (disposed) return host.close();
      closePeer = host.close;
      link = `${location.href.split('#')[0]}#join=${encodeURIComponent(host.id)}`;
      session = new Session(hand);
      session.join(HOST_ID, name);
      renderSession();
    } catch (e) {
      if (disposed) return;
      renderSetup(`${e.message} Réessaie.`);
    }
  }

  function onStatus(message) {
    if (disposed) return;
    banner = message ?? '';
    renderSession();
  }

  function onMessage(conn, msg) {
    if (disposed) return;
    if (msg?.type === 'join' && typeof msg.clientId === 'string' && msg.clientId.startsWith('c-') && typeof msg.name === 'string') {
      onJoin(conn, msg.clientId, msg.name);
    } else if (msg?.type === 'vote') {
      const id = idsByConn.get(conn);
      if (id && session.vote(id, msg.option)) update();
    }
  }

  function onJoin(conn, clientId, name) {
    if (clientId.length > MAX_CLIENT_ID_LENGTH) return;
    // Une seule identité par connexion.
    const known = idsByConn.get(conn);
    if (known && known !== clientId) return;
    if (!session.participants.some((p) => p.id === clientId) && session.participants.length >= MAX_PARTICIPANTS) {
      conn.send({ type: 'bye', reason: 'full' });
      setTimeout(() => conn.close(), CLOSE_DELAY_MS);
      return;
    }
    // Onglet dupliqué : la nouvelle connexion remplace l'ancienne.
    const old = connsById.get(clientId);
    if (old && old !== conn && old.open) {
      old.send({ type: 'bye', reason: 'replaced' });
      idsByConn.delete(old);
      setTimeout(() => old.close(), CLOSE_DELAY_MS);
    }
    const p = session.join(clientId, name);
    connsById.set(p.id, conn);
    idsByConn.set(conn, p.id);
    update();
  }

  function onClose(conn) {
    if (disposed) return;
    const id = idsByConn.get(conn);
    idsByConn.delete(conn);
    if (id && connsById.get(id) === conn) {
      connsById.delete(id);
      session.leave(id);
      update();
    }
  }

  function update() {
    if (disposed) return;
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
