import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { parseUpload } from './lines.mjs';

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

test('admin preview requires the private secret and a same-origin request', async () => {
  const password = 'a-long-private-password-with-32-characters';
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
