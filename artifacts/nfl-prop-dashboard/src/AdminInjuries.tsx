import { useState } from 'react';
import schedule from './data/week10-schedule.json';
import './admin-lines.css';

type Change = { key: string; player: string; team: string; previous: string | null; status: string | null };
type Skipped = { row: number; player: string; team: string; reason: string };
type Version = { id: string; created_at: string; kind: string; changed_count: number };
type State = { week: string; version: string | null; updatedAt: string | null; versions: Version[] };
type Preview = { week: string; version: string | null; mode: 'full' | 'patch'; accepted: unknown[]; skipped: Skipped[]; changes: Change[]; teamCount: number };

async function readJson(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

export default function AdminInjuries() {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State | null>(null);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const expectedWeek = `${schedule.season}-${schedule.week}`;

  const refresh = async () => {
    const data = await readJson(await fetch('/api/admin/injuries/state', {
      credentials: 'same-origin', cache: 'no-store', headers: { Authorization: `Bearer ${password}` },
    }));
    setState(data);
  };
  const chooseFile = async (file?: File) => {
    setPreview(null);
    setMessage('');
    if (!file) return;
    if (file.size > 300_000) { setMessage('File must be under 300 KB.'); return; }
    setFileName(file.name);
    setFileText(await file.text());
  };
  const request = async (path: string, body: string, contentType: string) => {
    setBusy(true);
    setMessage('');
    try {
      return await readJson(await fetch(path, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${password}` }, body,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally { setBusy(false); }
  };
  const inspect = async () => {
    const result = await request('/api/admin/injuries/preview', fileText, 'text/plain; charset=utf-8');
    if (result) setPreview(result);
  };
  const apply = async () => {
    if (!state || !preview || preview.week !== expectedWeek) return;
    const result = await request('/api/admin/injuries/apply', JSON.stringify({
      week: expectedWeek, text: fileText, expectedVersion: state.version,
    }), 'application/json');
    if (result) {
      setMessage(`Applied ${result.changedCount} injury changes. ${result.skippedCount} rows were skipped. Confidence and parlay eligibility will refresh for everyone within a minute.`);
      setPreview(null);
      await refresh().catch((error) => setMessage(error.message));
    }
  };
  const restore = async (version: Version) => {
    if (!state || !window.confirm(`Restore the injury statuses saved ${new Date(version.created_at).toLocaleString()}? This creates a new version.`)) return;
    const result = await request('/api/admin/injuries/restore', JSON.stringify({
      week: expectedWeek, version: version.id, expectedVersion: state.version,
    }), 'application/json');
    if (result) {
      setMessage('Previous injury statuses restored.');
      await refresh().catch((error) => setMessage(error.message));
    }
  };

  return <main className="line-admin">
    <header><a href="/">← Dashboard</a><h1>Admin · Injuries</h1><p>Week {schedule.week}, {schedule.season} · {state ? 'Unlocked' : 'Locked'} · <a href="/admin/lines">Prop lines</a></p></header>
    <section className="line-admin-card"><h2>Unlock uploads</h2><p>Use the same private password as the prop line uploader. It stays in this browser tab.</p><input type="password" autoComplete="off" value={password} onChange={(event) => { setPassword(event.target.value); setState(null); setPreview(null); }} placeholder="Upload password" aria-label="Upload password" /><button disabled={!password || busy} onClick={() => void refresh().catch((error) => { setState(null); setMessage(error.message); })}>Unlock</button></section>
    <section className="line-admin-card">
      <h2>Upload an injury report</h2>
      <p>Upload the complete team-by-team report as a .txt file, or paste it below. A complete report replaces current statuses and clears players who are no longer listed. For a few changes, use tab-separated columns <code>Player</code>, <code>Team</code>, <code>Status</code>. Enter <code>Clear</code> to remove a warning. Partial files change only listed players.</p>
      <input type="file" accept=".txt,.tsv,text/plain,text/tab-separated-values" onChange={(event) => void chooseFile(event.target.files?.[0])} aria-label="Injury report file" />
      {fileName && <small>Selected: {fileName}</small>}
      <textarea value={fileText} onChange={(event) => { setFileText(event.target.value); setPreview(null); setFileName(''); }} rows={8} placeholder={'Player\tTeam\tStatus\nPatrick Mahomes\tKC\tQuestionable\nJosh Jacobs\tGB\tClear'} aria-label="Paste injury report" />
      <button disabled={busy || !fileText || !state} onClick={() => void inspect()}>Preview injury changes</button>
    </section>
    {preview && <section className="line-admin-card">
      <h2>Preview · {preview.changes.length} changes, {preview.skipped.length} skipped</h2>
      <p>{preview.mode === 'full' ? `Full report from ${preview.teamCount} teams. Missing players will be cleared.` : 'Partial update. Unlisted players stay unchanged.'} Review all changes before applying.</p>
      <div className="line-admin-table"><table><thead><tr><th>Player</th><th>Team</th><th>Current</th><th>New</th></tr></thead><tbody>
        {preview.changes.map((row) => <tr key={row.key}><td>{row.player}</td><td>{row.team}</td><td>{row.previous ?? 'Clear'}</td><td>{row.status ?? 'Clear'}</td></tr>)}
      </tbody></table></div>
      {preview.skipped.length > 0 && <details><summary>Skipped rows and reasons</summary><ul>{preview.skipped.map((row) => <li key={row.row}>Row {row.row}: {row.player} · {row.team} — {row.reason}</li>)}</ul></details>}
      <button disabled={busy || !state || !preview.changes.length} onClick={() => void apply()}>Apply {preview.changes.length} injury changes for all users</button>
    </section>}
    {message && <p className="line-admin-message" role="status">{message}</p>}
    {state && <section className="line-admin-card"><h2>Saved versions</h2><p>Current version: {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'built-in injury report'}</p><ul className="line-admin-versions">{state.versions.map((version) => <li key={version.id}><span>{new Date(version.created_at).toLocaleString()} · {version.kind} · {version.changed_count} changes</span><button disabled={busy || version.id === state.version} onClick={() => void restore(version)}>Restore</button></li>)}</ul></section>}
  </main>;
}
