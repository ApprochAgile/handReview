import { randomId } from './dom.js';

// Couche mince autour de PeerJS (chargé en global par index.html).
export const MAX_ATTEMPTS = 5;
const RETRY_MS = 2000;
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
export function openHost({ onMessage, onClose, onError }) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error(PEER_MISSING));
    const peer = new Peer(randomId('pkr-'), PEER_OPTIONS);
    let opened = false;
    peer.on('open', (id) => {
      opened = true;
      resolve({ id, close: () => peer.destroy() });
    });
    peer.on('connection', (conn) => {
      conn.on('data', (msg) => onMessage(conn, msg));
      conn.on('close', () => onClose(conn));
      conn.on('error', () => onClose(conn));
    });
    peer.on('disconnected', () => {
      // Perte du serveur de signalisation : les connexions existantes continuent.
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('error', (err) => {
      const message = describeError(err);
      if (!opened) {
        peer.destroy();
        reject(new Error(message));
      } else {
        onError(message);
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

  const stop = (status) => {
    if (stopped) return;
    stopped = true;
    onStatus(status);
    peer.destroy();
  };
  const scheduleRetry = () => {
    if (stopped) return;
    attempts++;
    if (attempts > MAX_ATTEMPTS) return stop({ kind: 'ended', message: 'Session terminée : hôte déconnecté.' });
    onStatus({ kind: 'reconnecting', attempt: attempts });
    setTimeout(connect, RETRY_MS);
  };
  function connect() {
    if (stopped) return;
    const c = peer.connect(hostId, { reliable: true });
    conn = c;
    let lost = false;
    const onLost = () => {
      if (lost || c !== conn) return;
      lost = true;
      scheduleRetry();
    };
    c.on('open', () => {
      everConnected = true;
      attempts = 0;
      onStatus({ kind: 'connected' });
      c.send(hello());
    });
    c.on('data', (msg) => {
      if (msg?.type === 'bye') return stop({ kind: 'ended', message: "Session terminée par l'hôte." });
      onMessage(msg);
    });
    c.on('close', onLost);
    c.on('error', onLost);
  }

  peer.on('open', connect);
  peer.on('disconnected', () => {
    if (!stopped && !peer.destroyed) peer.reconnect();
  });
  peer.on('error', (err) => {
    if (stopped) return;
    if (err.type === 'peer-unavailable' && everConnected) {
      conn = null;
      return scheduleRetry();
    }
    stop({ kind: 'error', message: describeError(err) });
  });

  return {
    send: (msg) => { if (conn?.open) conn.send(msg); },
    close: () => stop({ kind: 'closed' }),
  };
}
