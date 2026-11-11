import { useState } from 'react';
import schedule from './data/week10-schedule.json';
import './admin-lines.css';

type LineRow = { key: string; player: string; team: string; prop: string; line: string; overOdds: string | null; underOdds: string | null };
type SkippedRow = { row: number; player: string; team: string; prop: string; reason: string };
type Version = { id: string; created_at: string; uploader: string; kind: string; changed_count: number };
type State = { week: string; version: string | null; updatedAt: string | null; versions: Version[] };
type Preview = { week: string; accepted: LineRow[]; skipped: SkippedRow[] };

async function readJson(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

export default function AdminLines() {
  const [state, setState] = useState<State | null>(null);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const expectedWeek = `${schedule.season}-${schedule.week}`;

  const refresh = async () => {
    const data = await readJson(await fetch('/api/admin/state', { credentials: 'same-origin', cache: 'no-store', headers: { Authorization: `Bearer ${password}` } }));
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
      return await readJson(await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': contentType, Authorization: `Bearer ${password}` }, body }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally { setBusy(false); }
  };
  const inspect = async () => {
    const result = await request('/api/admin/preview', fileText, 'text/plain; charset=utf-8');
    if (result) setPreview(result);
  };
  const apply = async () => {
    if (!state || !preview || preview.week !== expectedWeek) return;
    const result = await request('/api/admin/apply', JSON.stringify({ week: expectedWeek, text: fileText, expectedVersion: state.version }), 'application/json');
    if (result) {
      setMessage(`Applied ${result.acceptedCount} lines. ${result.skippedCount} rows were skipped. Everyone will see the new lines when the page refreshes.`);
      setPreview(null);
      await refresh().catch((error) => setMessage(error.message));
    }
  };
  const restore = async (version: Version) => {
    if (!state || !window.confirm(`Restore the lines saved ${new Date(version.created_at).toLocaleString()}? This creates a new version and can be undone.`)) return;
    const result = await request('/api/admin/restore', JSON.stringify({ week: expectedWeek, version: version.id, expectedVersion: state.version }), 'application/json');
    if (result) {
      setMessage('Previous lines restored.');
      await refresh().catch((error) => setMessage(error.message));
    }
  };

  return <main className="line-admin">
    <header><a href="/">← Dashboard</a><h1>Admin · Prop lines</h1><p>Week {schedule.week}, {schedule.season} · {state ? 'Unlocked' : 'Locked'} · <a href="/admin/injuries">Injury uploader</a></p></header>
    <section className="line-admin-card"><h2>Unlock uploads</h2><p>Enter your private upload password. It stays in this browser tab and is not saved.</p><input type="password" autoComplete="off" value={password} onChange={(event) => { setPassword(event.target.value); setState(null); setPreview(null); }} placeholder="Upload password" aria-label="Upload password" /><button disabled={!password || busy} onClick={() => void refresh().catch((error) => { setState(null); setMessage(error.message); })}>Unlock</button></section>
    <section className="line-admin-card">
      <h2>Upload a lines file</h2>
      <p>Use the tab-separated <code>props.txt</code> file from the scraper. It needs Player, Team, Prop, Line, Over odds, and Under odds columns. Only listed props change; all others stay in place. Thursday game lines lock at 8:00 p.m. Eastern on Thursday. Later uploads and restores keep those lines.</p>
      <input type="file" accept=".txt,.tsv,text/plain,text/tab-separated-values" onChange={(event) => void chooseFile(event.target.files?.[0])} aria-label="Prop lines file" />
      <button disabled={busy || !fileText || !state} onClick={() => void inspect()}>Preview changes</button>
      {fileName && <small>Selected: {fileName}</small>}
    </section>
    {preview && <section className="line-admin-card">
      <h2>Preview · {preview.accepted.length} matched, {preview.skipped.length} skipped</h2>
      <p>Review this list before applying. Skipped rows will leave any existing line unchanged.</p>
      <div className="line-admin-table"><table><thead><tr><th>Player</th><th>Team</th><th>Prop</th><th>Line</th><th>Over</th><th>Under</th></tr></thead><tbody>
        {preview.accepted.map((row) => <tr key={row.key}><td>{row.player}</td><td>{row.team}</td><td>{row.prop}</td><td>{row.line}</td><td>{row.overOdds ?? '—'}</td><td>{row.underOdds ?? '—'}</td></tr>)}
      </tbody></table></div>
      {preview.skipped.length > 0 && <details><summary>Skipped rows and reasons</summary><ul>{preview.skipped.map((row) => <li key={row.row}>Row {row.row}: {row.player} · {row.prop} — {row.reason}</li>)}</ul></details>}
      <button disabled={busy || !state || !preview.accepted.length} onClick={() => void apply()}>Apply {preview.accepted.length} lines for all users</button>
    </section>}
    {message && <p className="line-admin-message" role="status">{message}</p>}
    {state && <section className="line-admin-card"><h2>Saved versions</h2><p>Current version: {state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'built-in lines only'}</p><ul className="line-admin-versions">{state.versions.map((version) => <li key={version.id}><span>{new Date(version.created_at).toLocaleString()} · {version.kind} · {version.changed_count} lines</span><button disabled={busy || version.id === state.version} onClick={() => void restore(version)}>Restore</button></li>)}</ul></section>}
  </main>;
}
