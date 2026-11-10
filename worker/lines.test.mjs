import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { parseUpload, preserveLockedLines } from './lines.mjs';

test('imports the tab-separated sportsbook file with separate receiving markets', () => {
  const text = '# Source: example\nPlayer\tTeam\tProp\tLine\tOver odds\tUnder odds\nJahmyr Gibbs\tDET\tReceiving Yards\t30.5\t-110\t-110\nJahmyr Gibbs\tDET\tReceptions\t4.5\t+113\t-144';
  const result = parseUpload(text);
  assert.ok(result.accepted.length > 0);
  const gibbsYards = result.accepted.find((row) => row.key === 'RB:rec_yards:Jahmyr Gibbs');
  const gibbsReceptions = result.accepted.find((row) => row.key === 'RB:receptions:Jahmyr Gibbs');
  assert.equal(gibbsYards?.line, '30.5');
  assert.equal(gibbsReceptions?.line, '4.5');
  assert.notEqual(gibbsYards?.key, gibbsReceptions?.key);
});

test('skips unknown rows and refuses a file without valid lines', () => {
  const header = 'Player\tTeam\tProp\tLine\tOver odds\tUnder odds\n';
  const text = header + 'Jahmyr Gibbs\tDET\tReceiving Yards\t30.5\t-110\t-110\nNobody Real\tDET\tReceiving Yards\t20.5\t-110\t-110';
  const result = parseUpload(text);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.skipped.length, 1);
  assert.throws(() => parseUpload(header + 'Nobody Real\tDET\tReceiving Yards\t20.5\t-110\t-110'));
});

test('Week 10 uploads use traded teams and exclude bye teams', () => {
  const file = 'Player\tTeam\tProp\tLine\tOver odds\tUnder odds\nJosh Downs\tKC\tReceiving Yards\t45.5\t-110\t-110\nJosh Downs\tIND\tReceiving Yards\t45.5\t-110\t-110\nBaker Mayfield\tTB\tPassing Yards\t220.5\t-110\t-110';
  const result = parseUpload(file, new Date('2026-11-11T17:00:00Z'));
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0].team, 'KAN');
  assert.equal(result.skipped.length, 2);
  assert.match(result.skipped[1].reason, /bye/);
});

test('admin preview requires the private secret and a same-origin request', async () => {
  const password = 'private-upload-password';
  const env = { DB: {}, UPLOAD_PASSWORD: password };
  const text = 'Player\tTeam\tProp\tLine\tOver odds\tUnder odds\nJahmyr Gibbs\tDET\tReceptions\t4.5\t+113\t-144';
  const preview = (authorization, origin) => worker.fetch(new Request('https://example.test/api/admin/preview', {
    method: 'POST', headers: { Authorization: authorization, Origin: origin }, body: text,
  }), env);
  assert.equal((await preview('Bearer wrong', 'https://example.test')).status, 403);
  assert.equal((await preview(`Bearer ${password}`, 'https://other.test')).status, 403);
  const response = await preview(`Bearer ${password}`, 'https://example.test');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accepted[0].key, 'RB:receptions:Jahmyr Gibbs');
});

test('admin reports a missing password binding separately from an incorrect password', async () => {
  const request = new Request('https://example.test/api/admin/state', { headers: { Authorization: 'Bearer some-password' } });
  const response = await worker.fetch(request, { DB: {} });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/);
});

test('Thursday game lines lock at 8:00 PM Eastern and stay locked on Sunday', () => {
  const file = 'Player\tTeam\tProp\tLine\tOver odds\tUnder odds\nJayden Daniels\tWAS\tPassing Yards\t210.5\t-110\t-110\nJahmyr Gibbs\tDET\tRushing Yards\t90.5\t-110\t-110';
  const before = parseUpload(file, new Date('2026-11-13T00:59:59Z'));
  assert.equal(before.accepted.length, 2);
  const atCutoff = parseUpload(file, new Date('2026-11-13T01:00:00Z'));
  assert.equal(atCutoff.accepted.length, 1);
  assert.equal(atCutoff.skipped[0].player, 'Jayden Daniels');
  assert.match(atCutoff.skipped[0].reason, /Thursday game locked/);
  const sunday = parseUpload(file, new Date('2026-11-15T17:00:00Z'));
  assert.equal(sunday.accepted.length, 1);
});

test('restoring a version retains the current Thursday lines', () => {
  const thursdayKey = 'QB:pass_yards:Jayden Daniels';
  const sundayKey = 'RB:rush_yards:Jahmyr Gibbs';
  const current = { [thursdayKey]: { line: '210.5' }, [sundayKey]: { line: '90.5' } };
  const old = { [thursdayKey]: { line: '200.5' }, [sundayKey]: { line: '80.5' } };
  const restored = preserveLockedLines(old, current, new Date('2026-11-15T17:00:00Z'));
  assert.equal(restored[thursdayKey].line, '210.5');
  assert.equal(restored[sundayKey].line, '80.5');
  const baseline = preserveLockedLines(old, {}, new Date('2026-11-15T17:00:00Z'));
  assert.equal(baseline[thursdayKey], undefined);
});
