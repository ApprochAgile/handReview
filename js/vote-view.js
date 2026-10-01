import { esc } from './dom.js';

// Panneau de vote commun à l'hôte et aux votants.
// `view` est le message `state` de la session (voir session.js).
export function renderVotePanel(container, { vote, phase, myVote, results, voteCount, voterCount, onVote }) {
  if (!vote || (phase !== 'voting' && phase !== 'revealed')) {
    container.innerHTML = '';
    return;
  }
  const revealed = phase === 'revealed';
  const options = vote.options.map((option, i) => {
    const pct = revealed ? results.percents[i] : 0;
    return `
      <button type="button" class="vote-option${myVote === i ? ' mine' : ''}" data-option="${i}" ${revealed ? 'disabled' : ''}>
        ${revealed ? `<span class="vote-fill" style="width:${pct}%"></span>` : ''}
        <span class="vote-label">${esc(option)}</span>
        ${revealed ? `<span class="vote-pct">${pct} % (${results.counts[i]})</span>` : ''}
      </button>`;
  }).join('');
  let status;
  if (revealed) status = `${results.total} vote${results.total > 1 ? 's' : ''}`;
  else if (myVote === null) status = `Choisis une option · ${voteCount}/${voterCount} ont voté`;
  else status = `Vote enregistré, modifiable jusqu'à la révélation · ${voteCount}/${voterCount} ont voté`;

  container.innerHTML = `
    <div class="vote-panel">
      ${vote.question ? `<p class="vote-question">${esc(vote.question)}</p>` : ''}
      <div class="vote-options">${options}</div>
      <p class="vote-status">${status}</p>
    </div>`;
  if (!revealed) {
    container.querySelectorAll('[data-option]').forEach((button) => {
      button.addEventListener('click', () => onVote(Number(button.dataset.option)));
    });
  }
}
