import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './lines.mjs';
import { parseInjuryUpload, baselineInjuries, applyInjuryUpload, injuryChanges } from './injuries.mjs';

test('partial injury uploads update listed players and clear a recovered player', () => {
  const baseline = baselineInjuries();
  assert.equal(baseline['KAN:Patrick Mahomes'], 'Questionable');
  const parsed = parseInjuryUpload('Player\tTeam\tStatus\nPatrick Mahomes\tKC\tClear\nTee Higgins\tCIN\tQuestionable\nNobody Real\tCIN\tOut');
  assert.equal(parsed.mode, 'patch');
  assert.equal(parsed.accepted.length, 2);
  assert.equal(parsed.skipped.length, 1);
  const next = applyInjuryUpload(parsed, baseline);
  assert.equal(next['KAN:Patrick Mahomes'], undefined);
  assert.equal(next['CIN:Tee Higgins'], 'Questionable');
  assert.equal(next['GNB:Josh Jacobs'], baseline['GNB:Josh Jacobs']);
  assert.equal(injuryChanges(baseline, next).length, 2);
});

test('full reports clear players missing from the new snapshot', () => {
  const teamHeadings = [
    'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
    'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
    'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
    'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
    'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
    'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints',
    'New York Giants', 'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers',
    'San Francisco 49ers', 'Seattle Seahawks', 'Tampa Bay Buccaneers',
    'Tennessee Titans', 'Washington Commanders',
  ];
  const report = `NFL Injuries\nTeam Injuries\n${teamHeadings.map((team) => `${team}\nNAME\tPOS\tEST. RETURN DATE\tSTATUS\tCOMMENT\n${team === 'Kansas City Chiefs' ? 'Patrick Mahomes\tQB\tNov 15\tOut\t' : ''}`).join('\n')}`;
  const parsed = parseInjuryUpload(report);
  assert.equal(parsed.mode, 'full');
  assert.equal(parsed.teamCount, 32);
  const next = applyInjuryUpload(parsed, baselineInjuries());
  assert.deepEqual(next, { 'KAN:Patrick Mahomes': 'Out' });
  assert.ok(injuryChanges(baselineInjuries(), next).some((change) => change.key === 'GNB:Josh Jacobs' && change.status === null));
  assert.throws(() => parseInjuryUpload('Arizona Cardinals\nNAME\tPOS\tEST. RETURN DATE\tSTATUS\tCOMMENT\nPatrick Mahomes\tQB\tNov 15\tOut\t'), /all 32 team headings/);
});

test('injury preview uses the same private password and same-origin guard', async () => {
  const password = 'private-upload-password';
  const db = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('no such table: injury_state'); } }) }) };
  const body = 'Player\tTeam\tStatus\nPatrick Mahomes\tKC\tClear';
  const request = (authorization, origin) => new Request('https://example.test/api/admin/injuries/preview', {
    method: 'POST', headers: { Authorization: authorization, Origin: origin }, body,
  });
  assert.equal((await worker.fetch(request('Bearer wrong', 'https://example.test'), { DB: db, UPLOAD_PASSWORD: password })).status, 403);
  assert.equal((await worker.fetch(request(`Bearer ${password}`, 'https://other.test'), { DB: db, UPLOAD_PASSWORD: password })).status, 403);
  const response = await worker.fetch(request(`Bearer ${password}`, 'https://example.test'), { DB: db, UPLOAD_PASSWORD: password });
  assert.equal(response.status, 200);
  const preview = await response.json();
  assert.equal(preview.changes[0].status, null);
  assert.equal(preview.changes[0].previous, 'Questionable');
});
