// Main d'exemple de la spec (§3), valide.
export function sampleHand() {
  return {
    version: 1,
    title: 'BTN open 15bb, BB jam',
    setup: {
      players: 3,
      seats: [
        { name: 'Hero', position: 'BTN', stack: 15, cards: 'AhJd', hero: true },
        { name: 'Vilain 1', position: 'SB', stack: 22, cards: null, hero: false },
        { name: 'Vilain 2', position: 'BB', stack: 13, cards: 'QsQc', hero: false },
      ],
    },
    board: { flop: 'Kc7h2s', turn: '9d', river: '4c' },
    actions: [
      { seat: 0, type: 'raise', amount: 2, vote: { question: 'Que fais-tu ?', options: ['Fold', 'Limp', 'Raise 2bb', 'All-in'] } },
      { seat: 1, type: 'fold' },
      { seat: 2, type: 'allin' },
      { seat: 0, type: 'call', vote: { question: '', options: ['Fold', 'Call'] } },
    ],
  };
}
