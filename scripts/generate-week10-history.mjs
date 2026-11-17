import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const gradePath = process.argv[2];
if (!gradePath) throw new Error('Usage: node scripts/generate-week10-history.mjs <week10-grade-json>');

const grade = JSON.parse(fs.readFileSync(path.resolve(gradePath), 'utf8').replace(/^\uFEFF/, ''));
const lineState = JSON.parse(fs.readFileSync(path.join(root, 'data/week10-context/closing-lines-public.json'), 'utf8'));
const injuryState = JSON.parse(fs.readFileSync(path.join(root, 'data/week10-context/injury-state-public.json'), 'utf8'));
if (grade.fileCount !== 14 || grade.duplicateActuals.length || lineState.week !== '2026-10'
  || injuryState.week !== '2026-10') {
  throw new Error('Expected 14 Week 10 game files, no duplicate players, and Week 10 line/injury snapshots.');
}

const byKey = new Map(grade.gradedPicks.map((pick) => [pick.key, pick]));
const mismatches = grade.gradedPicks.filter((pick) => pick.team !== pick.sourceTeam);
if (mismatches.length) throw new Error(`Actuals have ${mismatches.length} player/team mismatches.`);

const normalized = (value) => value.toLowerCase().replace(/[.'’]/g, '')
  .replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const record = (picks) => picks.reduce((sum, pick) => {
  if (pick.result === 'WIN') sum.wins++;
  else if (pick.result === 'LOSS') sum.losses++;
  else if (pick.result === 'PUSH') sum.pushes++;
  return sum;
}, { wins: 0, losses: 0, pushes: 0 });
const displayPick = ({ player, position, stat, lean, line, projection, actual, result }) =>
  ({ player, position, stat, lean, line, projection, actual, result });

// These were the default builder rules in the last commit before Week 10 games.
const banned = new Set(['Evan Engram', 'Alvin Kamara', 'Brian Thomas', 'Kyler Murray', 'Jameson Williams']);
const backupQbTeams = new Set(['BAL', 'LVR', 'ARI', 'MIA', 'SEA', 'MIN']);
const candidates = grade.rankedBoard.filter((prop) => prop.lean !== 'PASS'
  && prop.confidenceScore >= 72
  && !banned.has(prop.player)
  && !((prop.position === 'WR' || prop.position === 'TE') && backupQbTeams.has(prop.team))
  && !prop.injuryStatus && !prop.lowConfidence && prop.nPriorGames >= 8);

function diversified(items) {
  const chosen = [];
  const players = new Set();
  const teams = new Set();
  for (const item of items) {
    const prop = item.prop ?? item;
    const player = normalized(prop.player);
    if (players.has(player) || teams.has(prop.team)) continue;
    chosen.push(item);
    players.add(player);
    teams.add(prop.team);
    if (chosen.length === 4) break;
  }
  return chosen;
}

const best = diversified(candidates);
const bestPlayers = new Set(best.map((prop) => normalized(prop.player)));
const stinky = diversified(candidates.filter((prop) =>
  prop.lean === 'UNDER' && !bestPlayers.has(normalized(prop.player))));

const altSource = fs.readFileSync(path.join(root,
  'artifacts/nfl-prop-dashboard/src/data/week10-alternate-prop-lines.ts'), 'utf8');
const alternates = [...altSource.matchAll(/\{ player: '([^']+)', statKey: '([^']+)', line: ([\d.]+), odds: (-?\d+) \}/g)]
  .map(([, player, statKey, line, odds]) => ({ player, statKey, line: Number(line), odds: Number(odds) }));
const implied = (odds) => odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
const saferEligible = candidates.flatMap((prop) => {
  const options = alternates.filter((alt) => alt.player === prop.player && alt.statKey === prop.statKey)
    .map((alternate) => ({ alternate, probability: implied(alternate.odds) }))
    .filter(({ probability }) => probability >= 0.74 && probability <= 0.81)
    .sort((a, b) => Math.abs(a.probability - 0.77) - Math.abs(b.probability - 0.77));
  if (!options.length) return [];
  return [{ prop, alternate: options[0].alternate,
    safetyScore: prop.confidenceScore * 0.5 + options[0].probability * 50 }];
}).sort((a, b) => b.safetyScore - a.safetyScore);
const safer = diversified(saferEligible);

function ticket(name, items) {
  if (items.length !== 4) return null;
  const legs = items.map((item) => {
    const prop = item.prop ?? item;
    const alternate = item.alternate;
    const line = alternate?.line ?? prop.line;
    const lean = alternate ? 'OVER' : prop.lean;
    const actual = byKey.get(prop.key)?.actual ?? null;
    const result = actual === null ? 'VOID' : actual === line ? 'PUSH'
      : (lean === 'OVER' ? actual > line : actual < line) ? 'WIN' : 'LOSS';
    const uploaded = lineState.lines[prop.key];
    const odds = alternate?.odds ?? Number(lean === 'OVER' ? uploaded?.overOdds : uploaded?.underOdds);
    return { player: prop.player, stat: prop.stat, lean, line, actual, result,
      ...(Number.isFinite(odds) && odds !== 0 ? { odds } : {}) };
  });
  const outcome = legs.some((leg) => leg.result === 'LOSS') ? 'MISSED'
    : legs.every((leg) => leg.result === 'WIN') ? 'HIT' : 'VOID';
  return { name, outcome,
    source: 'Default ticket reconstructed from pregame rules (commit 0b26d24) and saved Week 10 inputs; browser substitutions were not archived.',
    legs };
}
const parlays = [ticket('Best Four', best), ticket('Safer Four', safer), ticket('Stinky Unders', stinky)].filter(Boolean);

const highPicks = grade.highConfidencePicks.filter((pick) => pick.team === pick.sourceTeam);
const topPicks = grade.topTen.filter((pick) => pick.team === pick.sourceTeam);
const unresolved = [...new Set(grade.missingActuals.map((pick) => pick.player))];
const history = {
  week: 10, season: 2026, label: 'November 12–16, 2026',
  gamesGraded: 14, gamesScheduled: 14,
  allLeans: grade.allLeans, highConfidence: record(highPicks),
  topPicks: record(topPicks), topPickLimit: 10,
  highConfidencePicks: highPicks.map(displayPick),
  parlays,
  picks: topPicks.map(displayPick),
  note: `All 14 games graded from user-supplied logs against the saved Week 10 projections and uploaded lines. The line snapshot was saved ${lineState.updatedAt}, before Monday kickoff; earlier Sunday upload versions were unavailable, so Sunday closing prices are unverified. The injury snapshot was saved ${injuryState.updatedAt}; players with confirmed appearances were treated as available despite later Out tags. ${unresolved.join(', ')} had no game-log row, so their props remain ungraded without a confirmed appearance. PASS calls are excluded. Parlay tickets reconstruct the earlier default builder, before the later +800 Best Four rule; browser substitutions were not archived.`,
};
const output = path.join(root, 'artifacts/nfl-prop-dashboard/src/data/week10-history-snapshot.json');
fs.writeFileSync(output, `${JSON.stringify(history, null, 2)}\n`);
console.log(JSON.stringify({ output, allLeans: history.allLeans,
  highConfidence: history.highConfidence, topPicks: history.topPicks,
  ungraded: unresolved, parlays: parlays.map(({ name, outcome, legs }) =>
    ({ name, outcome, legs: legs.map(({ player, result }) => `${player}:${result}`) })) }, null, 2));
