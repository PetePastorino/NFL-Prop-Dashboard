import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const injuryPath = process.argv[2];
if (!injuryPath) {
  console.error('Usage: node scripts/apply-current-context.mjs <injury-report.txt>');
  process.exit(1);
}

const playerDataPath = path.join(
  repoRoot,
  'artifacts',
  'nfl-prop-dashboard',
  'src',
  'data',
  'player-data.json',
);
const depthPath = path.join(
  repoRoot,
  'artifacts',
  'nfl-prop-dashboard',
  'src',
  'data',
  'week6-rb-depth.json',
);

function normalized(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unavailable(status) {
  return /(?:^|\b)(?:out|doubtful|injured reserve|reserve-ret|ir|pup|nfi|suspended)(?:\b|$)/i.test(status ?? '');
}

function injuryRecords(source) {
  const records = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^(.+?)\t(QB|RB|WR|TE)\t([^\t]*)\t([^\t]+)(?:\t(.*))?$/);
    if (!match) continue;
    const [, name, position, estimatedReturn, status, comment = ''] = match;
    records.set(normalized(name), { position, estimatedReturn, status: status.trim(), comment: comment.trim() });
  }
  return records;
}

function currentSeasonActuals(stat) {
  return Object.entries(stat)
    .flatMap(([key, value]) => /^week\d+Actual$/.test(key) && typeof value === 'number' ? [value] : []);
}

const data = JSON.parse(fs.readFileSync(playerDataPath, 'utf8'));
const depth = JSON.parse(fs.readFileSync(depthPath, 'utf8'));
const injuries = injuryRecords(fs.readFileSync(path.resolve(injuryPath), 'utf8'));
const players = Object.values(data).flat();

for (const player of players) {
  const injury = injuries.get(normalized(player.name));
  player.injuryStatus = injury?.status ?? null;
  player.injury = injury?.comment || null;
}

const playersByName = new Map(players.map((player) => [normalized(player.name), player]));
const activeDepthByTeam = new Map();
for (const [team, names] of Object.entries(depth)) {
  const active = names.filter((name) => {
    const player = playersByName.get(normalized(name));
    const reportedInjury = injuries.get(normalized(name));
    return !unavailable(reportedInjury?.status ?? player?.injuryStatus);
  });
  activeDepthByTeam.set(team, new Map(active.map((name, index) => [normalized(name), index + 1])));
}

const adjustments = [];
for (const player of data.RB) {
  const stat = player.stats?.rush_yards;
  if (!stat || stat.rawProjection === null || stat.rawProjection === undefined) continue;
  const role = activeDepthByTeam.get(player.team)?.get(normalized(player.name)) ?? null;
  const actuals = currentSeasonActuals(stat);
  if (!role || actuals.length < 3) continue;

  const seasonAverage = actuals.reduce((sum, value) => sum + value, 0) / actuals.length;
  const baseSeasonWeight = Math.min(0.7, actuals.length / 8);
  const roleWeight = role === 1 ? 0 : role === 2 ? 0.15 : 0.25;
  const seasonWeight = Math.min(0.85, baseSeasonWeight + roleWeight);
  const blendedRaw = stat.rawProjection * (1 - seasonWeight) + seasonAverage * seasonWeight;
  const originalGameEnvironment = stat.gameEnvFactor ?? 1;
  const appliedGameEnvironment = Math.max(0.9, Math.min(1.1, originalGameEnvironment));
  const originalProjection = stat.projectionBeforeRoleAdjustment ?? stat.projection;
  const projection = Math.round(blendedRaw * appliedGameEnvironment * 10) / 10;

  stat.projectionBeforeRoleAdjustment = originalProjection;
  stat.projection = projection;
  stat.currentSeasonAvg = Math.round(seasonAverage * 10) / 10;
  stat.currentDepthRole = `RB${role}`;
  stat.currentSeasonWeight = Math.round(seasonWeight * 1000) / 1000;
  stat.appliedGameEnvFactor = Math.round(appliedGameEnvironment * 100) / 100;
  adjustments.push({
    player: player.name,
    team: player.team,
    role: `RB${role}`,
    originalProjection,
    projection,
    seasonAverage: Math.round(seasonAverage * 10) / 10,
    originalGameEnvironment,
    appliedGameEnvironment,
  });
}

fs.writeFileSync(playerDataPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ injuryMatches: [...injuries.keys()].filter((name) => playersByName.has(name)).length, adjustments }, null, 2));
