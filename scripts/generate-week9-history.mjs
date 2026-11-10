import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Grade the saved, pregame Week 9 board. The input JSON comes from
// grade-week-history.mjs with --git-ref de85479 and the Week 9 lines file.
const [gradePath] = process.argv.slice(2);
if (!gradePath) throw new Error('Usage: node scripts/generate-week9-history.mjs <week9-grade-json>');
const root = path.resolve(import.meta.dirname, '..');
const grade = JSON.parse(fs.readFileSync(gradePath, 'utf8').replace(/^\uFEFF/, ''));
if (grade.fileCount !== 15 || grade.duplicateActuals.length) {
  throw new Error('Week 9 requires 15 game files with no duplicate player rows.');
}
const altSource = fs.readFileSync(path.join(root, 'artifacts/nfl-prop-dashboard/src/data/week9-alternate-prop-lines.ts'), 'utf8');
const alternates = [...altSource.matchAll(/\{ player: '([^']+)', statKey: '([^']+)', line: ([\d.]+), odds: (-?\d+) \}/g)]
  .map(([, player, statKey, line, odds]) => ({ player, statKey, line: Number(line), odds: Number(odds) }));

const unavailable = (status) => /(?:^|\b)(?:out|doubtful|injured reserve|reserve-ret|ir|pup|nfi|suspended)(?:\b|$)/i.test(status ?? '');
const normalized = (value) => value.toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const ranked = grade.rankedBoard.filter((prop) => !unavailable(prop.injuryStatus));
const rankedByKey = new Map(ranked.map((prop) => [prop.key, prop]));
const graded = grade.gradedPicks.filter((prop) => {
  const board = rankedByKey.get(prop.key);
  return board && board.team === prop.sourceTeam;
});
// Brian Thomas played against BAL but had zero targets, so the game-log CSV
// omitted him. The user confirmed the appearance; both receiving stats are 0.
const pregameData = JSON.parse(execFileSync('git', [
  'show', 'de85479:artifacts/nfl-prop-dashboard/src/data/player-data.json',
], { cwd: root, encoding: 'utf8' }));
const brian = pregameData.WR.find((player) => player.name === 'Brian Thomas');
if (!brian || !grade.missingActuals.some((prop) => prop.player === 'Brian Thomas')) {
  throw new Error('Expected Brian Thomas to be absent from the JAX–BAL game-log rows.');
}
for (const statKey of ['rec_yards', 'receptions']) {
  const board = rankedByKey.get(`WR:${statKey}:Brian Thomas`);
  if (!board || board.team !== 'JAX' || board.lean !== 'OVER') throw new Error('Unexpected Brian Thomas pregame prop.');
  graded.push({ key: board.key, player: board.player, position: board.position,
    statKey, stat: board.stat, lean: board.lean, line: board.line,
    projection: brian.stats[statKey].projection, actual: 0, result: 'LOSS',
    confidenceScore: board.confidenceScore, sourceTeam: 'JAX', sourceFile: 'JAXvsBAL.csv' });
}
const boardOrder = new Map(ranked.map((prop, index) => [prop.key, index]));
graded.sort((a, b) => boardOrder.get(a.key) - boardOrder.get(b.key));
const gradedByKey = new Map(graded.map((prop) => [prop.key, prop]));
const record = (picks) => picks.reduce((total, pick) => {
  if (pick.result === 'WIN') total.wins++;
  else if (pick.result === 'LOSS') total.losses++;
  else if (pick.result === 'PUSH') total.pushes++;
  return total;
}, { wins: 0, losses: 0, pushes: 0 });
const pick = ({ player, position, stat, lean, line, projection, actual, result }) =>
  ({ player, position, stat, lean, line, projection, actual, result });
const seenTopPlayers = new Set();
const topBoard = ranked.filter((prop) => {
  if (prop.lean === 'PASS') return false;
  const player = normalized(prop.player);
  if (seenTopPlayers.has(player)) return false;
  seenTopPlayers.add(player);
  return true;
}).slice(0, 10);
const topPicks = topBoard.map((prop) => gradedByKey.get(prop.key)).filter(Boolean);
const highPicks = graded.filter((prop) => prop.confidenceScore >= 72);

