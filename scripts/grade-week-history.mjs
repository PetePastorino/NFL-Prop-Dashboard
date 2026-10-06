import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const resultsDir = process.argv[2];
const projectionsPath = process.argv[3];

if (!resultsDir) {
  console.error('Usage: node scripts/grade-week-history.mjs <results-directory> [projections-json]');
  process.exit(1);
}

const sourcePath = path.join(repoRoot, 'attached_assets', '0_prop_matchup_dashboard_(1)_1789679044969.jsx');
const linesPath = path.join(repoRoot, 'artifacts', 'nfl-prop-dashboard', 'src', 'data', 'initial-prop-lines.ts');

function normalized(value) {
  return value
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePlayerData(source) {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  const startMarker = 'const PLAYER_DATA = ';
  const endMarker = ';\n\nconst C';
  const start = normalizedSource.indexOf(startMarker);
  const end = normalizedSource.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('Could not locate PLAYER_DATA.');
  return JSON.parse(normalizedSource.slice(start + startMarker.length, end));
}

function parseInitialLines(source) {
  const match = source.match(/export const INITIAL_PROP_LINES = `([\s\S]*?)`;\s*$/);
  if (!match) throw new Error('Could not locate INITIAL_PROP_LINES.');
  return match[1];
}

const STAT_TYPES = {
  QB: [
    { key: 'pass_yards', label: 'Pass Yards' },
    { key: 'rush_yards', label: 'Rush Yards' },
  ],
  RB: [
    { key: 'rush_yards', label: 'Rush Yards' },
    { key: 'rec_yards', label: 'Rec Yards' },
    { key: 'receptions', label: 'Receptions' },
  ],
  WR: [
    { key: 'rec_yards', label: 'Rec Yards' },
    { key: 'receptions', label: 'Receptions' },
  ],
  TE: [
    { key: 'rec_yards', label: 'Rec Yards' },
    { key: 'receptions', label: 'Receptions' },
  ],
};

const STAT_ALIASES = {
  pass_yards: ['passing yards', 'pass yards', 'pass yds', 'passing yds', 'pass yard'],
  rush_yards: ['rushing yards', 'rush yards', 'rush yds', 'rushing yds', 'rush yard'],
  rec_yards: ['receiving yards', 'rec yards', 'receiving yds', 'rec yds', 'rec yard'],
  receptions: ['receptions', 'reception', 'catches', 'catch', 'rec pts', 'recpt'],
};

function statKeyFromText(value, position) {
  const availableStats = position ? STAT_TYPES[position] : Object.values(STAT_TYPES).flat();
  const normalizedValue = normalized(value);
  return availableStats
    .flatMap((stat) =>
      [stat.key, stat.label, ...(STAT_ALIASES[stat.key] ?? [])]
        .map((alias) => ({ key: stat.key, alias: normalized(alias) }))
        .filter(({ alias }) => alias && normalizedValue.includes(alias)),
    )
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.key;
}

function parseBulkLines(input, playerData) {
  const allPlayers = Object.entries(playerData).flatMap(([position, roster]) =>
    roster.map((player) => ({ position, player })),
  );
  const accepted = [];
  const errors = [];
  let currentStatKey;

  input
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const normalizedEntry = normalized(entry);
      const match = allPlayers
        .slice()
        .sort((a, b) => b.player.name.length - a.player.name.length)
        .find(({ player }) => {
          const playerName = normalized(player.name);
          return normalizedEntry.includes(playerName) ||
            normalizedEntry.replace(/\s/g, '').includes(playerName.replace(/\s/g, ''));
        });
      const headingStatKey = statKeyFromText(entry);
      if (!match && headingStatKey && /yards|receptions|reception/i.test(entry)) {
        currentStatKey = headingStatKey;
        return;
      }
      // Prefer the market explicitly named on each prop row. A remembered
      // section heading is only a fallback for rows that omit the market.
      // This prevents a Receptions heading from relabeling Receiving Yards
      // (and vice versa) when bulk input contains both markets.
      const statKey = match ? statKeyFromText(entry, match.position) ?? currentStatKey : undefined;
      const numbers = entry.match(/-?\d+(?:\.\d+)?/g);
      const line = numbers?.at(-1);

      if (!match) {
        errors.push(`Could not match a player: ${entry}`);
        return;
      }
      if (!statKey) {
        errors.push(`Could not match a stat: ${entry}`);
        return;
      }
      if (!line || Number.isNaN(Number(line))) {
        errors.push(`Could not find a prop line: ${entry}`);
        return;
      }
      if (!match.player.stats[statKey]?.projection && match.player.stats[statKey]?.projection !== 0) {
        errors.push(`No projection: ${entry}`);
        return;
      }
      accepted.push({
        key: `${match.position}:${statKey}:${match.player.name}`,
        line,
      });
    });

  return { accepted, errors };
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

