import fs from 'node:fs';

const [gradePath, alternatePath] = process.argv.slice(2);
if (!gradePath || !alternatePath) {
  throw new Error('Usage: node scripts/grade-parlay-history.mjs <grade-json> <alternate-lines-ts>');
}
const grade = JSON.parse(fs.readFileSync(gradePath, 'utf8').replace(/^\uFEFF/, ''));
const alternateSource = fs.readFileSync(alternatePath, 'utf8');
const alternates = [...alternateSource.matchAll(/\{ player: '([^']+)', statKey: '([^']+)', line: ([\d.]+), odds: (-?\d+) \}/g)]
  .map(([, player, statKey, line, odds]) => ({ player, statKey, line: Number(line), odds: Number(odds) }));
const banned = new Set(['Evan Engram', 'Alvin Kamara', 'Brian Thomas', 'Kyler Murray']);
const candidates = grade.rankedBoard.filter((prop) =>
  prop.lean !== 'PASS'
  && prop.confidenceScore >= 65
  && !banned.has(prop.player)
  && !prop.injuryStatus
  && !prop.lowConfidence
  && prop.nPriorGames >= 8,
);
const matchup = (prop) => [prop.team, prop.opponent].sort().join('|');
function diversified(props) {
  const selected = [];
  const players = new Set();
  const teams = new Set();
  const games = new Set();
  for (const item of props) {
    const prop = item.prop ?? item;
    const game = matchup(prop);
    if (players.has(prop.player) || teams.has(prop.team) || games.has(game)) continue;
    selected.push(item);
    players.add(prop.player);
    teams.add(prop.team);
    games.add(game);
    if (selected.length === 4) break;
  }
  return selected;
}
const implied = (odds) => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
const bestFour = diversified(candidates);
const saferEligible = candidates.flatMap((prop) => {
  const options = alternates
    .filter((line) => line.player === prop.player && line.statKey === prop.statKey)
    .map((alternate) => ({ alternate, probability: implied(alternate.odds) }))
    .filter(({ probability }) => probability >= 0.74 && probability <= 0.81)
    .sort((a, b) => Math.abs(a.probability - 0.77) - Math.abs(b.probability - 0.77));
  if (!options.length) return [];
  const { alternate, probability } = options[0];
  return [{ prop, alternate, probability, safetyScore: 0.5 * prop.confidenceScore + 50 * probability }];
}).sort((a, b) => b.safetyScore - a.safetyScore);
const saferFour = diversified(saferEligible);
const actualByKey = new Map(grade.gradedPicks.map((prop) => [prop.key, prop]));
function gradeLeg(prop, line, lean) {
  const graded = actualByKey.get(prop.key);
  if (!graded) return { status: 'VOID', actual: null };
  if (graded.sourceTeam !== prop.team) return { status: 'UNVERIFIED', actual: graded.actual };
  const status = graded.actual === line ? 'PUSH' : (lean === 'OVER' ? graded.actual > line : graded.actual < line) ? 'WIN' : 'LOSS';
  return { status, actual: graded.actual };
}
const best = bestFour.map((prop) => ({
  player: prop.player, team: prop.team, opponent: prop.opponent, stat: prop.stat,
  line: prop.line, lean: prop.lean, confidenceScore: prop.confidenceScore,
  ...gradeLeg(prop, prop.line, prop.lean),
}));
const safer = saferFour.map(({ prop, alternate }) => ({
  player: prop.player, team: prop.team, opponent: prop.opponent, stat: prop.stat,
  line: alternate.line, lean: 'OVER', odds: alternate.odds,
  ...gradeLeg(prop, alternate.line, 'OVER'),
}));
console.log(JSON.stringify({ bestFour: best, saferFour: safer }, null, 2));
