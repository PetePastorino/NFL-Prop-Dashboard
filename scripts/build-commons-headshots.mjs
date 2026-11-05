import fs from 'node:fs/promises';

const dataUrl = new URL('../artifacts/nfl-prop-dashboard/src/data/player-data.json', import.meta.url);
const outputUrl = new URL('../artifacts/nfl-prop-dashboard/src/data/commons-headshots.json', import.meta.url);
const players = JSON.parse(await fs.readFile(dataUrl, 'utf8'));
const names = [...new Set(Object.values(players).flat().map((player) => player.name))];

async function api(host, params) {
  const url = new URL(`https://${host}/w/api.php`);
  url.search = new URLSearchParams({ ...params, format: 'json' });
  const response = await fetch(url, { headers: { 'User-Agent': 'PropExeDashboard/1.0 (https://github.com/PetePastorino/NFL-Prop-Dashboard)' } });
  if (!response.ok) throw new Error(`${host}: ${response.status}`);
  return response.json();
}

function normalize(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function plainText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

const matches = [];
const skipped = [];
for (const name of names) {
  const result = await api('www.wikidata.org', { action: 'wbsearchentities', search: name, language: 'en', limit: '10' });
  const candidates = (result.search ?? []).filter((item) =>
    normalize(item.label) === normalize(name) && /american football player|american football quarterback/i.test(item.description ?? ''),
  );
  if (candidates.length !== 1) {
    skipped.push({ name, reason: candidates.length ? 'ambiguous player identity' : 'no exact football identity' });
    continue;
  }
  matches.push({ name, id: candidates[0].id });
}

const headshotCandidates = [];
for (let start = 0; start < matches.length; start += 50) {
  const batch = matches.slice(start, start + 50);
  const result = await api('www.wikidata.org', { action: 'wbgetentities', ids: batch.map((item) => item.id).join('|'), props: 'claims' });
  for (const item of batch) {
    const image = result.entities?.[item.id]?.claims?.P18?.find((claim) => claim.rank !== 'deprecated')?.mainsnak?.datavalue?.value;
    if (image) headshotCandidates.push({ ...item, image });
    else skipped.push({ name: item.name, reason: 'no Wikidata Commons photo' });
  }
}

const verified = {};
for (let start = 0; start < headshotCandidates.length; start += 25) {
  const batch = headshotCandidates.slice(start, start + 25);
  const result = await api('commons.wikimedia.org', {
    action: 'query', titles: batch.map((item) => `File:${item.image}`).join('|'),
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '300',
  });
  const pages = Object.values(result.query?.pages ?? {});
  for (const item of batch) {
    const page = pages.find((candidate) => normalize(candidate.title.replace(/^File:/, '')) === normalize(item.image));
    const info = page?.imageinfo?.[0];
    const meta = info?.extmetadata;
    const license = meta?.LicenseShortName?.value ?? '';
    if (!info?.thumburl || !/^(CC (?:BY|BY-SA|0)\b|Public domain\b)/i.test(license)) {
      skipped.push({ name: item.name, reason: `no supported Commons license (${license || 'unknown'})` });
      continue;
    }
    verified[item.name] = {
      url: info.thumburl,
      page: info.descriptionurl,
      author: plainText(meta?.Artist?.value ?? 'Wikimedia Commons contributor'),
      license,
      licenseUrl: meta?.LicenseUrl?.value ?? info.descriptionurl,
    };
  }
}

await fs.writeFile(outputUrl, `${JSON.stringify(verified, null, 2)}\n`);
console.log(`Verified ${Object.keys(verified).length}/${names.length} player photos; skipped ${skipped.length}.`);
console.log(skipped.slice(0, 12));
