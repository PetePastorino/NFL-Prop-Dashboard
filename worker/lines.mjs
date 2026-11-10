import playerData from '../artifacts/nfl-prop-dashboard/src/data/player-data.json' with { type: 'json' };
import schedule from '../artifacts/nfl-prop-dashboard/src/data/week10-schedule.json' with { type: 'json' };

const WEEK = `${schedule.season}-${schedule.week}`;
const MARKETS = {
  'Passing Yards': 'pass_yards',
  'Rushing Yards': 'rush_yards',
  'Receiving Yards': 'rec_yards',
  Receptions: 'receptions',
};
const TEAM_ALIASES = { NE: 'NWE', GB: 'GNB', SF: 'SFO', KC: 'KAN', LV: 'LVR', NO: 'NOR', TB: 'TAM', LA: 'LAR', WSH: 'WAS' };
const ACTIVE_TEAMS = new Set(schedule.games.flatMap((game) => [game.away, game.home]));
const normalize = (value) => value.toLowerCase().replace(/[.'’]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const players = Object.entries(playerData).flatMap(([position, roster]) =>
  roster.map((player) => ({ position, ...player, normalizedName: normalize(player.name) })));

function lockedThursdayTeams(now = new Date()) {
  const easternParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const easternDate = `${easternParts.year}-${easternParts.month}-${easternParts.day}`;
  const locked = new Set();
  for (const game of schedule.games) {
    if (new Date(`${game.date}T00:00:00Z`).getUTCDay() !== 4) continue;
    if (easternDate > game.date || (easternDate === game.date && Number(easternParts.hour) >= 20)) {
      locked.add(game.away);
      locked.add(game.home);
    }
  }
  return locked;
}

function preserveLockedLines(restored, current, now = new Date()) {
  const lockedTeams = lockedThursdayTeams(now);
  const next = { ...restored };
  for (const player of players) {
    if (!lockedTeams.has(player.team)) continue;
    for (const statKey of Object.values(MARKETS)) {
      const key = `${player.position}:${statKey}:${player.name}`;
      if (Object.hasOwn(current, key)) next[key] = current[key];
      else delete next[key];
    }
  }
  return next;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function parseUpload(input, now = new Date()) {
  if (typeof input !== 'string' || input.length > 300_000) throw new Error('File must be plain text and under 300 KB.');
  const rows = input.replace(/^\uFEFF/, '').split(/\r?\n/).map((row) => row.trim()).filter((row) => row && !row.startsWith('#'));
  if (rows.length < 2) throw new Error('The file has no prop rows.');
  const header = rows.shift().split('\t').map((cell) => cell.trim().toLowerCase());
  if (header.join('|') !== 'player|team|prop|line|over odds|under odds') {
    throw new Error('Expected tab-separated columns: Player, Team, Prop, Line, Over odds, Under odds.');
  }
  const accepted = [];
  const skipped = [];
  const seen = new Set();
  const lockedTeams = lockedThursdayTeams(now);
  for (const [index, raw] of rows.entries()) {
    const cells = raw.split('\t').map((cell) => cell.trim());
    const [name, team, market, line, overOdds, underOdds] = cells;
    const statKey = MARKETS[market];
    const normalizedTeam = TEAM_ALIASES[team?.toUpperCase()] ?? team?.toUpperCase();
    const matches = players.filter((player) => player.normalizedName === normalize(name ?? '') && player.team === normalizedTeam);
    const oddsValid = (value) => value === '' || /^[+-](?:[1-9]\d{2,})$/.test(value);
    const validLine = /^\d+(?:\.5)?$/.test(line ?? '') && Number.isFinite(Number(line));
    let reason = '';
    if (cells.length !== 6) reason = 'Expected six tab-separated columns';
    else if (!statKey) reason = 'Unsupported prop type';
    else if (!validLine) reason = 'Invalid line';
    else if (!oddsValid(overOdds) || !oddsValid(underOdds)) reason = 'Invalid American odds';
    else if (matches.length !== 1) reason = matches.length ? 'Ambiguous player/team' : 'Player/team not in current model';
    else if (!ACTIVE_TEAMS.has(normalizedTeam)) reason = 'Team is on bye this week';
    else if (!matches[0].stats?.[statKey]) reason = 'This prop is not tracked for the player';
    else if (lockedTeams.has(normalizedTeam)) reason = 'Thursday game locked since 8:00 PM Eastern';
    const key = !reason ? `${matches[0].position}:${statKey}:${matches[0].name}` : '';
    if (!reason && seen.has(key)) reason = 'Duplicate player and prop';
    if (reason) {
      skipped.push({ row: index + 2, player: name ?? '', team: team ?? '', prop: market ?? '', reason });
      continue;
    }
    seen.add(key);
    accepted.push({ key, player: matches[0].name, team: normalizedTeam, prop: market, line, overOdds: overOdds || null, underOdds: underOdds || null });
  }
  if (!accepted.length && !skipped.some((row) => row.reason.startsWith('Thursday game locked'))) {
    throw new Error('No rows matched a current player and prop.');
  }
  return { accepted, skipped };
}

async function isAdmin(request, env) {
  const authorization = request.headers.get('Authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!supplied || supplied.length > 128 || !env.UPLOAD_PASSWORD) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.UPLOAD_PASSWORD)),
  ]);
  const suppliedHash = new Uint8Array(left);
  const expectedHash = new Uint8Array(right);
  let different = 0;
  for (let i = 0; i < suppliedHash.length; i++) different |= suppliedHash[i] ^ expectedHash[i];
  return different === 0;
}

async function ensureSchema(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS prop_line_state (week TEXT PRIMARY KEY, version TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
  await db.exec('CREATE TABLE IF NOT EXISTS prop_line_versions (id TEXT PRIMARY KEY, week TEXT NOT NULL, created_at TEXT NOT NULL, uploader TEXT NOT NULL, kind TEXT NOT NULL, changed_count INTEGER NOT NULL, payload TEXT NOT NULL)');
}

async function currentState(db) {
  try {
    const state = await db.prepare('SELECT version, payload, updated_at FROM prop_line_state WHERE week = ?').bind(WEEK).first();
    return state ? { version: state.version, lines: JSON.parse(state.payload), updatedAt: state.updated_at } : { version: null, lines: {}, updatedAt: null };
  } catch (error) {
    if (/no such table/i.test(String(error))) return { version: null, lines: {}, updatedAt: null };
    throw error;
  }
}

async function saveState(db, lines, uploader, kind, changedCount, createBaseline = false) {
  const version = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = JSON.stringify(lines);
  const statements = [];
  if (createBaseline) {
    statements.push(db.prepare('INSERT INTO prop_line_versions (id, week, created_at, uploader, kind, changed_count, payload) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), WEEK, now, uploader, 'baseline', 0, '{}'));
  }
  statements.push(
    db.prepare('INSERT INTO prop_line_versions (id, week, created_at, uploader, kind, changed_count, payload) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(version, WEEK, now, uploader, kind, changedCount, payload),
    db.prepare('INSERT INTO prop_line_state (week, version, payload, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(week) DO UPDATE SET version = excluded.version, payload = excluded.payload, updated_at = excluded.updated_at').bind(WEEK, version, payload, now),
  );
  await db.batch(statements);
  return { version, updatedAt: now };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.DB) return json({ error: 'Shared line storage is not configured.' }, 503);
    if (url.pathname === '/api/lines' && request.method === 'GET') {
      const state = await currentState(env.DB);
      return json({ week: WEEK, ...state });
    }
    if (!url.pathname.startsWith('/api/admin/')) return json({ error: 'Not found.' }, 404);
    if (!env.UPLOAD_PASSWORD) return json({ error: 'Upload password is not configured on the server.' }, 503);
    if (!await isAdmin(request, env)) return json({ error: 'Incorrect upload password.' }, 403);
    const uploader = env.ADMIN_EMAIL ?? 'Pete';
    if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return json({ error: 'Invalid request origin.' }, 403);
    if (url.pathname === '/api/admin/state' && request.method === 'GET') {
      await ensureSchema(env.DB);
      const state = await currentState(env.DB);
      const versions = await env.DB.prepare('SELECT id, created_at, uploader, kind, changed_count FROM prop_line_versions WHERE week = ? ORDER BY created_at DESC LIMIT 20').bind(WEEK).all();
      return json({ week: WEEK, ...state, versions: versions.results });
    }
    if (url.pathname === '/api/admin/preview' && request.method === 'POST') {
      try {
        const parsed = parseUpload(await request.text());
        return json({ week: WEEK, ...parsed });
      } catch (error) { return json({ error: String(error.message ?? error) }, 400); }
    }
    if (url.pathname === '/api/admin/apply' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (body.week !== WEEK || typeof body.text !== 'string') return json({ error: 'Wrong week or file format.' }, 400);
        await ensureSchema(env.DB);
        const state = await currentState(env.DB);
        if (body.expectedVersion !== state.version) return json({ error: 'Lines changed since preview. Reload and review again.' }, 409);
        const parsed = parseUpload(body.text);
        if (!parsed.accepted.length) return json({ error: 'No editable lines in this file. Thursday game lines are locked after 8:00 PM Eastern.' }, 400);
        const merged = { ...state.lines };
        for (const row of parsed.accepted) merged[row.key] = { line: row.line, overOdds: row.overOdds, underOdds: row.underOdds };
        const saved = await saveState(env.DB, merged, uploader, 'upload', parsed.accepted.length, state.version === null);
        return json({ week: WEEK, ...saved, acceptedCount: parsed.accepted.length, skippedCount: parsed.skipped.length });
      } catch (error) { return json({ error: String(error.message ?? error) }, 400); }
    }
    if (url.pathname === '/api/admin/restore' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (body.week !== WEEK || typeof body.version !== 'string') return json({ error: 'Wrong week or version.' }, 400);
        await ensureSchema(env.DB);
        const state = await currentState(env.DB);
        if (body.expectedVersion !== state.version) return json({ error: 'Lines changed. Reload before restoring.' }, 409);
        const version = await env.DB.prepare('SELECT payload FROM prop_line_versions WHERE id = ? AND week = ?').bind(body.version, WEEK).first();
        if (!version) return json({ error: 'Version not found.' }, 404);
        const restored = preserveLockedLines(JSON.parse(version.payload), state.lines);
        const saved = await saveState(env.DB, restored, uploader, 'restore', 0);
        return json({ week: WEEK, ...saved });
      } catch (error) { return json({ error: String(error.message ?? error) }, 400); }
    }
    return json({ error: 'Not found.' }, 404);
  },
};

export { parseUpload, preserveLockedLines };
