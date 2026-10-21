import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile('artifacts/nfl-prop-dashboard/src/data/player-data.json', 'utf8'));
const sourcePath = process.argv[2] ?? 'artifacts/nfl-prop-dashboard/src/data/week7-initial-prop-lines.ts';
const source = await readFile(sourcePath, 'utf8');
const literalInput = source.match(/export const \w+\s*=\s*`([\s\S]*?)`/)?.[1];
const generatedSections = [
  ['passing', 'Passing Yards'],
  ['rushing', 'Rushing Yards'],
  ['receiving', 'Receiving Yards'],
  ['receptions', 'Receptions'],
].flatMap(([name, market]) => {
  const body = source.match(new RegExp(`const ${name}: Line\\[\\] = \\[([\\s\\S]*?)\\n\\];`))?.[1] ?? '';
  return [...body.matchAll(/\[(['"])(.*?)\1\s*,\s*(\d+(?:\.\d+)?)\]/g)]
    .map(([, , player, line]) => `${player} ${market} ${line}`);
});
const input = literalInput ?? generatedSections.join('\n');
const positions = ['QB', 'RB', 'WR', 'TE'];
const players = positions.flatMap((position) => data[position].map((player) => ({ position, player })));
const normalize = (value) => value.toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const marketFor = (line) => {
  const value = normalize(line);
  if (value.includes('passing yards')) return 'pass_yards';
  if (value.includes('rushing yards')) return 'rush_yards';
  if (value.includes('receiving yards')) return 'rec_yards';
  if (value.includes('receptions')) return 'receptions';
  return null;
};

const accepted = [];
const rejected = [];
for (const line of input.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
  const normalizedLine = normalize(line);
  const match = players.slice().sort((a, b) => b.player.name.length - a.player.name.length)
    .find(({ player }) => normalizedLine.includes(normalize(player.name)));
  const market = marketFor(line);
  if (!match) rejected.push(`${line} — player is not in the model`);
  else if (!market || match.player.stats?.[market]?.projection == null) rejected.push(`${line} — projection is unavailable`);
  else accepted.push(`${match.position}:${market}:${match.player.name}`);
}

const duplicates = accepted.filter((key, index) => accepted.indexOf(key) !== index);
const acceptedByMarket = Object.fromEntries(['pass_yards', 'rush_yards', 'rec_yards', 'receptions']
  .map((market) => [market, accepted.filter((key) => key.includes(`:${market}:`)).length]));
console.log(JSON.stringify({ total: accepted.length + rejected.length, accepted: accepted.length, acceptedByMarket, rejected, duplicates }, null, 2));
if (duplicates.length) process.exitCode = 1;
