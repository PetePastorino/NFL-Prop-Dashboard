import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUpload } from './lines.mjs';

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
