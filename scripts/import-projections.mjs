import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2];
if (!source) throw new Error('Usage: pnpm run import:projections <current_projections.json>');

const inputPath = resolve(source);
const outputPath = resolve('artifacts/nfl-prop-dashboard/src/data/player-data.json');
const data = JSON.parse(await readFile(inputPath, 'utf8'));
const existing = JSON.parse(await readFile(outputPath, 'utf8'));
const positions = ['QB', 'RB', 'WR', 'TE'];
const actualKeys = ['week1Actual', 'week2Actual', 'week3Actual', 'week4Actual', 'week5Actual'];

for (const position of positions) {
  if (!Array.isArray(data[position]) || data[position].length === 0) {
    throw new Error(`Projection input is missing ${position} players.`);
  }
}

const existingPlayers = positions.flatMap((position) => existing[position] ?? []);
const existingByName = new Map(existingPlayers.map((player) => [player.name, player]));
const injuries = new Map(
  positions
    .flatMap((position) => data[position])
    .filter((player) => player.injuryStatus)
    .map((player) => [player.name, [player.injuryStatus, player.injury]]),
);

for (const position of positions) {
  for (const player of data[position]) {
    const previous = existingByName.get(player.name);
    for (const [statKey, stat] of Object.entries(player.stats ?? {})) {
      const previousStat = previous?.stats?.[statKey];
      if (!previousStat) continue;
      for (const actualKey of actualKeys) {
        if (Object.hasOwn(previousStat, actualKey)) stat[actualKey] = previousStat[actualKey];
      }
    }
    const injury = injuries.get(player.name);
    player.injuryStatus = injury?.[0] ?? null;
    player.injury = injury?.[1] ?? null;
  }
}

const importedNames = new Set(positions.flatMap((position) => data[position].map((player) => player.name)));
for (const position of positions) {
  for (const player of existing[position] ?? []) {
    if (importedNames.has(player.name)) continue;
    const preserved = structuredClone(player);
    preserved.isLowConfidence = true;
    preserved.week2Opp = preserved.team === 'TEN' ? 'IND' : '';
    preserved.injuryStatus = injuries.get(preserved.name)?.[0] ?? null;
    preserved.injury = injuries.get(preserved.name)?.[1] ?? null;
    for (const stat of Object.values(preserved.stats ?? {})) {
      if (Object.hasOwn(stat, 'projection')) stat.projection = null;
      if (Object.hasOwn(stat, 'rawProjection')) stat.rawProjection = null;
      stat.lowConfidence = true;
      stat.isHome = false;
    }
    data[position].push(preserved);
  }
}

const players = positions.flatMap((position) => data[position]);
const teams = new Set(players.map((player) => player.team));
const missingOpponents = players.filter((player) => !player.week2Opp);
const byeTeams = new Set(['CIN', 'DET', 'MIA', 'MIN']);
const invalidMissingOpponents = missingOpponents.filter((player) => !byeTeams.has(player.team));
const actualCounts = Object.fromEntries(actualKeys.map((actualKey) => [actualKey,
  players.flatMap((player) => Object.values(player.stats ?? {}))
    .filter((stat) => Object.hasOwn(stat, actualKey)).length]));

if (teams.size !== 32) throw new Error(`Expected 32 current teams, found ${teams.size}.`);
if (invalidMissingOpponents.length) {
  throw new Error(`Missing Week 6 opponents for ${invalidMissingOpponents.length} non-bye players.`);
}
for (const [actualKey, minimum] of Object.entries({ week1Actual: 350, week2Actual: 330, week3Actual: 330, week4Actual: 310, week5Actual: 270 })) {
  if (actualCounts[actualKey] < minimum) {
    throw new Error(`${actualKey} coverage is too low: ${actualCounts[actualKey]} stat fields.`);
  }
}

await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(`Imported ${players.length} players across 32 teams with Week 1-5 history. ${missingOpponents.length} players are on the four expected bye teams.`);