const banned = new Set(['Evan Engram', 'Alvin Kamara', 'Brian Thomas', 'Kyler Murray']);
const excludedTeams = new Set(['CIN', 'ATL']);
const candidates = ranked.filter((prop) => prop.lean !== 'PASS'
  && prop.confidenceScore >= 72
  && !banned.has(prop.player)
  && !excludedTeams.has(prop.team)
  && !prop.injuryStatus
  && !prop.lowConfidence
  && prop.nPriorGames >= 8);
const matchup = (prop) => [prop.team, prop.opponent].sort().join('|');
function diversified(items) {
  const selected = [];
  const players = new Set(), teams = new Set(), games = new Set();
  for (const item of items) {
    const prop = item.prop ?? item;
    const player = normalized(prop.player), game = matchup(prop);
    if (players.has(player) || teams.has(prop.team) || games.has(game)) continue;
    selected.push(item);
    players.add(player); teams.add(prop.team); games.add(game);
    if (selected.length === 4) break;
  }
  return selected;
}
const best = diversified(candidates);
const bestPlayers = new Set(best.map((prop) => normalized(prop.player)));
const stinky = diversified(candidates.filter((prop) => prop.lean === 'UNDER' && !bestPlayers.has(normalized(prop.player))));
const implied = (odds) => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
const saferEligible = candidates.flatMap((prop) => {
  const options = alternates.filter((line) => line.player === prop.player && line.statKey === prop.statKey)
    .map((alternate) => ({ alternate, probability: implied(alternate.odds) }))
    .filter(({ probability }) => probability >= 0.74 && probability <= 0.81)
    .sort((a, b) => Math.abs(a.probability - 0.77) - Math.abs(b.probability - 0.77));
  if (!options.length) return [];
  return [{ prop, alternate: options[0].alternate, safetyScore: prop.confidenceScore * 0.5 + options[0].probability * 50 }];
}).sort((a, b) => b.safetyScore - a.safetyScore);
const safer = diversified(saferEligible);

function parlay(name, items) {
  if (items.length !== 4) return null;
  const legs = items.map((item) => {
    const prop = item.prop ?? item;
    const alternate = item.alternate;
    const line = alternate?.line ?? prop.line;
    const lean = alternate ? 'OVER' : prop.lean;
    const result = gradedByKey.get(prop.key);
    const actual = result?.actual ?? null;
    const status = actual === null ? 'VOID' : actual === line ? 'PUSH'
      : (lean === 'OVER' ? actual > line : actual < line) ? 'WIN' : 'LOSS';
    return { player: prop.player, stat: prop.stat, lean, line, actual, result: status,
      ...(alternate ? { odds: alternate.odds } : {}) };
  });
  const outcome = legs.some((leg) => leg.result === 'LOSS') ? 'MISSED'
    : legs.every((leg) => leg.result === 'WIN') ? 'HIT' : 'VOID';
  return { name, outcome,
    source: 'Default builder selections reconstructed from saved pregame commit de85479; browser substitutions were not archived.',
    legs };
}
const parlays = [parlay('Best Four', best), parlay('Safer Four', safer), parlay('Stinky Unders', stinky)].filter(Boolean);
const missingTop = topBoard.filter((prop) => !gradedByKey.has(prop.key)).map((prop) => prop.player);
const week9 = {
  week: 9, season: 2026, label: 'November 5–9, 2026',
  gamesGraded: 15, gamesScheduled: 15,
  allLeans: record(graded), highConfidence: record(highPicks), topPicks: record(topPicks), topPickLimit: 10,
  highConfidencePicks: highPicks.map(pick), parlays, picks: topPicks.map(pick),
  note: `All 15 games graded against saved pregame Week 9 lines and projections. Brian Thomas played but had zero targets, so his two receiving props count as losses despite his absence from the CSV. ${missingTop.length ? `Top 10 ${missingTop.join(', ')} had no game-log row and is ungraded. ` : ''}PASS calls, other players without a confirmed appearance, and Luther Burden's unsupported rushing line are excluded. Parlays show default builder tickets; browser substitutions were not archived.`,
};
const output = path.join(root, 'artifacts/nfl-prop-dashboard/src/data/week9-history-snapshot.json');
fs.writeFileSync(output, `${JSON.stringify(week9, null, 2)}\n`);
console.log(JSON.stringify({ output, allLeans: week9.allLeans, highConfidence: week9.highConfidence,
  topPicks: week9.topPicks, missingTop, parlays: parlays.map(({ name, outcome, legs }) =>
    ({ name, outcome, legs: legs.map(({ player, result }) => `${player}:${result}`) })) }, null, 2));
