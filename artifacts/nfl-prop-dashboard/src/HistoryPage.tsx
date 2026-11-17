import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import type { ChartConfiguration } from 'chart.js';
import { WEEKLY_HISTORY, type RecordSummary, type WeeklyHistory, type WeeklyPick, type WeeklyParlay } from '@/data/weekly-history';
import './history-page.css';

const BREAK_EVEN = 52.4;
const BLUE = '#0878FF';
const CYAN = '#00A8C6';
const GRAY = '#8FA3B5';
const RED = '#F06470';
const GREEN = '#2EE59D';
const VOID = '#9BA9B5';
type PickFilter = 'All' | 'Wins' | 'Losses' | 'Over' | 'Under';
type Board = 'top' | 'all';
type Category = { label: string; wins: number; losses: number; pushes: number };

function recordTotal(record: RecordSummary) { return record.wins + record.losses + record.pushes; }
function percent(record: RecordSummary) { const n = record.wins + record.losses; return n ? record.wins / n * 100 : 0; }
function rate(record: RecordSummary) { return `${percent(record).toFixed(1)}%`; }
function recordText(record: RecordSummary) { return `${record.wins}–${record.losses}${record.pushes ? `–${record.pushes}` : ''}`; }
function value(number: number | null) { return number === null ? '—' : Number.isInteger(number) ? String(number) : number.toFixed(1); }
function odds(number: number) { return number > 0 ? `+${number}` : String(number); }
function fromHash() { const match = window.location.hash.match(/^#week-(\d+)$/); return match ? Number(match[1]) : null; }
function addRecord(total: RecordSummary, record: RecordSummary): RecordSummary { return { wins: total.wins + record.wins, losses: total.losses + record.losses, pushes: total.pushes + record.pushes }; }
function categoryRecord(picks: WeeklyPick[], key: (pick: WeeklyPick) => string): Category[] {
  const groups = new Map<string, Category>();
  for (const pick of picks) {
    const label = key(pick);
    const group = groups.get(label) ?? { label, wins: 0, losses: 0, pushes: 0 };
    if (pick.result === 'WIN') group.wins++;
    else if (pick.result === 'LOSS') group.losses++;
    else group.pushes++;
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}
function categoryRate(category: Category) { const n = category.wins + category.losses; return n ? category.wins / n * 100 : 0; }
function categoryText(category: Category) { return `${category.wins}–${category.losses}${category.pushes ? `–${category.pushes}` : ''}`; }

function ChartCanvas({ label, config, className = '' }: { label: string; config: ChartConfiguration<'bar'>; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    let instance: Chart<'bar'> | undefined;
    try {
      instance = new Chart(canvas.current, config);
      setError(false);
    } catch (cause) {
      console.error(`Could not draw ${label}`, cause);
      setError(true);
    }
    return () => instance?.destroy();
  }, [config, label]);
  return <div className={`results-chart-canvas ${className}`}>{error ? <p role="status">Chart unavailable. The records remain available in the week detail below.</p> : <canvas ref={canvas} role="img" aria-label={label}>Chart unavailable. Use the week selector and records below.</canvas>}</div>;
}

function chartBase(): ChartConfiguration<'bar'>['options'] {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#071B2B', titleColor: '#FFFFFF', bodyColor: '#FFFFFF', borderColor: '#34536A', borderWidth: 1 } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#C3D1DD', font: { size: 11 } }, border: { display: false } },
      y: { min: 0, max: 100, grid: { color: 'rgba(205,225,240,.14)' }, ticks: { color: '#A8BAC9', callback: (tick) => `${tick}%`, stepSize: 25 }, border: { display: false } },
    },
  };
}

