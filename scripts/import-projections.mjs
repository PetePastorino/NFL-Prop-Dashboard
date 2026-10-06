import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) {
  throw new Error('Usage: pnpm run import:projections <current_projections.json>');
}

const inputPath = resolve(source);
const outputPath = resolve('artifacts/nfl-prop-dashboard/src/data/player-data.json');
const data = JSON.parse(await readFile(inputPath, 'utf8'));
const positions = ['QB', 'RB', 'WR', 'TE'];

for (const position of positions) {
  if (!Array.isArray(data[position]) || data[position].length === 0) {
    throw new Error(`Projection input is missing ${position} players.`);
  }
}

const players = positions.flatMap((position) => data[position]);
const teams = new Set(players.map((player) => player.team));
const missingOpponents = players.filter((player) => !player.week2Opp);
const byeTeams = new Set(['CAR', 'KAN']);
const invalidMissingOpponents = missingOpponents.filter((player) => !byeTeams.has(player.team));
const week3Actuals = players.flatMap((player) => Object.values(player.stats ?? {}))
  .filter((stat) => Object.hasOwn(stat, 'week3Actual')).length;
const week4Actuals = players.flatMap((player) => Object.values(player.stats ?? {}))
  .filter((stat) => Object.hasOwn(stat, 'week4Actual')).length;

if (teams.size !== 32) {
  throw new Error(`Expected 32 current teams, found ${teams.size}.`);
}
if (invalidMissingOpponents.length) {
  throw new Error(`Missing Week 5 opponents for ${invalidMissingOpponents.length} non-bye players.`);
}
if (week3Actuals < 300) {
  throw new Error(`Week 3 coverage is too low: ${week3Actuals} stat fields.`);
}
if (week4Actuals < 300) {
  throw new Error(`Week 4 coverage is too low: ${week4Actuals} stat fields.`);
}

await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Imported ${players.length} players, 32 teams, ${week3Actuals} Week 3 stat fields, and ${week4Actuals} Week 4 stat fields. ${missingOpponents.length} players are on the two expected bye teams.`);
