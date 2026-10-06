import fs from 'node:fs';
import path from 'node:path';

const resultsDir = process.argv[2];
const playerDataPath = process.argv[3];
const week = Number(process.argv[4]);

if (!resultsDir || !playerDataPath || !Number.isInteger(week)) {
  console.error('Usage: node scripts/import-week-actuals.mjs <results-directory> <player-data-json> <week>');
  process.exit(1);
}

function normalized(value) {
  return value
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvRow(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  fields.push(value);
  return fields;
}

const actuals = new Map();
const files = fs.readdirSync(resultsDir).filter((name) => name.toLowerCase().endsWith('.csv')).sort();
for (const file of files) {
  const rows = fs.readFileSync(path.join(resultsDir, file), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(2);
  for (const rowText of rows) {
    if (!rowText.trim()) continue;
    const row = parseCsvRow(rowText);
    if (row.length < 18 || !row[0]?.trim() || !row[1]?.trim()) continue;
    actuals.set(normalized(row[0]), {
      pass_yards: Number(row[4] || 0),
      rush_yards: Number(row[12] || 0),
      receptions: Number(row[16] || 0),
      rec_yards: Number(row[17] || 0),
    });
  }
}

const playerData = JSON.parse(fs.readFileSync(playerDataPath, 'utf8'));
let playersUpdated = 0;
let statFieldsUpdated = 0;
for (const roster of Object.values(playerData)) {
  for (const player of roster) {
    const actual = actuals.get(normalized(player.name));
    if (!actual) continue;
    playersUpdated += 1;
    for (const [statKey, stat] of Object.entries(player.stats)) {
      if (!(statKey in actual)) continue;
      stat[`week${week}Actual`] = actual[statKey];
      statFieldsUpdated += 1;
    }
  }
}

fs.writeFileSync(playerDataPath, `${JSON.stringify(playerData, null, 2)}\n`);
console.log(JSON.stringify({ week, files: files.length, sourcePlayers: actuals.size, playersUpdated, statFieldsUpdated }, null, 2));
