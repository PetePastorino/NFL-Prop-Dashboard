import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const resultsDir = process.argv[2];
if (!resultsDir) throw new Error('Usage: node scripts/generate-week8-history.mjs <week8-results-directory>');
const root = path.resolve(import.meta.dirname, '..');
const snapshotRef = '0bf4107'; // Last saved Week 8 lines and parlay builder before kickoff.
const linesPath = 'artifacts/nfl-prop-dashboard/src/data/week8-initial-prop-lines.ts';
const altPath = path.join(root, 'artifacts/nfl-prop-dashboard/src/data/week8-alternate-prop-lines.ts');
const gradeJson = execFileSync('node', [
  path.join(root, 'scripts/grade-week-history.mjs'), resultsDir,
  '--git-ref', snapshotRef, '--lines-file', linesPath,
], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const grade = JSON.parse(gradeJson);
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'week8-history-'));
const temporaryGradePath = path.join(temporaryDir, 'grade.json');
fs.writeFileSync(temporaryGradePath, gradeJson);
let parlay;
try {
  parlay = JSON.parse(execFileSync('node', [
    path.join(root, 'scripts/grade-parlay-history.mjs'), temporaryGradePath, altPath,
  ], { cwd: root, encoding: 'utf8' }));
} finally {
  fs.rmSync(temporaryDir, { recursive: true, force: true });
}

if (grade.fileCount !== 14 || grade.duplicateActuals.length) {
  throw new Error('Week 8 game files are incomplete or contain duplicate players.');
}
const missingTopTen = grade.rankedBoard
  .filter((prop) => prop.lean !== 'PASS')
  .filter((prop, index, board) => board.findIndex((candidate) => candidate.player === prop.player) === index)
  .slice(0, 10)
  .filter((prop) => !grade.topTen.some((graded) => graded.key === prop.key));
if (missingTopTen.length !== 1 || missingTopTen[0].player !== 'Jake Ferguson') {
  throw new Error(`Unexpected missing Top 10 legs: ${missingTopTen.map((prop) => prop.player).join(', ')}`);
}
if (parlay.bestFour.length !== 4 || parlay.saferFour.length !== 4) {
  throw new Error('Could not reconstruct both default four-leg parlays.');
}
const pick = ({ player, position, stat, lean, line, projection, actual, result }) =>
  ({ player, position, stat, lean, line, projection, actual, result });
const parlayLeg = ({ player, stat, lean, line, actual, status, odds }) => ({
  player, stat, lean, line, actual, result: status, ...(odds === undefined ? {} : { odds }),
});
const parlayRecord = (name, legs) => ({
  name,
  outcome: legs.some((leg) => leg.status === 'LOSS') ? 'MISSED'
    : legs.every((leg) => leg.status === 'WIN') ? 'HIT' : 'VOID',
  source: 'Saved default builder selections at pregame commit 0bf4107; user changes in the browser were not archived.',
  legs: legs.map(parlayLeg),
});
const week8 = {
  week: 8,
  season: 2026,
  label: 'October 29–November 2, 2026',
  gamesGraded: 14,
  gamesScheduled: 14,
  allLeans: grade.allLeans,
  highConfidence: grade.highConfidence,
  topPicks: grade.topPicks,
  topPickLimit: 10,
  highConfidencePicks: grade.highConfidencePicks.map(pick),
  parlays: [parlayRecord('Best Four', parlay.bestFour), parlayRecord('Safer Four', parlay.saferFour)],
  picks: grade.topTen.map(pick),
  note: 'All 14 games graded from supplied game logs against the saved pregame Week 8 lines. Top 10 finished 7–2 with Jake Ferguson void. PASS calls and players without a recorded appearance are excluded. Parlay results show the default builder tickets, not unrecorded user substitutions.',
};
const output = path.join(root, 'artifacts/nfl-prop-dashboard/src/data/week8-history-snapshot.json');
fs.writeFileSync(output, `${JSON.stringify(week8, null, 2)}\n`);
console.log(JSON.stringify({ output, all: grade.allLeans, high: grade.highConfidence,
  top: grade.topPicks, parlays: week8.parlays.map(({ name, outcome, legs }) => ({ name, outcome, legs: legs.map(({ result }) => result) })) }));
