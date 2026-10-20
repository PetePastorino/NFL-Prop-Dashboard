import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const resultsDir = process.argv[2];
const projectionsPath = process.argv[3];
const gitRefFlag = process.argv.indexOf('--git-ref');
const gitRef = gitRefFlag >= 0 ? process.argv[gitRefFlag + 1] : undefined;
let useLegacyConfidence = false;

if (!resultsDir) {
  console.error('Usage: node scripts/grade-week-history.mjs <results-directory> [projections-json] [--git-ref <ref>]');
  process.exit(1);
}

const sourcePath = path.join(repoRoot, 'attached_assets', '0_prop_matchup_dashboard_(1)_1789679044969.jsx');
const linesPath = path.join(repoRoot, 'artifacts', 'nfl-prop-dashboard', 'src', 'data', 'initial-prop-lines.ts');
const hybridCalibration = JSON.parse(fs.readFileSync(
  path.join(repoRoot, 'artifacts', 'nfl-prop-dashboard', 'src', 'data', 'hybrid-confidence-calibration.json'),
  'utf8',
));
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

function readGitFile(filePath) {
  return execFileSync('git', ['show', `${gitRef}:${filePath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function playerDataForGitRef() {
  const dataPath = 'artifacts/nfl-prop-dashboard/src/data/player-data.json';
  try {
    return JSON.parse(readGitFile(dataPath));
  } catch {
    useLegacyConfidence = true;
    return parsePlayerData(readGitFile('attached_assets/0_prop_matchup_dashboard_(1)_1789679044969.jsx'));
  }
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
  if (useLegacyConfidence) {
    if (lean.edgePct === null || lean.edge === null) return { confidence: 'Low', confidenceScore: 0 };
    const edgeScore = Math.min(Math.abs(lean.edgePct) * 100, 32);
    const historyScore = Math.min(stat.nPriorGames / 50, 1) * 42;
    const limitedHistoryPenalty = player.isLowConfidence ? 18 : 0;
    const injuryPenalty = player.injuryStatus ? 10 : 0;
    const confidenceScore = Math.max(
      0,
      Math.min(100, Math.round(edgeScore + historyScore + 26 - limitedHistoryPenalty - injuryPenalty)),
    );
    return {
      confidence: confidenceScore >= 72 ? 'High' : confidenceScore >= 48 ? 'Medium' : 'Low',
      confidenceScore,
    };
  }
  return { confidence: 'Low', confidenceScore: 0 };
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

function confidenceLabel(score) {
  return score >= 72 ? 'High' : score >= 48 ? 'Medium' : 'Low';
}

function hybridConfidenceScore(prop) {
  if (prop.lean === 'PASS') return 0;
  const edge = Math.abs(prop.edge ?? 0);
  const edgePct = Math.abs(prop.edgePct ?? 0);
  const propCalibration = hybridCalibration.propMae[prop.statKey] ?? { mean: hybridCalibration.globalMae, count: 0 };
  const propMae = (
    propCalibration.count * propCalibration.mean + 60 * hybridCalibration.globalMae
  ) / (propCalibration.count + 60);
  const segmentCalibration = hybridCalibration.segmentMae[`${prop.statKey}|${prop.lean}`] ?? { mean: propMae, count: 0 };
  const expectedError = (
    segmentCalibration.count * segmentCalibration.mean + 30 * propMae
  ) / (segmentCalibration.count + 30);
  const standardizedEdge = edge / Math.max(expectedError, 0.25);
  const errorAdjustedScore = 100 * (1 - Math.exp(-1.273 * standardizedEdge));
  const edgeBand = edgePct < 0.10 ? '4-10' : edgePct < 0.18 ? '10-18' : edgePct < 0.30 ? '18-30' : '30+';
  const reliability = hybridCalibration.reliability[`${prop.statKey}|${prop.lean}|${edgeBand}`] ?? { wins: 0, count: 0 };
  const reliableRate = (
    reliability.wins + 40 * hybridCalibration.breakevenRate
  ) / (reliability.count + 40);
  const reliabilityScore = Math.max(20, Math.min(80, 50 + 200 * (reliableRate - hybridCalibration.breakevenRate)));
  const historyScore = Math.min(prop.stat.nPriorGames / 50, 1) * 42;
  const earlyScore = Math.max(0, Math.min(100, Math.round(
    Math.min(edgePct * 100, 32) + historyScore + 26
    - (prop.player.isLowConfidence || prop.stat.lowConfidence ? 18 : 0)
    - (prop.player.injuryStatus ? 10 : 0),
  )));
  let score = 1.08 * (0.45 * earlyScore + 0.35 * errorAdjustedScore + 0.20 * reliabilityScore);
  const baselines = [prop.stat.priorAvg, prop.stat.priorLast5].filter((value) => Number.isFinite(value));
  if (baselines.length) {
    const baseline = baselines.reduce((total, value) => total + value, 0) / baselines.length;
    const outlierRatio = Math.abs(prop.stat.projection - baseline) / Math.max(expectedError, 0.25);
    if (outlierRatio > 2.5) score = Math.min(score, 79);
    else if (outlierRatio > 1.5) score = Math.min(score, 89);
  }
  if (reliableRate < 0.50) score = Math.min(score, 71);
  if (prop.player.isLowConfidence || prop.stat.lowConfidence) score = Math.min(score, 74);
  if (prop.player.injuryStatus) score = Math.min(score, 79);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function spreadBoardStrengthScores(props) {
  return props.map((prop) => {
    const confidenceScore = hybridConfidenceScore(prop);
    return {
      ...prop,
      confidence: confidenceLabel(confidenceScore),
      confidenceScore,
    };
  }).sort((a, b) =>
    b.confidenceScore - a.confidenceScore
    || Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0)
    || a.key.localeCompare(b.key),
  );
}

function strongestPropPerPlayer(props) {
  const includedPlayers = new Set();
  return props.filter((prop) => {
    const playerKey = normalized(prop.player.name);
    if (includedPlayers.has(playerKey)) return false;
    includedPlayers.add(playerKey);
    return true;
  });
}

const playerData = gitRef
  ? playerDataForGitRef()
  : projectionsPath
    ? JSON.parse(fs.readFileSync(path.resolve(projectionsPath), 'utf8'))
    : parsePlayerData(fs.readFileSync(sourcePath, 'utf8'));
const initialLines = parseInitialLines(
  gitRef
    ? readGitFile('artifacts/nfl-prop-dashboard/src/data/initial-prop-lines.ts')
    : fs.readFileSync(linesPath, 'utf8'),
);
const parsedLines = parseBulkLines(initialLines, playerData);
const lineMap = new Map(parsedLines.accepted.map(({ key, line }) => [key, line]));
const { csvFiles, actuals, duplicates } = readActuals(path.resolve(resultsDir));

const rankedProps = spreadBoardStrengthScores(Object.entries(playerData)
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
  )));

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
const topTenKeys = new Set(
  strongestPropPerPlayer(rankedProps.filter((prop) => prop.lean !== 'PASS'))
    .slice(0, 10)
    .map((prop) => prop.key),
);
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
  highConfidencePicks: gradedNonPass.filter((prop) => prop.confidence === 'High'),
  topPicks: recordFor(rankedTopTen),
  topTen: rankedTopTen,
  missingActuals,
  duplicateActuals: duplicates,
}, null, 2));
