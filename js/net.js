import { randomId } from './dom.js';

// Couche mince autour de PeerJS (chargé en global par index.html).
export const MAX_ATTEMPTS = 5;
const RETRY_MS = 2000;
const CONNECT_TIMEOUT_MS = 15000;
const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 16000;
const RECONNECT_CHECK_MS = 3000;
const TRANSIENT_ERRORS = new Set(['network', 'socket-error', 'socket-closed', 'server-error', 'disconnected']);
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
// onStatus(message) signale une perte de signalisation, onStatus(null) son retour.
export function openHost({ onMessage, onClose, onStatus }) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error(PEER_MISSING));
    const peer = new Peer(randomId('pkr-'), PEER_OPTIONS);
    let opened = false;
    let closing = false;
    let reconnectTimer = null;
    let checkTimer = null;
    let reconnectDelay = RECONNECT_MIN_MS;

    const shutdown = () => {
      closing = true;
      clearTimeout(reconnectTimer);
      clearTimeout(checkTimer);
      reconnectTimer = checkTimer = null;
      peer.destroy();
    };
    peer.on('open', (id) => {
      reconnectDelay = RECONNECT_MIN_MS;
      if (opened) return onStatus(null);
      opened = true;
      resolve({ id, close: shutdown });
    });
    peer.on('connection', (conn) => {
      conn.on('data', (msg) => onMessage(conn, msg));
      conn.on('close', () => onClose(conn));
      conn.on('error', () => onClose(conn));
    });
    peer.on('disconnected', () => {
      // Perte du serveur de signalisation : les connexions existantes continuent.
      if (closing || peer.destroyed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (closing || peer.destroyed || !peer.disconnected) return;
        peer.reconnect();
        // Le serveur ne renvoie pas toujours OPEN (id encore connu) : vérifie l'état soi-même.
        clearTimeout(checkTimer);
        checkTimer = setTimeout(() => {
          checkTimer = null;
          if (closing || peer.destroyed || peer.disconnected) return;
          reconnectDelay = RECONNECT_MIN_MS;
          onStatus(null);
        }, RECONNECT_CHECK_MS);
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    });
    peer.on('error', (err) => {
      if (closing) return;
      const message = describeError(err);
      if (!opened) {
        shutdown();
        reject(new Error(message));
      } else {
        onStatus(message);
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
  let retryTimer = null;
  let connectTimer = null;
  let reconnectTimer = null;

  const stop = (status) => {
    if (stopped) return;
    stopped = true;
    clearTimeout(retryTimer);
    clearTimeout(connectTimer);
    clearTimeout(reconnectTimer);
    onStatus(status);
    peer.destroy();
  };
  const scheduleRetry = () => {
    // Un seul essai en attente à la fois.
    if (stopped || retryTimer) return;
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      const message = everConnected ? 'Session terminée : hôte déconnecté.' : "Impossible de joindre l'hôte.";
      return stop({ kind: 'ended', message });
    }
    onStatus({ kind: 'reconnecting', attempt: attempts });
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, RETRY_MS);
  };
  function connect() {
    if (stopped || conn?.open) return;
    clearTimeout(retryTimer);
    clearTimeout(connectTimer);
    retryTimer = connectTimer = null;
    // Abandonne une éventuelle tentative précédente encore en cours.
    const previous = conn;
    conn = null;
    previous?.close();
    if (peer.disconnected) {
      // La connexion vers l'hôte sera relancée sur 'open', ou par cet essai si 'open'
      // n'est pas réémis (id encore connu du serveur). Pas compté comme un échec.
      if (!peer.destroyed) peer.reconnect();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, RETRY_MS);
      return;
    }
    const c = peer.connect(hostId, { reliable: true });
    if (!c) return scheduleRetry();
    conn = c;
    let lost = false;
    const onLost = () => {
      if (lost || c !== conn) return;
      lost = true;
      clearTimeout(connectTimer);
      connectTimer = null;
      scheduleRetry();
    };
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (c.open) return;
      onLost();
      c.close();
    }, CONNECT_TIMEOUT_MS);
    c.on('open', () => {
      if (stopped || c !== conn) return;
      clearTimeout(connectTimer);
      connectTimer = null;
      everConnected = true;
      attempts = 0;
      onStatus({ kind: 'connected' });
      c.send(hello());
    });
    c.on('data', (msg) => {
      if (c !== conn) return;
      if (msg?.type === 'bye') {
        if (msg.reason === 'replaced') return stop({ kind: 'ended', message: 'Session ouverte dans un autre onglet.' });
        if (msg.reason === 'full') return stop({ kind: 'ended', message: 'Session complète.' });
        return stop({ kind: 'ended', message: "Session terminée par l'hôte." });
      }
      onMessage(msg);
    });
    c.on('close', onLost);
    c.on('error', onLost);
  }

  peer.on('open', () => {
    if (!conn?.open) connect();
  });
  peer.on('disconnected', () => {
    if (stopped || peer.destroyed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (stopped || peer.destroyed || !peer.disconnected) return;
      peer.reconnect();
    }, RETRY_MS);
  });
  peer.on('error', (err) => {
    if (stopped) return;
    if (err.type === 'peer-unavailable' && everConnected) {
      conn = null;
      return scheduleRetry();
    }
    if (TRANSIENT_ERRORS.has(err.type) && everConnected) {
      // Si la connexion vers l'hôte tient encore, seule la signalisation est perdue.
      if (!conn?.open) scheduleRetry();
      return;
    }
    stop({ kind: 'error', message: describeError(err) });
  });

  return {
    send: (msg) => { if (conn?.open) conn.send(msg); },
    close: () => stop({ kind: 'closed' }),
  };
}
