import fs from 'node:fs';
import path from 'node:path';

const [sourceDirectory, playerDataPath, schedulePath] = process.argv.slice(2);
if (!sourceDirectory || !playerDataPath || !schedulePath) {
  throw new Error('Usage: node scripts/import-player-game-logs.mjs <csv-directory> <player-data-json> <week-schedule-json>');
}

const positions = {
  QB: ['JJ McCarthy', 'Tanner McKee'],
  RB: ['Devin Singletary', 'Dylan Sampson', 'Emmett Johnson', 'Jonah Coleman', 'Josh Jacobs', 'Mike Washington', 'Tyrone Tracy'],
  WR: ['Adonai Mitchell', 'Antonio Williams', 'Caleb Douglas', 'Efton Chism', 'Isaac Teslaa', 'Jalen Brooks', 'Jaylin Noel', 'Konata Mumpfield', 'Kyle Williams', 'Marvin Mims', 'Savion Williams', 'Tank Dell', 'Tory Horton', 'Troy Franklin', 'Xavier Hutchinson'],
  TE: ['Colby Parkinson', 'Cole Kmet', 'Eli Raridon', 'Elijah Higgins', 'Foster Moreau', 'Greg Dulcich', 'Kenyon Sadiq', 'Noah Fant', 'Tommy Tremble'],
};
const statColumns = {
  QB: { pass_yards: ['Passing', 'Yds'], rush_yards: ['Rushing', 'Yds'] },
  RB: { rush_yards: ['Rushing', 'Yds'], rec_yards: ['Receiving', 'Yds'], receptions: ['Receiving', 'Rec'] },
  WR: { rec_yards: ['Receiving', 'Yds'], receptions: ['Receiving', 'Rec'] },
  TE: { rec_yards: ['Receiving', 'Yds'], receptions: ['Receiving', 'Rec'] },
};
const expectedNames = Object.values(positions).flat();
const sourceFiles = fs.readdirSync(sourceDirectory).filter((name) => name.endsWith('.csv'));
if (expectedNames.length !== 33 || sourceFiles.length !== 33) {
  throw new Error(`Expected exactly 33 named players and 33 source CSVs; found ${expectedNames.length} and ${sourceFiles.length}.`);
}
const expectedFiles = new Set(expectedNames.map((name) => `${name}.csv`));
const unexpected = sourceFiles.filter((name) => !expectedFiles.has(name));
if (unexpected.length) throw new Error(`Unexpected player files: ${unexpected.join(', ')}`);

const data = JSON.parse(fs.readFileSync(playerDataPath, 'utf8'));
const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
if (schedule.season !== 2026 || schedule.week !== 9) throw new Error('Expected the 2026 Week 9 schedule.');
const matchups = new Map();
for (const game of schedule.games) {
  matchups.set(game.away, { opponent: game.home, isHome: game.neutralSite ? null : false });
  matchups.set(game.home, { opponent: game.away, isHome: game.neutralSite ? null : true });
}
const existing = new Set(Object.values(data).flat().map((player) => player.name.toLowerCase().replace(/[^a-z0-9]/g, '')));
const round = (number) => Math.round(number * 10) / 10;
const additions = [];

for (const [position, names] of Object.entries(positions)) {
  for (const name of names) {
    if (existing.has(name.toLowerCase().replace(/[^a-z0-9]/g, ''))) throw new Error(`${name} is already in the model set.`);
    const lines = fs.readFileSync(path.join(sourceDirectory, `${name}.csv`), 'utf8').trim().split(/\r?\n/);
    const groups = lines[0].split(',');
    const headers = lines[1].split(',');
    const indexes = Object.fromEntries(Object.entries(statColumns[position]).map(([key, [group, header]]) => {
      const index = headers.findIndex((value, i) => value === header && groups[i] === group);
      if (index < 0) throw new Error(`${name} lacks ${group} ${header}.`);
      return [key, index];
    }));
    const rows = lines.slice(2).filter((line) => /^\d+,/.test(line)).map((line) => {
      const cells = line.split(',');
      if (cells.length !== headers.length) throw new Error(`${name} has a malformed game row.`);
      const date = cells[4];
      if (!/^20\d\d-\d\d-\d\d$/.test(date) || date > '2026-11-03') throw new Error(`${name} has an invalid or future game date: ${date}`);
      const values = Object.fromEntries(Object.entries(indexes).map(([key, index]) => {
        const value = cells[index] === '' ? 0 : Number(cells[index]);
        if (!Number.isFinite(value)) throw new Error(`${name} has an invalid ${key} on ${date}.`);
        return [key, value];
      }));
      return { date, season: Number(date.slice(0, 4)), week: Number(cells[3]), team: cells[5], values };
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length || !rows.some((row) => row.season === 2026)) throw new Error(`${name} has no 2026 games.`);
    const currentTeam = rows.filter((row) => row.season === 2026).at(-1).team;
    const matchup = matchups.get(currentTeam);
    if (!matchup) throw new Error(`${name} has unscheduled Week 9 team ${currentTeam}.`);
    const isLowConfidence = rows.length < 8;
    const stats = Object.fromEntries(Object.keys(indexes).map((key) => {
      const values = rows.map((row) => row.values[key]);
      const stat = {
        projection: null,
        rawProjection: null,
        lowConfidence: isLowConfidence,
        nPriorGames: rows.length,
        priorAvg: round(values.reduce((sum, value) => sum + value, 0) / values.length),
        priorLast5: round(values.slice(-5).reduce((sum, value) => sum + value, 0) / Math.min(values.length, 5)),
        matchupFactor: null,
        isHome: matchup.isHome,
      };
      const seenWeeks = new Set();
      for (const row of rows.filter((game) => game.season === 2026 && game.week <= 8)) {
        if (seenWeeks.has(row.week)) throw new Error(`${name} has duplicate 2026 Week ${row.week} games.`);
        seenWeeks.add(row.week);
        stat[`week${row.week}Actual`] = row.values[key];
      }
      return [key, stat];
    }));
    additions.push({ position, player: { name, team: currentTeam, week2Opp: matchup.opponent, isLowConfidence, injuryStatus: null, injury: null, stats } });
  }
}

for (const { position, player } of additions) data[position].push(player);
fs.writeFileSync(playerDataPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ added: additions.length, totalPlayers: Object.values(data).flat().length, byPosition: Object.fromEntries(Object.keys(positions).map((position) => [position, data[position].length])), limitedHistory: additions.filter(({ player }) => player.isLowConfidence).map(({ player }) => player.name) }, null, 2));
