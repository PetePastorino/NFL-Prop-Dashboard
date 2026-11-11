import playerData from '../artifacts/nfl-prop-dashboard/src/data/player-data.json' with { type: 'json' };

const TEAM_NAMES = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GNB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KAN', 'Las Vegas Raiders': 'LVR',
  'Los Angeles Chargers': 'LAC', 'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN', 'New England Patriots': 'NWE',
  'New Orleans Saints': 'NOR', 'New York Giants': 'NYG', 'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SFO', 'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TAM', 'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS',
};
const TEAM_ALIASES = { NE: 'NWE', GB: 'GNB', SF: 'SFO', KC: 'KAN', LV: 'LVR', NO: 'NOR', TB: 'TAM', WSH: 'WAS' };
const normalize = (value) => value.toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const players = Object.entries(playerData).flatMap(([position, roster]) =>
  roster.map((player) => ({ position, name: player.name, team: player.team, normalizedName: normalize(player.name), injuryStatus: player.injuryStatus })));
const playerByKey = new Map(players.map((player) => [`${player.team}:${player.normalizedName}`, player]));

function normalizeStatus(value) {
  const status = String(value ?? '').trim().toLowerCase().replace(/[.-]/g, ' ');
  if (['clear', 'cleared', 'active', 'healthy', 'none'].includes(status)) return null;
  if (['q', 'questionable'].includes(status)) return 'Questionable';
  if (['d', 'doubtful'].includes(status)) return 'Doubtful';
  if (['o', 'out'].includes(status)) return 'Out';
  if (['ir', 'injured reserve'].includes(status)) return 'Injured Reserve';
  if (['pup', 'physically unable to perform'].includes(status)) return 'PUP';
  if (['nfi', 'non football injury'].includes(status)) return 'NFI';
  if (status === 'suspended') return 'Suspended';
  return undefined;
}

function parseInjuryUpload(input) {
  if (typeof input !== 'string' || input.length > 300_000) throw new Error('File must be plain text and under 300 KB.');
  const rows = input.replace(/^\uFEFF/, '').split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  const header = rows.find((row) => /^player\tteam\tstatus(?:\t.*)?$/i.test(row));
  const espn = rows.some((row) => /^name\tpos\test\.? return date\tstatus\tcomment$/i.test(row));
  if (!header && !espn) throw new Error('Use Player, Team, Status tab-separated columns or the full team-by-team injury report.');
  const mode = espn ? 'full' : 'patch';
  const accepted = [];
  const skipped = [];
  let ignoredCount = 0;
  const seen = new Set();
  const teamsSeen = new Set();
  let currentTeam = null;
  for (const [index, raw] of rows.entries()) {
    if (mode === 'full') {
      if (TEAM_NAMES[raw]) { currentTeam = TEAM_NAMES[raw]; teamsSeen.add(currentTeam); continue; }
      if (/^name\tpos\t/i.test(raw) || !raw.includes('\t')) continue;
    } else if (raw === header || raw.startsWith('#')) continue;
    const cells = raw.split('\t').map((cell) => cell.trim());
    const [name, teamCell, statusCell] = mode === 'full'
      ? [cells[0], currentTeam, cells[3]]
      : cells;
    const team = TEAM_NAMES[teamCell] ?? TEAM_ALIASES[teamCell?.toUpperCase()] ?? teamCell?.toUpperCase();
    const status = normalizeStatus(statusCell);
    const player = playerByKey.get(`${team}:${normalize(name ?? '')}`);
    if (mode === 'full' && !player && status !== undefined) {
      ignoredCount++;
      continue;
    }
    let reason = '';
    if (mode === 'full' && (cells.length < 4 || !currentTeam)) reason = 'Missing team or injury columns';
    else if (mode === 'patch' && cells.length !== 3) reason = 'Expected three tab-separated columns';
    else if (status === undefined) reason = 'Unsupported status';
    else if (!player) reason = 'Player/team not in current model';
    const key = player ? `${player.team}:${player.name}` : '';
    if (!reason && seen.has(key)) reason = 'Duplicate player and team';
    if (reason) {
      skipped.push({ row: index + 1, player: name ?? '', team: team ?? '', reason });
      continue;
    }
    seen.add(key);
    accepted.push({ key, player: player.name, team: player.team, status });
  }
  if (mode === 'full' && teamsSeen.size !== Object.keys(TEAM_NAMES).length) {
    throw new Error('A full injury report must include all 32 team headings so missing players can be safely cleared. Use Player, Team, Status rows for a partial update.');
  }
  if (mode === 'patch' && !accepted.length) throw new Error('No injury rows matched a current player and team.');
  return { mode, accepted, skipped, ignoredCount, teamCount: teamsSeen.size };
}

function baselineInjuries() {
  return Object.fromEntries(players.filter((player) => player.injuryStatus).map((player) => [`${player.team}:${player.name}`, player.injuryStatus]));
}

function applyInjuryUpload(parsed, current) {
  const next = parsed.mode === 'full' ? {} : { ...current };
  for (const row of parsed.accepted) {
    if (row.status === null) delete next[row.key];
    else next[row.key] = row.status;
  }
  return next;
}

function injuryChanges(previous, next) {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .filter((key) => (previous[key] ?? null) !== (next[key] ?? null))
    .map((key) => {
      const [team, ...name] = key.split(':');
      return { key, team, player: name.join(':'), previous: previous[key] ?? null, status: next[key] ?? null };
    }).sort((a, b) => a.team.localeCompare(b.team) || a.player.localeCompare(b.player));
}

export { parseInjuryUpload, baselineInjuries, applyInjuryUpload, injuryChanges };
