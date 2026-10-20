import fs from 'node:fs';
import path from 'node:path';

const schedulePath = process.argv[2];
const playerDataPath = process.argv[3];

if (!schedulePath || !playerDataPath) {
  console.error('Usage: node scripts/apply-week-schedule.mjs <schedule-json> <player-data-json>');
  process.exit(1);
}

const schedule = JSON.parse(fs.readFileSync(path.resolve(schedulePath), 'utf8'));
const playerData = JSON.parse(fs.readFileSync(path.resolve(playerDataPath), 'utf8'));
const matchups = new Map();

for (const game of schedule.games) {
  if (matchups.has(game.away) || matchups.has(game.home)) {
    throw new Error(`Duplicate team in Week ${schedule.week} schedule: ${game.away} at ${game.home}`);
  }
  matchups.set(game.away, { opponent: game.home, isHome: game.neutralSite ? null : false });
  matchups.set(game.home, { opponent: game.away, isHome: game.neutralSite ? null : true });
}

const teamCounts = new Map();
let playersUpdated = 0;
let playersOnBye = 0;

for (const roster of Object.values(playerData)) {
  for (const player of roster) {
    const matchup = matchups.get(player.team);
    player.week2Opp = matchup?.opponent ?? null;
    if (matchup) playersUpdated += 1;
    else playersOnBye += 1;
    teamCounts.set(player.team, (teamCounts.get(player.team) ?? 0) + 1);
    for (const stat of Object.values(player.stats)) {
      if (stat && typeof stat === 'object' && 'isHome' in stat) {
        stat.isHome = matchup?.isHome ?? null;
      }
    }
  }
}

const scheduledTeams = [...matchups.keys()].sort();
const absentFromPlayerData = scheduledTeams.filter((team) => !teamCounts.has(team));
const byeTeams = [...teamCounts.keys()].filter((team) => !matchups.has(team)).sort();

if (scheduledTeams.length !== schedule.games.length * 2) {
  throw new Error('Schedule validation failed: expected two unique teams per game.');
}
if (absentFromPlayerData.length) {
  throw new Error(`Scheduled teams missing from player data: ${absentFromPlayerData.join(', ')}`);
}

fs.writeFileSync(path.resolve(playerDataPath), `${JSON.stringify(playerData, null, 2)}\n`);
console.log(JSON.stringify({
  week: schedule.week,
  games: schedule.games.length,
  scheduledTeams: scheduledTeams.length,
  playersUpdated,
  playersOnBye,
  byeTeams,
}, null, 2));
