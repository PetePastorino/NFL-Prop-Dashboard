import { useMemo, useState } from 'react';
import sourceText from '@assets/0_prop_matchup_dashboard_(1)_1789679044969.jsx?raw';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  CircleHelp,
  Database,
  Gauge,
  House,
  Menu,
  Minus,
  Search,
  Shield,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import NotFound from '@/pages/not-found';

type StatSnapshot = {
  projection: number | null;
  lowConfidence?: boolean;
  nPriorGames: number;
  priorAvg?: number | null;
  priorLast5?: number | null;
  matchupFactor?: number | null;
  isHome?: boolean;
  week1Actual?: number | null;
};

type Player = {
  name: string;
  team: string;
  week2Opp: string;
  isLowConfidence?: boolean;
  injuryStatus?: string | null;
  injury?: string | null;
  stats: Record<string, StatSnapshot>;
};

type PlayerData = Record<string, Player[]>;
type Position = 'QB' | 'RB' | 'WR' | 'TE';
type Lean = 'OVER' | 'UNDER' | 'PASS' | '—';

const PLAYER_DATA = parsePlayerData(sourceText);

const STAT_TYPES: Record<Position, { key: string; label: string }[]> = {
  QB: [
    { key: 'pass_yards', label: 'Pass Yards' },
    { key: 'rush_yards', label: 'Rush Yards' },
  ],
  RB: [
    { key: 'rush_yards', label: 'Rush Yards' },
    { key: 'rec_yards', label: 'Rec Yards' },
    { key: 'receptions', label: 'Receptions' },
  ],
  WR: [
    { key: 'rec_yards', label: 'Rec Yards' },
    { key: 'receptions', label: 'Receptions' },
  ],
  TE: [
    { key: 'rec_yards', label: 'Rec Yards' },
    { key: 'receptions', label: 'Receptions' },
  ],
};

const POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];
const positionDescriptions: Record<Position, string> = {
  QB: 'Quarterbacks',
  RB: 'Running backs',
  WR: 'Wide receivers',
  TE: 'Tight ends',
};

function parsePlayerData(source: string): PlayerData {
  const startMarker = 'const PLAYER_DATA = ';
  const endMarker = ';\n\nconst C';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) return {};
  return JSON.parse(source.slice(start + startMarker.length, end)) as PlayerData;
}

function formatValue(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(decimals).replace(/\.0$/, '');
}

function leanFromLine(stat: StatSnapshot | undefined, line: string) {
  if (!stat || stat.projection === null || !line || Number.isNaN(Number(line))) {
    return { lean: '—' as Lean, confidence: null, edge: null, edgePct: null };
  }
  const lineValue = Number(line);
  const edge = stat.projection - lineValue;
  const edgePct = lineValue !== 0 ? edge / lineValue : 0;
  if (Math.abs(edgePct) < 0.04) {
    return { lean: 'PASS' as Lean, confidence: 'Low', edge, edgePct };
  }
  const lean = edge > 0 ? ('OVER' as Lean) : ('UNDER' as Lean);
  const confidence =
    Math.abs(edgePct) > 0.18
      ? 'High'
      : Math.abs(edgePct) > 0.09
        ? 'Medium'
        : 'Low';
  return { lean, confidence, edge, edgePct };
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
}