export default function HistoryPage() {
  const weeks = useMemo(() => [...WEEKLY_HISTORY].sort((a, b) => a.season - b.season || a.week - b.week), []);
  const latest = weeks.at(-1)!;
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(() => fromHash() ?? latest.week);
  const [board, setBoard] = useState<Board>('top');
  const [filter, setFilter] = useState<PickFilter>('All');
  const [showAll, setShowAll] = useState(false);
  const parlayWeeks = useMemo(() => weeks.filter((week) => week.parlays?.length), [weeks]);
  const [parlayWeekNumber, setParlayWeekNumber] = useState(() => parlayWeeks.at(-1)?.week ?? latest.week);
  const selected = weeks.find((week) => week.week === selectedWeekNumber) ?? latest;
  const selectedParlayWeek = parlayWeeks.find((week) => week.week === parlayWeekNumber) ?? parlayWeeks.at(-1);
  const allRecord = weeks.reduce((total, week) => addRecord(total, week.highConfidence), { wins: 0, losses: 0, pushes: 0 });
  const topRecord = weeks.reduce((total, week) => addRecord(total, week.topPicks), { wins: 0, losses: 0, pushes: 0 });
  const aboveBreakEven = weeks.filter((week) => percent(week.highConfidence) >= BREAK_EVEN).length;
  const detailWeeks = useMemo(() => weeks.filter((week) => Boolean(week.highConfidencePicks)), [weeks]);
  const archivedPicks = useMemo(() => detailWeeks.flatMap((week) => week.highConfidencePicks ?? []), [detailWeeks]);
  const directions = useMemo(() => categoryRecord(archivedPicks, (pick) => pick.lean === 'OVER' ? 'Overs' : 'Unders'), [archivedPicks]);
  const propTypes = useMemo(() => categoryRecord(archivedPicks, (pick) => `${pick.position} ${pick.stat}`), [archivedPicks]);
  const displayedBoard = board === 'all' && selected.highConfidencePicks ? selected.highConfidencePicks : selected.picks;
  const filteredPicks = displayedBoard.filter((pick) => filter === 'All' || (filter === 'Wins' && pick.result === 'WIN') || (filter === 'Losses' && pick.result === 'LOSS') || (filter === 'Over' && pick.lean === 'OVER') || (filter === 'Under' && pick.lean === 'UNDER'));
  const visiblePicks = showAll ? filteredPicks : filteredPicks.slice(0, 10);

  useEffect(() => {
    const syncHash = () => { const week = fromHash(); if (week && weeks.some((entry) => entry.week === week)) setSelectedWeekNumber(week); };
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [weeks]);
  useEffect(() => { setShowAll(false); setFilter('All'); if (!selected.highConfidencePicks) setBoard('top'); }, [selected.week, selected.highConfidencePicks]);
  function selectWeek(week: WeeklyHistory) {
    setSelectedWeekNumber(week.week);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#week-${week.week}`);
  }

  const weeklyChart = useMemo<ChartConfiguration<'bar'>>(() => ({
    type: 'bar',
    data: { labels: weeks.map((week) => `W${week.week}`), datasets: [{ label: 'All high-confidence', data: weeks.map((week) => percent(week.highConfidence)), backgroundColor: weeks.map((week) => `${percent(week.highConfidence) >= BREAK_EVEN ? BLUE : RED}${week.week === selected.week ? 'FF' : '55'}`), borderRadius: 5, barThickness: 13, maxBarThickness: 13 }] },
    options: { ...chartBase(), onClick: (_event, elements) => { if (elements.length) selectWeek(weeks[elements[0].index]); }, plugins: { ...chartBase()?.plugins, tooltip: { ...chartBase()?.plugins?.tooltip, callbacks: { label: (context) => `${Number(context.raw).toFixed(1)}% · ${recordText(weeks[context.dataIndex].highConfidence)}` } } } },
    plugins: [{ id: 'breakEvenLine', afterDraw(chart) { const y = chart.scales.y?.getPixelForValue(BREAK_EVEN); if (!y) return; const { ctx, chartArea } = chart; ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#E7EEF5'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(chartArea.left, y); ctx.lineTo(chartArea.right, y); ctx.stroke(); ctx.restore(); } }],
  }), [weeks, selected.week]);
  const comparisonChart = useMemo<ChartConfiguration<'bar'>>(() => ({
    type: 'bar',
    data: { labels: weeks.map((week) => `W${week.week}`), datasets: [
      { label: 'All high-confidence', data: weeks.map((week) => percent(week.highConfidence)), backgroundColor: weeks.map((week) => week.week === selected.week ? GRAY : `${GRAY}55`), borderRadius: 4, barThickness: 8, maxBarThickness: 8 },
      { label: 'Top 10 board', data: weeks.map((week) => percent(week.topPicks)), backgroundColor: weeks.map((week) => week.week === selected.week ? CYAN : `${CYAN}55`), borderRadius: 4, barThickness: 8, maxBarThickness: 8 },
    ] },
    options: { ...chartBase(), onClick: (_event, elements) => { if (elements.length) selectWeek(weeks[elements[0].index]); }, plugins: { ...chartBase()?.plugins, tooltip: { ...chartBase()?.plugins?.tooltip, callbacks: { label: (context) => `${context.dataset.label}: ${Number(context.raw).toFixed(1)}% · ${recordText(context.datasetIndex === 0 ? weeks[context.dataIndex].highConfidence : weeks[context.dataIndex].topPicks)}` } } } },
  }), [weeks, selected.week]);
  function aggregateChart(categories: Category[], horizontal = false): ChartConfiguration<'bar'> {
    const options = chartBase();
    return { type: 'bar', data: { labels: categories.map((category) => category.label), datasets: [{ label: 'Win rate', data: categories.map(categoryRate), backgroundColor: categories.map((category) => categoryRate(category) >= BREAK_EVEN ? CYAN : RED), borderRadius: 4, barThickness: horizontal ? 10 : 24, maxBarThickness: horizontal ? 10 : 24 }] }, options: { ...options, indexAxis: horizontal ? 'y' : 'x', scales: horizontal ? { x: { min: 0, max: 100, grid: { display: false }, ticks: { color: '#A8BAC9', callback: (tick) => `${tick}%` }, border: { display: false } }, y: { grid: { display: false }, ticks: { color: '#C3D1DD', font: { size: 10 } }, border: { display: false } } } : options?.scales, plugins: { ...options?.plugins, tooltip: { ...options?.plugins?.tooltip, callbacks: { label: (context) => `${Number(context.raw).toFixed(1)}% · ${categoryText(categories[context.dataIndex])}` } } } } };
  }
  const directionChart = useMemo(() => aggregateChart(directions), [directions]);
  const propChart = useMemo(() => aggregateChart(propTypes, true), [propTypes]);

  return <div className="results-page">
    <nav className="results-nav" aria-label="History sections"><strong>RESULTS / {latest.season}</strong><div><a href="#results-overview">Overview</a><a href="#results-weeks">Weeks</a><a href="#results-parlays">Parlays</a></div></nav>
    <header className="results-header"><span className="results-eyebrow">PROP.EXE / RESULTS LEDGER</span><h1>History, at a glance.</h1><p>Every archived call, weekly trend, and saved default parlay in one place.</p></header>
    <section id="results-overview" className="results-section" aria-labelledby="results-overview-title">
      <div className="results-heading"><div><span>01 / OVERVIEW</span><h2 id="results-overview-title">Season record</h2></div><small>{weeks.length} tracked weeks</small></div>
      <div className="results-kpis">
        <Kpi title="All high-confidence picks" main={recordText(allRecord)} detail={`${rate(allRecord)} win rate · ${recordTotal(allRecord)} picks`} />
        <Kpi title="Top-confidence board" main={recordText(topRecord)} detail={`${rate(topRecord)} win rate · ${recordTotal(topRecord)} picks`} />
        <Kpi title="Weeks above breakeven" main={`${aboveBreakEven} of ${weeks.length}`} detail={`At least ${BREAK_EVEN}% high-confidence wins`} />
        <Kpi title={`Most recent · Week ${latest.week}`} main={recordText(latest.highConfidence)} detail={`All picks · Top 10 ${recordText(latest.topPicks)}`} />
      </div>
      <div className="results-chart-grid">
        <ChartCard title="Weekly win % vs. breakeven" subtitle="All high-confidence picks · select a bar to inspect a week" legend={[['At/above 52.4%', BLUE], ['Below 52.4%', RED], ['Breakeven', '#E7EEF5']]}><ChartCanvas label="Weekly high-confidence win percentage, Weeks 2 through 10, with a 52.4 percent breakeven line" config={weeklyChart} /></ChartCard>
        <ChartCard title="Top board vs. all picks" subtitle="Win percentage by week · select a bar to inspect a week" legend={[['All high-confidence', GRAY], ['Top 10 board', CYAN]]}><ChartCanvas label="Top 10 board and all high-confidence weekly win percentages" config={comparisonChart} /></ChartCard>
        <ChartCard title="Overs vs. unders" subtitle={`Archived pick detail · Weeks ${detailWeeks[0]?.week}–${detailWeeks.at(-1)?.week}`} legend={[['At/above 52.4%', CYAN], ['Below 52.4%', RED]]}><ChartCanvas label="High-confidence over and under results by win percentage" config={directionChart} className="results-chart-short" /><CategoryLabels categories={directions} /></ChartCard>
        <ChartCard title="Results by prop type" subtitle={`Archived pick detail · Weeks ${detailWeeks[0]?.week}–${detailWeeks.at(-1)?.week}`} legend={[['At/above 52.4%', CYAN], ['Below 52.4%', RED]]}><ChartCanvas label="High-confidence results by player position and prop type" config={propChart} className="results-chart-tall" /><CategoryLabels categories={propTypes} /></ChartCard>
      </div>
      <p className="results-data-note">Aggregate prop charts use only weeks with archived high-confidence pick detail. Earlier summary records are included in the season KPIs and weekly charts.</p>
    </section>
    <section id="results-weeks" className="results-section" aria-labelledby="results-weeks-title">
      <div className="results-heading"><div><span>02 / WEEKS</span><h2 id="results-weeks-title">Week detail</h2></div><small>Click a chart bar or choose a week</small></div>
      <div className="results-chips" role="group" aria-label="Select week">{[...weeks].reverse().map((week) => <button key={week.week} type="button" aria-pressed={selected.week === week.week} onClick={() => selectWeek(week)}>Week {week.week}</button>)}</div>
      <article className="results-detail">
        <div className="results-detail-header"><div><span>WEEK {selected.week} · {selected.season}</span><h3>{selected.label}</h3><small>{selected.gamesGraded}/{selected.gamesScheduled} games graded</small></div><div className="results-records"><div><span>All high-confidence</span><strong>{recordText(selected.highConfidence)}</strong><small>{rate(selected.highConfidence)}</small></div><div><span>Top {selected.topPickLimit} board</span><strong>{recordText(selected.topPicks)}</strong><small>{rate(selected.topPicks)}</small></div></div></div>
        <div className="results-toolbar"><div className="results-segmented" role="group" aria-label="Choose pick board"><button type="button" aria-pressed={board === 'top'} onClick={() => { setBoard('top'); setShowAll(false); }}>Top 10 board</button><button type="button" aria-pressed={board === 'all'} disabled={!selected.highConfidencePicks} onClick={() => { setBoard('all'); setShowAll(false); }}>All picks</button></div><div className="results-filters" role="group" aria-label="Filter picks">{(['All', 'Wins', 'Losses', 'Over', 'Under'] as PickFilter[]).map((option) => <button key={option} type="button" aria-pressed={filter === option} onClick={() => { setFilter(option); setShowAll(false); }}>{option}</button>)}</div></div>
        {!selected.highConfidencePicks && <p className="results-archive-note">Full high-confidence pick rows were not archived for Week {selected.week}. The Top {selected.topPickLimit} rows remain available.</p>}
        <div className="results-table-scroll"><table className="results-table"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th>Prop</th><th>Call</th><th>Line</th><th>Projection</th><th>Actual</th><th>Result</th></tr></thead><tbody>{visiblePicks.map((pick, index) => <tr key={`${selected.week}-${pick.player}-${pick.stat}-${pick.lean}-${index}`}><td>{String(index + 1).padStart(2, '0')}</td><td className="results-player">{pick.player}</td><td>{pick.position}</td><td>{pick.stat}</td><td><span className={`results-call ${pick.lean.toLowerCase()}`}>{pick.lean}</span></td><td>{value(pick.line)}</td><td>{value(pick.projection)}</td><td>{value(pick.actual)}</td><td><span className={`results-outcome ${pick.result.toLowerCase()}`}>{pick.result}</span></td></tr>)}</tbody></table>{filteredPicks.length === 0 && <p className="results-empty">No picks match this filter.</p>}</div>
        {filteredPicks.length > 10 && <button className="results-show-more" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? 'Show first 10 picks' : `Show all ${filteredPicks.length} picks`}</button>}
        {selected.note && <p className="results-week-note">{selected.note}</p>}
      </article>
    </section>
    <section id="results-parlays" className="results-section" aria-labelledby="results-parlays-title">
      <div className="results-heading"><div><span>03 / PARLAYS</span><h2 id="results-parlays-title">Saved parlay history</h2></div><small>Default builder tickets only</small></div>
      <p className="results-parlay-intro">Saved default tickets and their graded legs. Browser substitutions were not archived.</p>
      {selectedParlayWeek ? <><div className="results-chips" role="group" aria-label="Select parlay week">{[...parlayWeeks].reverse().map((week) => <button key={week.week} type="button" aria-pressed={selectedParlayWeek.week === week.week} onClick={() => setParlayWeekNumber(week.week)}>Week {week.week}</button>)}</div><div className="results-parlay-summary">{selectedParlayWeek.parlays?.map((ticket) => <div key={ticket.name}><span>{ticket.name}</span><strong>{ticket.outcome === 'HIT' ? 1 : 0}/1 hit</strong></div>)}</div><div className="results-parlay-grid">{selectedParlayWeek.parlays?.map((ticket) => <ParlayCard key={ticket.name} ticket={ticket} />)}</div></> : <p className="results-empty">No saved parlays yet.</p>}
    </section>
  </div>;
}

function Kpi({ title, main, detail }: { title: string; main: string; detail: string }) { return <div className="results-kpi"><span>{title}</span><strong>{main}</strong><small>{detail}</small></div>; }
function ChartCard({ title, subtitle, legend, children }: { title: string; subtitle: string; legend: [string, string][]; children: React.ReactNode }) { return <article className="results-chart-card"><div className="results-chart-heading"><h3>{title}</h3><p>{subtitle}</p></div><div className="results-legend">{legend.map(([name, color]) => <span key={name}><i style={{ background: color }} />{name}</span>)}</div>{children}</article>; }
function CategoryLabels({ categories }: { categories: Category[] }) { return <div className="results-category-labels">{categories.map((category) => <span key={category.label}><strong>{category.label}</strong> {categoryText(category)} · {categoryRate(category).toFixed(1)}% · {category.wins + category.losses + category.pushes} picks</span>)}</div>; }
function ParlayCard({ ticket }: { ticket: WeeklyParlay }) { return <article className="results-parlay-card"><div className="results-parlay-head"><div><h3>{ticket.name}</h3><small>{ticket.legs.filter((leg) => leg.result === 'WIN').length} won · {ticket.legs.filter((leg) => leg.result === 'LOSS').length} lost{ticket.legs.some((leg) => leg.result === 'VOID') ? ` · ${ticket.legs.filter((leg) => leg.result === 'VOID').length} void` : ''}</small></div><span className={`results-outcome ${ticket.outcome.toLowerCase()}`}>{ticket.outcome}</span></div><ol>{ticket.legs.map((leg, index) => <li key={`${leg.player}-${leg.stat}-${index}`}><div><strong>{leg.player}</strong><small>{leg.stat} · {leg.lean} {value(leg.line)}{leg.odds !== undefined ? ` · ${odds(leg.odds)}` : ''}</small></div><span>{leg.actual === null ? '—' : value(leg.actual)}</span><span className={`results-outcome ${leg.result.toLowerCase()}`}>{leg.result}</span></li>)}</ol></article>; }
