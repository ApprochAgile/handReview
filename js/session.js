import { tally } from './votes.js';
import { publicHand } from './hand-format.js';

const MAX_NAME_LENGTH = 24;

// État d'une session de vote, côté hôte. Aucune dépendance réseau ni DOM.
export class Session {
  constructor(hand) {
    this.hand = hand;
    this.phase = 'lobby'; // lobby | replay | voting | revealed | finished
    this.cursor = 0; // nombre d'actions déjà montrées
    this.voteAt = null; // index de l'action en cours de vote
    this.votes = new Map(); // clientId -> index d'option
    this.results = null;
    this.participants = []; // { id, name, connected }
  }

  join(clientId, wantedName) {
    const name = String(wantedName).trim().slice(0, MAX_NAME_LENGTH) || 'Anonyme';
    let p = this.participants.find((x) => x.id === clientId);
    if (!p) {
      p = this.participants.find((x) => x.name === name && !x.connected);
      if (p) {
        if (this.votes.has(p.id)) {
          this.votes.set(clientId, this.votes.get(p.id));
          this.votes.delete(p.id);
        }
        p.id = clientId;
      }
    }
    if (p) {
      p.connected = true;
      return p;
    }
    let unique = name;
    for (let k = 2; this.participants.some((x) => x.name === unique); k++) unique = `${name} (${k})`;
    p = { id: clientId, name: unique, connected: true };
    this.participants.push(p);
    return p;
  }

  leave(clientId) {
    const p = this.participants.find((x) => x.id === clientId);
    if (p) p.connected = false;
  }

  start() {
    if (this.phase === 'lobby') this.phase = 'replay';
  }

  // Une étape de replay. Retourne true si une action a été jouée
  // (l'hôte rappelle tick après un délai), false si on s'arrête (vote ou fin).
  tick() {
    if (this.phase !== 'replay') return false;
    if (this.cursor >= this.hand.actions.length) {
      this.phase = 'finished';
      return false;
    }
    if (this.hand.actions[this.cursor].vote) {
      this.phase = 'voting';
      this.voteAt = this.cursor;
      this.votes = new Map();
      this.results = null;
      return false;
    }
    this.cursor++;
    return true;
  }

  currentVote() {
    return this.voteAt === null ? null : this.hand.actions[this.voteAt].vote;
  }

  vote(clientId, option) {
    if (this.phase !== 'voting') return false;
    if (!Number.isInteger(option) || option < 0 || option >= this.currentVote().options.length) return false;
    this.votes.set(clientId, option);
    return true;
  }

  reveal() {
    if (this.phase !== 'voting') return;
    this.results = tally([...this.votes.values()], this.currentVote().options.length);
    this.phase = 'revealed';
  }

  next() {
    if (this.phase !== 'revealed') return;
    this.cursor = this.voteAt + 1;
    this.voteAt = null;
    this.votes = new Map();
    this.results = null;
    this.phase = 'replay';
  }

  // Message `state` envoyé à un participant.
  view(clientId) {
    const vote = this.currentVote();
    return {
      type: 'state',
      hand: publicHand(this.hand, this.cursor, this.phase === 'finished'),
      phase: this.phase,
      vote: vote ? { question: vote.question ?? '', options: [...vote.options] } : null,
      participants: this.participants.map((p) => ({ name: p.name, connected: p.connected })),
      voteCount: this.votes.size,
      voterCount: this.participants.filter((p) => p.connected).length,
      you: this.participants.find((p) => p.id === clientId)?.name ?? null,
      myVote: this.votes.has(clientId) ? this.votes.get(clientId) : null,
      results: this.phase === 'revealed' ? this.results : null,
    };
  }
}
