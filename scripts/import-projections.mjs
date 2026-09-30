import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) {
  throw new Error('Usage: pnpm import:projections -- <current_projections.json>');
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
const week3Actuals = players.flatMap((player) => Object.values(player.stats ?? {}))
  .filter((stat) => Object.hasOwn(stat, 'week3Actual')).length;

if (teams.size !== 32) {
  throw new Error(`Expected 32 current teams, found ${teams.size}.`);
}
if (missingOpponents.length) {
  throw new Error(`Missing Week 4 opponents for ${missingOpponents.length} players.`);
}
if (week3Actuals < 300) {
  throw new Error(`Week 3 coverage is too low: ${week3Actuals} stat fields.`);
}

await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Imported ${players.length} players, 32 teams, and ${week3Actuals} Week 3 stat fields.`);
