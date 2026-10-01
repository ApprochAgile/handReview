// choices : liste d'index d'options. Pourcentages entiers dont la somme fait 100
// (méthode du plus fort reste), sauf s'il n'y a aucun vote.
export function tally(choices, optionCount) {
  const counts = Array(optionCount).fill(0);
  for (const c of choices) if (Number.isInteger(c) && c >= 0 && c < optionCount) counts[c]++;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return { counts, percents: Array(optionCount).fill(0), total };
  const raw = counts.map((c) => (c * 100) / total);
  const percents = raw.map(Math.floor);
  const missing = 100 - percents.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < missing; k++) percents[order[k].i]++;
  return { counts, percents, total };
}