function readActuals(directory) {
  const csvFiles = fs.readdirSync(directory).filter((name) => name.toLowerCase().endsWith('.csv')).sort();
  const actuals = new Map();
  const duplicates = [];
  for (const fileName of csvFiles) {
    const rows = fs.readFileSync(path.join(directory, fileName), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(2);
    for (const rowText of rows) {
      if (!rowText.trim()) continue;
      const row = parseCsvRow(rowText);
      if (row.length < 18) continue;
      const player = row[0]?.trim();
      const team = row[1]?.trim();
      if (!player || !team) continue;
      const key = normalized(player);
      const record = {
        player,
        team,
        fileName,
        pass_yards: Number(row[4] || 0),
        rush_yards: Number(row[12] || 0),
        receptions: Number(row[16] || 0),
        rec_yards: Number(row[17] || 0),
      };
      if (actuals.has(key)) duplicates.push({ key, first: actuals.get(key), second: record });
      else actuals.set(key, record);
    }
  }
  return { csvFiles, actuals, duplicates };
}

function leanFromLine(stat, line) {
  const lineValue = Number(line);
  const edge = stat.projection - lineValue;
  const edgePct = lineValue !== 0 ? edge / lineValue : 0;
  if (Math.abs(edgePct) < 0.04) return { lean: 'PASS', edge, edgePct };
  return { lean: edge > 0 ? 'OVER' : 'UNDER', edge, edgePct };
}

const CONFIDENCE_EDGE_TARGETS = {
  pass_yards: 30,
  rush_yards: 15,
  rec_yards: 15,
  receptions: 1.5,
};

function getConfidence(player, stat, line, statKey) {
  const lean = leanFromLine(stat, line);
  if (lean.lean === 'PASS') return { confidence: 'Low', confidenceScore: 0 };
  const edgeTarget = CONFIDENCE_EDGE_TARGETS[statKey] ?? 15;
  const relativeEdgeScore = Math.min(Math.abs(lean.edgePct) * 200, 50);
  const absoluteEdgeScore = Math.min((Math.abs(lean.edge) / edgeTarget) * 50, 50);
  const edgeScore = Math.min(relativeEdgeScore, absoluteEdgeScore);
  const historyScore = Math.min(stat.nPriorGames / 50, 1) * 35;
  const limitedHistoryPenalty = player.isLowConfidence ? 18 : 0;
  const injuryPenalty = player.injuryStatus ? 10 : 0;
  const confidenceScore = Math.max(
    0,
    Math.min(100, Math.round(edgeScore + historyScore + 15 - limitedHistoryPenalty - injuryPenalty)),
  );
  return { confidence: confidenceScore >= 72 ? 'High' : confidenceScore >= 48 ? 'Medium' : 'Low', confidenceScore };
}

function recordFor(props) {
  return props.reduce(
    (record, prop) => {
      if (prop.result === 'WIN') record.wins += 1;
      else if (prop.result === 'LOSS') record.losses += 1;
      else record.pushes += 1;
      return record;
    },
    { wins: 0, losses: 0, pushes: 0 },
  );
}

const playerData = projectionsPath
  ? JSON.parse(fs.readFileSync(path.resolve(projectionsPath), 'utf8'))
  : parsePlayerData(fs.readFileSync(sourcePath, 'utf8'));
const initialLines = parseInitialLines(fs.readFileSync(linesPath, 'utf8'));
const parsedLines = parseBulkLines(initialLines, playerData);
const lineMap = new Map(parsedLines.accepted.map(({ key, line }) => [key, line]));
const { csvFiles, actuals, duplicates } = readActuals(path.resolve(resultsDir));

const rankedProps = Object.entries(playerData)
  .flatMap(([position, roster]) => roster.flatMap((player) =>
    STAT_TYPES[position].flatMap((statDefinition) => {
      const key = `${position}:${statDefinition.key}:${player.name}`;
      const line = lineMap.get(key);
      const stat = player.stats[statDefinition.key];
      if (!line || !stat || stat.projection === null || stat.projection === undefined) return [];
      return [{
        key,
        position,
        statKey: statDefinition.key,
        statLabel: statDefinition.label,
        player,
        stat,
        line: Number(line),
        ...leanFromLine(stat, line),
        ...getConfidence(player, stat, line, statDefinition.key),
      }];
    }),
  ))
  .sort((a, b) => b.confidenceScore - a.confidenceScore);

const missingActuals = [];
const graded = rankedProps.flatMap((prop) => {
  const actual = actuals.get(normalized(prop.player.name));
  if (!actual) {
    missingActuals.push({
      player: prop.player.name,
      team: prop.player.team,
      position: prop.position,
      stat: prop.statLabel,
      line: prop.line,
      confidenceScore: prop.confidenceScore,
      lean: prop.lean,
    });
    return [];
  }
  const actualValue = actual[prop.statKey];
  const result = actualValue === prop.line
    ? 'PUSH'
    : prop.lean === 'OVER'
      ? actualValue > prop.line ? 'WIN' : 'LOSS'
      : prop.lean === 'UNDER'
        ? actualValue < prop.line ? 'WIN' : 'LOSS'
        : null;
  return [{
    key: prop.key,
    player: prop.player.name,
    position: prop.position,
    statKey: prop.statKey,
    stat: prop.statLabel,
    lean: prop.lean,
    line: prop.line,
    projection: prop.stat.projection,
    actual: actualValue,
    result,
    confidence: prop.confidence,
    confidenceScore: prop.confidenceScore,
    sourcePlayer: actual.player,
    sourceTeam: actual.team,
    sourceFile: actual.fileName,
  }];
});

const gradedNonPass = graded.filter((prop) => prop.lean !== 'PASS');
const topTenKeys = new Set(rankedProps.filter((prop) => prop.lean !== 'PASS').slice(0, 10).map((prop) => prop.key));
const rankedTopTen = gradedNonPass.filter((prop) => topTenKeys.has(prop.key));

console.log(JSON.stringify({
  files: csvFiles,
  fileCount: csvFiles.length,
  importedLines: parsedLines.accepted.length,
  lineErrors: parsedLines.errors,
  rankedPropCount: rankedProps.length,
  gradedPropCount: graded.length,
  passCount: graded.filter((prop) => prop.lean === 'PASS').length,
  allLeans: recordFor(gradedNonPass),
  highConfidence: recordFor(gradedNonPass.filter((prop) => prop.confidence === 'High')),
  topPicks: recordFor(rankedTopTen),
  topTen: rankedTopTen,
  missingActuals,
  duplicateActuals: duplicates,
}, null, 2));