function AppShell() {
  const [position, setPosition] = useState<Position>('WR');
  const [statKey, setStatKey] = useState(STAT_TYPES.WR[0].key);
  const [selectedName, setSelectedName] = useState(
    PLAYER_DATA.WR?.[0]?.name ?? null,
  );
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Record<string, string>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const players = PLAYER_DATA[position] ?? [];
  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return players;
    return players.filter((player) =>
      [player.name, player.team, player.week2Opp].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [players, search]);

  const activePlayer =
    players.find((player) => player.name === selectedName) ?? null;
  const statLabel =
    STAT_TYPES[position].find((stat) => stat.key === statKey)?.label ?? '';
  const lineKey = `${position}:${statKey}:${selectedName ?? ''}`;
  const activeLine = lines[lineKey] ?? '';
  const activeStat = activePlayer?.stats[statKey];
  const lean = leanFromLine(activeStat, activeLine);
  const playerCount = Object.values(PLAYER_DATA).reduce(
    (total, roster) => total + roster.length,
    0,
  );
  const lowConfidenceCount = players.filter((player) => player.isLowConfidence).length;
  const weekOneCount = players.filter(
    (player) => player.stats[statKey]?.week1Actual !== null && player.stats[statKey]?.week1Actual !== undefined,
  ).length;

  const changePosition = (nextPosition: Position) => {
    setPosition(nextPosition);
    setStatKey(STAT_TYPES[nextPosition][0].key);
    setSelectedName(PLAYER_DATA[nextPosition]?.[0]?.name ?? null);
    setSearch('');
    setMobileNavOpen(false);
  };

  return (
    <div className="cockpit">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Activity size={20} strokeWidth={2.5} /></div>
          <div>
            <div className="brand-name">FIELD NOTE</div>
            <div className="brand-subtitle">NFL PROP RESEARCH</div>
          </div>
          <button
            type="button"
            className="icon-button mobile-close"
            aria-label="Close navigation"
            data-testid="button-close-navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-rule" />
        <div className="side-label">Workspace</div>
        <div className="side-nav">
          <button className="side-nav-item active" type="button" data-testid="button-workspace-dashboard" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <BarChart3 size={17} /> Dashboard <span className="nav-pip" />
          </button>
          <button className="side-nav-item" type="button" data-testid="button-workspace-methodology" onClick={() => document.querySelector('.method-note')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <CircleHelp size={17} /> Methodology
          </button>
        </div>

        <div className="side-label position-label">Positions</div>
        <div className="position-nav">
          {POSITIONS.map((item) => (
            <button
              key={item}
              className={`position-nav-item ${position === item ? 'active' : ''}`}
              type="button"
              data-testid={`button-position-${item.toLowerCase()}`}
              onClick={() => changePosition(item)}
            >
              <span className="position-code">{item}</span>
              <span>{positionDescriptions[item]}</span>
              <span className="position-count">{PLAYER_DATA[item]?.length ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="dataset-status">
            <span className="status-dot" />
            <div><strong>Dataset loaded</strong><span>{playerCount} players indexed</span></div>
          </div>
          <div className="disclaimer">
            <Shield size={14} />
            <span>Trend and matchup research only. Not betting advice.</span>
          </div>
        </div>
      </aside>

      <main className="main-canvas">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            data-testid="button-open-navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs"><span>Research</span><ChevronDown size={13} /><strong>Prop board</strong></div>
          <div className="topbar-right">
            <span className="live-indicator"><span /> Week 2 slate</span>
            <button className="icon-button" type="button" aria-label="Help" data-testid="button-help" onClick={() => document.querySelector('.method-note')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><CircleHelp size={18} /></button>
            <div className="avatar" data-testid="text-user-avatar">RN</div>
          </div>
        </header>

        <div className="content-wrap">
          <section className="intro-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> MATCHUP LAB / 01</div>
              <h1>Find the signal<br /><em>before the noise.</em></h1>
              <p className="intro-copy">A transparent view of projection, baseline, recent form, and opponent context — built for better questions.</p>
            </div>
            <div className="intro-meta">
              <div className="meta-block"><span>Model window</span><strong>Career + last 5</strong></div>
              <div className="meta-block"><span>Current view</span><strong>{position} · {statLabel}</strong></div>
            </div>
          </section>

          <section className="overview-strip" aria-label="Dataset summary">
            <div className="overview-main">
              <div className="overview-icon"><Database size={19} /></div>
              <div><span className="overview-kicker">Loaded research set</span><strong>{playerCount} players across four position groups</strong></div>
            </div>
            <div className="overview-stat"><span>Current pool</span><strong>{players.length}</strong><small>{position} players</small></div>
            <div className="overview-stat"><span>Limited history</span><strong>{lowConfidenceCount}</strong><small>low-confidence flags</small></div>
            <div className="overview-stat"><span>Week 1 coverage</span><strong>{weekOneCount}<small> / {players.length}</small></strong><small>actuals in view</small></div>
          </section>

          <section className="control-deck">
            <div className="control-heading">
              <div>
                <span className="section-index">01</span>
                <h2>Choose a lens</h2>
              </div>
              <div className="search-wrap">
                <Search size={16} />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search player, team, or opponent"
                  aria-label="Search player, team, or opponent"
                  data-testid="input-player-search"
                />
                {search && <button type="button" aria-label="Clear search" data-testid="button-clear-search" onClick={() => setSearch('')}><X size={15} /></button>}
              </div>
            </div>
            <div className="segmented-row">
              <div className="segmented-group position-segment">
                {POSITIONS.map((item) => (
                  <button
                    key={item}
                    className={position === item ? 'selected' : ''}
                    type="button"
                    data-testid={`button-control-position-${item.toLowerCase()}`}
                    onClick={() => changePosition(item)}
                  >{item}</button>
                ))}
              </div>
              <div className="divider-vertical" />
              <div className="segmented-group stat-segment">
                {STAT_TYPES[position].map((item) => (
                  <button
                    key={item.key}
                    className={statKey === item.key ? 'selected' : ''}
                    type="button"
                    data-testid={`button-stat-${item.key}`}
                    onClick={() => setStatKey(item.key)}
                  >{item.label}</button>
                ))}
              </div>
            </div>
          </section>

          <section className="workspace-grid">
            <div className="roster-panel">
              <div className="panel-heading">
                <div><span className="section-index">02</span><h2>Player board</h2></div>
                <span className="result-count">{filteredPlayers.length} of {players.length}</span>
              </div>
              <div className="roster-list">
                {filteredPlayers.length ? filteredPlayers.map((player, index) => (
                  <PlayerRow
                    key={player.name}
                    player={player}
                    rank={index + 1}
                    statKey={statKey}
                    active={player.name === selectedName}
                    line={lines[`${position}:${statKey}:${player.name}`] ?? ''}
                    onSelect={() => setSelectedName(player.name)}
                  />
                )) : (
                  <div className="empty-roster">
                    <div className="empty-icon"><Search size={19} /></div>
                    <strong>No players found</strong>
                    <span>Try a name, team code, or opponent.</span>
                    <button type="button" data-testid="button-reset-search" onClick={() => setSearch('')}>Reset search</button>
                  </div>
                )}
              </div>
            </div>

            <DetailPanel
              player={activePlayer}
              position={position}
              statKey={statKey}
              statLabel={statLabel}
              line={activeLine}
              setLine={(value) => setLines((previous) => ({ ...previous, [lineKey]: value }))}
              lean={lean}
            />
          </section>

          <footer className="page-footer">
            <div><span className="footer-mark">FN</span><span>Field Note Research Cockpit</span></div>
            <span>Model output is a trend signal, not a recommendation.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function PlayerRow({
  player,
  rank,
  statKey,
  active,
  line,
  onSelect,
}: {
  player: Player;
  rank: number;
  statKey: string;
  active: boolean;
  line: string;
  onSelect: () => void;
}) {
  const stat = player.stats[statKey];
  const lean = leanFromLine(stat, line);
  return (
    <button
      className={`player-row ${active ? 'active' : ''}`}
      type="button"
      onClick={onSelect}
      data-testid={`button-player-${player.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      <span className="player-rank">{String(rank).padStart(2, '0')}</span>
      <span className="player-avatar">{initials(player.name)}</span>
      <span className="player-info">
        <strong>{player.name}</strong>
        <span>{player.team} <i>@</i> {player.week2Opp} <i>·</i> {stat?.isHome ? 'Home' : 'Away'}</span>
      </span>
      <span className="player-row-right">
        {lean.lean !== '—' && <LeanPill lean={lean.lean} compact />}
        {player.isLowConfidence && <span className="tiny-flag">Limited</span>}
        {active && <span className="active-arrow"><ArrowUpRight size={14} /></span>}
      </span>
    </button>
  );
}

function LeanPill({ lean, confidence, compact = false }: { lean: Lean; confidence?: string | null; compact?: boolean }) {
  const icon = lean === 'OVER' ? <ArrowUpRight size={compact ? 12 : 15} /> : lean === 'UNDER' ? <ArrowDownRight size={compact ? 12 : 15} /> : <Minus size={compact ? 12 : 15} />;
  return (
    <span className={`lean-pill lean-${lean.toLowerCase()} ${compact ? 'compact' : ''}`} data-testid={`status-lean-${lean.toLowerCase()}`}>
      {icon}<b>{lean}</b>{confidence && <small>{confidence}</small>}
    </span>
  );
}

function DetailPanel({
  player,
  position,
  statKey,
  statLabel,
  line,
  setLine,
  lean,
}: {
  player: Player | null;
  position: Position;
  statKey: string;
  statLabel: string;
  line: string;
  setLine: (value: string) => void;
  lean: ReturnType<typeof leanFromLine>;
}) {
  if (!player) {
    return (
      <section className="detail-panel detail-empty">
        <div className="empty-detail-art"><Target size={34} /></div>
        <span className="section-index">03</span>
        <h2>Load a player signal</h2>
        <p>Select a player from the board to compare the model projection against their baseline, recent form, and matchup environment.</p>
      </section>
    );
  }

  const stat = player.stats[statKey];
  const hasProjection = stat?.projection !== null && stat?.projection !== undefined;
  const effectiveConfidence = player.isLowConfidence ? 'Low' : lean.confidence;
  const matchupLabel = stat?.matchupFactor === undefined || stat?.matchupFactor === null
    ? 'No factor'
    : stat.matchupFactor > 1.05 ? 'Favorable'
      : stat.matchupFactor < 0.95 ? 'Difficult' : 'Neutral';
  const chartData = [
    { label: 'Career baseline', value: stat?.priorAvg ?? null, fill: '#8b97a8' },
    { label: 'Last 5 average', value: stat?.priorLast5 ?? null, fill: '#4f6477' },
    { label: 'Model projection', value: stat?.projection ?? null, fill: player.isLowConfidence ? '#31a68d' : '#eab84c' },
  ].filter((item) => item.value !== null);

  return (
    <section className="detail-panel">
      <div className="detail-topline">
        <div className="detail-identity">
          <div className="large-avatar">{initials(player.name)}</div>
          <div>
            <div className="detail-kicker">{position} / {statLabel}</div>
            <h2 data-testid="text-selected-player">{player.name}</h2>
            <div className="detail-context"><strong>{player.team}</strong><span>vs</span><strong>{player.week2Opp}</strong><span className="context-home">{stat?.isHome ? <><House size={13} /> Home</> : 'Away'}</span></div>
          </div>
        </div>
        <div className="line-control">
          <label htmlFor="prop-line">Your line</label>
          <div className="line-input-wrap">
            <input
              id="prop-line"
              type="number"
              inputMode="decimal"
              step="0.5"
              value={line}
              onChange={(event) => setLine(event.target.value)}
              placeholder="64.5"
              aria-label="Enter sportsbook prop line"
              data-testid="input-prop-line"
            />
            <span>{statLabel === 'Receptions' ? 'REC' : 'YDS'}</span>
          </div>
        </div>
      </div>

      <div className="detail-alerts">
        {player.injuryStatus && <span className="alert-chip injury"><AlertTriangle size={13} /> {player.injuryStatus}</span>}
        {player.isLowConfidence && <span className="alert-chip limited"><Gauge size={13} /> Limited history · {stat?.nPriorGames ?? 0} games</span>}
        {!player.injuryStatus && !player.isLowConfidence && <span className="alert-chip clear"><Sparkles size={13} /> Full-history signal</span>}
      </div>

      {!hasProjection ? (
        <NoDataPanel statLabel={statLabel} />
      ) : (
        <>
          <div className="decision-band">
            <div className="decision-copy">
              <span className="decision-label">Model read</span>
              <div className="decision-value">{lean.lean === '—' ? 'Enter a line to compare' : <LeanPill lean={lean.lean} confidence={effectiveConfidence} />}</div>
              <span className="decision-caption">{lean.edge === null ? 'Projection is ready when you are.' : `${Math.abs(lean.edge).toFixed(1)} ${statLabel.toLowerCase()} edge vs your line`}</span>
            </div>
            <div className="projection-hero">
              <span>Model projection</span>
              <strong data-testid="text-model-projection">{formatValue(stat.projection)}</strong>
              <small>{statLabel.toLowerCase()}</small>
            </div>
            <div className="edge-meter">
              <div className="meter-label"><span>Confidence</span><strong>{effectiveConfidence ?? '—'}</strong></div>
              <div className="meter-track"><span style={{ width: `${effectiveConfidence === 'High' ? 88 : effectiveConfidence === 'Medium' ? 61 : effectiveConfidence === 'Low' ? 34 : 8}%` }} /></div>
              <div className="meter-note">Based on edge and history depth</div>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Career baseline" value={stat.priorAvg} sub={stat.nPriorGames ? `${stat.nPriorGames} games on record` : 'No history'} />
            <MetricCard label="Last 5 average" value={stat.priorLast5} sub={stat.priorLast5 && stat.priorAvg ? `${stat.priorLast5 >= stat.priorAvg ? '+' : ''}${formatValue(stat.priorLast5 - stat.priorAvg)} vs career` : 'Not available'} />
            <MetricCard label="Matchup factor" value={stat.matchupFactor === null || stat.matchupFactor === undefined ? null : stat.matchupFactor} suffix="x" sub={matchupLabel} tone={matchupLabel === 'Favorable' ? 'positive' : matchupLabel === 'Difficult' ? 'negative' : undefined} />
            <MetricCard label="Week 1 actual" value={stat.week1Actual} sub={stat.week1Actual === null || stat.week1Actual === undefined ? 'Not in source data' : `${statLabel.toLowerCase()} logged`} />
          </div>

          <div className="comparison-grid">
            <div className="chart-card">
              <div className="card-header"><div><span className="card-overline">The comparison</span><h3>Baseline vs projection</h3></div><span className="chart-unit">{statLabel}</span></div>
              {chartData.length > 0 ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 42, left: 8, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="#e2e5e8" />
                      <XAxis type="number" hide domain={[0, 'dataMax + 20']} />
                      <YAxis type="category" dataKey="label" width={104} axisLine={false} tickLine={false} tick={{ fill: '#687384', fontSize: 10.5, fontFamily: 'Plus Jakarta Sans' }} />
                      <Tooltip cursor={{ fill: '#f2f2ed' }} contentStyle={{ background: '#222933', border: 'none', borderRadius: 7, color: '#fff', fontSize: 11 }} formatter={(value: number) => [`${formatValue(value)} ${statLabel.toLowerCase()}`, 'Value']} />
                      {line && !Number.isNaN(Number(line)) && <ReferenceLine x={Number(line)} stroke="#202832" strokeDasharray="4 4" label={{ value: 'LINE', fill: '#687384', fontSize: 9, position: 'top' }} />}
                      <Bar dataKey="value" radius={[2, 5, 5, 2]} barSize={22}>
                        {chartData.map((item) => <Cell key={item.label} fill={item.fill} />)}
                        <LabelList dataKey="value" position="right" formatter={(value: number) => formatValue(value)} fill="#222933" fontSize={11} fontWeight={700} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="chart-no-data">Baseline history is not available for this player yet.</div>}
              <div className="chart-legend"><span><i className="legend-dot neutral" />Career</span><span><i className="legend-dot recent" />Last 5</span><span><i className="legend-dot projection" />Projection</span>{line && <span><i className="legend-line" />Your line</span>}</div>
            </div>
            <div className="signal-card">
              <div className="card-header"><div><span className="card-overline">Context readout</span><h3>Three things to know</h3></div><Sparkles size={17} /></div>
              <SignalRow icon={<Activity size={16} />} label="Recent shape" value={trendLabel(stat.priorAvg, stat.priorLast5)} detail={trendDetail(stat.priorAvg, stat.priorLast5)} />
              <SignalRow icon={<Target size={16} />} label="Opponent matchup" value={`${formatValue(stat.matchupFactor, 2)}x · ${matchupLabel}`} detail="Relative environment adjustment in model" tone={matchupLabel === 'Favorable' ? 'positive' : matchupLabel === 'Difficult' ? 'negative' : undefined} />
              <SignalRow icon={<House size={16} />} label="Venue context" value={stat.isHome ? 'Home field' : 'On the road'} detail="Included as a model input" />
              <div className="signal-note"><CircleHelp size={14} /><span>Use the projection as a starting point, then inspect what is driving the gap.</span></div>
            </div>
          </div>

          <div className="method-note">
            <div className="method-icon"><Shield size={17} /></div>
            <div><strong>How to read this panel</strong><p>{player.isLowConfidence ? `This player has only ${stat?.nPriorGames ?? 0} prior game${stat?.nPriorGames === 1 ? '' : 's'} in the current-team sample. Treat the projection and baseline comparison as directional.` : 'The model blends career baseline, recent form, home/away context, team performance, and opponent matchup variables selected through cross-validated historical testing.'} This dashboard is a trend and matchup research aid — not betting advice.</p></div>
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value, sub, suffix = '', tone }: { label: string; value?: number | null; sub?: string; suffix?: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : ''}>{formatValue(value)}{value !== null && value !== undefined ? suffix : ''}</strong>
      <small>{sub}</small>
    </div>
  );
}

function SignalRow({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: 'positive' | 'negative' }) {
  return (
    <div className="signal-row">
      <div className="signal-icon">{icon}</div>
      <div><span>{label}</span><strong className={tone ? `tone-${tone}` : ''}>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function NoDataPanel({ statLabel }: { statLabel: string }) {
  return (
    <div className="no-data-panel">
      <div className="no-data-icon"><Database size={23} /></div>
      <div><h3>No {statLabel.toLowerCase()} projection available</h3><p>The loaded dataset does not contain a model projection for this stat. Try another stat type or player while keeping the context above in view.</p></div>
      <span className="no-data-code">NULL / PROJECTION</span>
    </div>
  );
}

function trendLabel(career?: number | null, recent?: number | null) {
  if (career === null || career === undefined || recent === null || recent === undefined) return 'History unavailable';
  const delta = recent - career;
  if (Math.abs(delta) < career * 0.04) return 'Holding steady';
  return delta > 0 ? 'Trending up' : 'Trending down';
}

function trendDetail(career?: number | null, recent?: number | null) {
  if (career === null || career === undefined || recent === null || recent === undefined) return 'No last-5 comparison in source data';
  const delta = recent - career;
  return `${delta >= 0 ? '+' : ''}${formatValue(delta)} vs career baseline`;
}

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={AppShell} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}