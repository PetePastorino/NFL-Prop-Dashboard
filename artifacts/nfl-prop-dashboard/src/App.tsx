import { useMemo, useState } from 'react';
import sourceText from '@assets/0_prop_matchup_dashboard_(1)_1789679044969.jsx?raw';
import { INITIAL_PROP_LINES } from '@/data/initial-prop-lines';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ClipboardPaste,
  ChevronDown,
  CircleHelp,
  Database,
  Gauge,
  House,
  ListFilter,
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
type RankedProp = {
  key: string;
  position: Position;
  statKey: string;
  statLabel: string;
  player: Player;
  stat: StatSnapshot;
  line: string;
  lean: ReturnType<typeof leanFromLine>;
  confidence: 'High' | 'Medium' | 'Low';
  confidenceScore: number;
};

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
const STAT_ALIASES: Record<string, string[]> = {
  pass_yards: ['passing yards', 'pass yards', 'pass yds', 'passing yds', 'pass yard'],
  rush_yards: ['rushing yards', 'rush yards', 'rush yds', 'rushing yds', 'rush yard'],
  rec_yards: ['receiving yards', 'rec yards', 'receiving yds', 'rec yds', 'rec yard'],
  receptions: ['receptions', 'reception', 'catches', 'catch', 'rec pts', 'recpt'],
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

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function statKeyFromText(value: string, position?: Position) {
  const availableStats = position ? STAT_TYPES[position] : Object.values(STAT_TYPES).flat();
  const normalizedValue = normalized(value);
  return availableStats
    .flatMap((stat) =>
      [stat.key, stat.label, ...(STAT_ALIASES[stat.key] ?? [])]
        .map((alias) => ({ key: stat.key, alias: normalized(alias) }))
        .filter(({ alias }) => alias && normalizedValue.includes(alias)),
    )
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.key;
}

function matchupKey(player: Pick<Player, 'team' | 'week2Opp'>) {
  return [player.team, player.week2Opp].sort().join('|');
}

function matchupLabel(key: string) {
  return key.split('|').join(' vs ');
}

function getConfidence(player: Player, stat: StatSnapshot, line: string) {
  const lean = leanFromLine(stat, line);
  if (lean.edgePct === null || lean.edge === null) {
    return { confidence: 'Low' as const, confidenceScore: 0 };
  }

  const edgeScore = Math.min(Math.abs(lean.edgePct) * 100, 32);
  const historyScore = Math.min(stat.nPriorGames / 50, 1) * 42;
  const limitedHistoryPenalty = player.isLowConfidence ? 18 : 0;
  const injuryPenalty = player.injuryStatus ? 10 : 0;
  const confidenceScore = Math.max(
    0,
    Math.min(100, Math.round(edgeScore + historyScore + 26 - limitedHistoryPenalty - injuryPenalty)),
  );
  const confidence: 'High' | 'Medium' | 'Low' =
    confidenceScore >= 72 ? 'High' : confidenceScore >= 48 ? 'Medium' : 'Low';

  return { confidence, confidenceScore };
}

function parseBulkLines(input: string) {
  const allPlayers = (Object.entries(PLAYER_DATA) as [Position, Player[]][]).flatMap(
    ([position, roster]) => roster.map((player) => ({ position, player })),
  );
  const accepted: { key: string; line: string }[] = [];
  const errors: string[] = [];
  let currentStatKey: string | undefined;

  input
    .split(/\r?\n|;/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const normalizedEntry = normalized(entry);
      const match = allPlayers
        .slice()
        .sort((a, b) => b.player.name.length - a.player.name.length)
        .find(({ player }) => {
          const playerName = normalized(player.name);
          return normalizedEntry.includes(playerName) ||
            normalizedEntry.replace(/\s/g, '').includes(playerName.replace(/\s/g, ''));
        });
      const headingStatKey = statKeyFromText(entry);
      if (!match && headingStatKey && /yards|receptions|reception/i.test(entry)) {
        currentStatKey = headingStatKey;
        return;
      }
      const statKey = match
        ? currentStatKey ?? statKeyFromText(entry, match.position)
        : undefined;
      const numbers = entry.match(/-?\d+(?:\.\d+)?/g);
      const line = numbers?.at(-1);

      if (!match) {
        errors.push(`Could not match a player: “${entry}”`);
        return;
      }
      if (!statKey) {
        errors.push(`Add a stat type for ${match.player.name} (for example, rec yards).`);
        return;
      }
      if (!line || Number.isNaN(Number(line))) {
        errors.push(`Could not find a prop line for ${match.player.name}.`);
        return;
      }
      if (!match.player.stats[statKey]?.projection && match.player.stats[statKey]?.projection !== 0) {
        errors.push(`No ${STAT_TYPES[match.position].find((stat) => stat.key === statKey)?.label.toLowerCase()} projection for ${match.player.name}.`);
        return;
      }

      accepted.push({
        key: `${match.position}:${statKey}:${match.player.name}`,
        line,
      });
    });

  return { accepted, errors };
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
  const [gameFilter, setGameFilter] = useState('all');
  const initialImport = useMemo(() => parseBulkLines(INITIAL_PROP_LINES), []);
  const [lines, setLines] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialImport.accepted.map((item) => [item.key, item.line])),
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bulkLines, setBulkLines] = useState(INITIAL_PROP_LINES);
  const [bulkOpen, setBulkOpen] = useState(true);
  const [importFeedback, setImportFeedback] = useState<{ accepted: number; errors: string[] } | null>(() => ({
    accepted: initialImport.accepted.length,
    errors: initialImport.errors,
  }));

  const players = PLAYER_DATA[position] ?? [];
  const gameOptions = useMemo(() => {
    const keys = new Set(
      (Object.values(PLAYER_DATA) as Player[][])
        .flat()
        .map((player) => matchupKey(player)),
    );
    return Array.from(keys)
      .sort()
      .map((key) => ({ key, label: matchupLabel(key) }));
  }, []);
  const playersForGame = useMemo(
    () =>
      gameFilter === 'all'
        ? players
        : players.filter((player) => matchupKey(player) === gameFilter),
    [gameFilter, players],
  );
  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return playersForGame;
    return playersForGame.filter((player) =>
      [player.name, player.team, player.week2Opp].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [playersForGame, search]);

  const activePlayer =
    playersForGame.find((player) => player.name === selectedName) ?? null;
  const statLabel =
    STAT_TYPES[position].find((stat) => stat.key === statKey)?.label ?? '';
  const lineKey = `${position}:${statKey}:${selectedName ?? ''}`;
  const activeLine = lines[lineKey] ?? '';
  const activeStat = activePlayer?.stats[statKey];
  const lean = leanFromLine(activeStat, activeLine);
  const rankedProps = useMemo<RankedProp[]>(() => {
    return (Object.entries(PLAYER_DATA) as [Position, Player[]][])
      .flatMap(([entryPosition, roster]) =>
        roster.flatMap((player) =>
          STAT_TYPES[entryPosition].flatMap((statDefinition) => {
            const key = `${entryPosition}:${statDefinition.key}:${player.name}`;
            const line = lines[key];
            const stat = player.stats[statDefinition.key];
            if (!line || !stat || stat.projection === null || stat.projection === undefined) return [];
            const lineLean = leanFromLine(stat, line);
            const confidence = getConfidence(player, stat, line);
            return [{
              key,
              position: entryPosition,
              statKey: statDefinition.key,
              statLabel: statDefinition.label,
              player,
              stat,
              line,
              lean: lineLean,
              ...confidence,
            }];
          }),
        ),
      )
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
  }, [lines]);
  const gameRankedProps = useMemo(
    () =>
      gameFilter === 'all'
        ? rankedProps
        : rankedProps.filter((prop) => matchupKey(prop.player) === gameFilter),
    [gameFilter, rankedProps],
  );
  const playerCount = Object.values(PLAYER_DATA).reduce(
    (total, roster) => total + roster.length,
    0,
  );
  const lowConfidenceCount = playersForGame.filter((player) => player.isLowConfidence).length;
  const weekOneCount = playersForGame.filter(
    (player) => player.stats[statKey]?.week1Actual !== null && player.stats[statKey]?.week1Actual !== undefined,
  ).length;

  const changePosition = (nextPosition: Position) => {
    setPosition(nextPosition);
    setStatKey(STAT_TYPES[nextPosition][0].key);
    const nextPlayers = (PLAYER_DATA[nextPosition] ?? []).filter(
      (player) => gameFilter === 'all' || matchupKey(player) === gameFilter,
    );
    setSelectedName(nextPlayers[0]?.name ?? null);
    setSearch('');
    setMobileNavOpen(false);
  };

  const changeGame = (nextGame: string) => {
    setGameFilter(nextGame);
    setSearch('');
    const nextPlayers = players.filter(
      (player) => nextGame === 'all' || matchupKey(player) === nextGame,
    );
    setSelectedName(nextPlayers[0]?.name ?? null);
  };

  const importLines = () => {
    const result = parseBulkLines(bulkLines);
    if (result.accepted.length) {
      setLines((previous) => ({
        ...previous,
        ...Object.fromEntries(result.accepted.map((item) => [item.key, item.line])),
      }));
    }
    setImportFeedback({ accepted: result.accepted.length, errors: result.errors });
  };

  const selectRankedProp = (prop: RankedProp) => {
    setPosition(prop.position);
    setStatKey(prop.statKey);
    setSelectedName(prop.player.name);
    setSearch('');
    window.requestAnimationFrame(() => {
      document.querySelector('.detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
            <div className="overview-stat"><span>Current pool</span><strong>{playersForGame.length}</strong><small>{position} players</small></div>
            <div className="overview-stat"><span>Limited history</span><strong>{lowConfidenceCount}</strong><small>low-confidence flags</small></div>
            <div className="overview-stat"><span>Week 1 coverage</span><strong>{weekOneCount}<small> / {playersForGame.length}</small></strong><small>actuals in view</small></div>
          </section>

          <section className="control-deck">
            <div className="control-heading">
              <div>
                <span className="section-index">01</span>
                <h2>Choose a lens</h2>
              </div>
              <div className="control-tools">
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
                <label className="game-filter">
                  <span>Game</span>
                  <select value={gameFilter} onChange={(event) => changeGame(event.target.value)} aria-label="Filter by game" data-testid="select-game-filter">
                    <option value="all">All games</option>
                    {gameOptions.map((game) => <option key={game.key} value={game.key}>{game.label}</option>)}
                  </select>
                </label>
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
            <div className="bulk-import">
              <div className="bulk-import-heading">
                <div className="bulk-import-title">
                  <span className="bulk-import-icon"><ClipboardPaste size={15} /></span>
                  <div><strong>Paste multiple prop lines</strong><span>One player per line · player + stat + number</span></div>
                </div>
                <button type="button" className="text-button" onClick={() => setBulkOpen((open) => !open)} data-testid="button-toggle-bulk-import">
                  {bulkOpen ? 'Hide importer' : 'Show importer'} <ChevronDown size={13} className={bulkOpen ? 'rotate-chevron' : ''} />
                </button>
              </div>
              {bulkOpen && (
                <div className="bulk-import-body">
                  <textarea
                    value={bulkLines}
                    onChange={(event) => {
                      setBulkLines(event.target.value);
                      setImportFeedback(null);
                    }}
                    placeholder={'Puka Nacua rec yards 75.5\nJosh Allen pass yards 245.5\nBijan Robinson rush yards 78.5'}
                    aria-label="Paste prop lines"
                    data-testid="textarea-bulk-lines"
                  />
                  <div className="bulk-import-actions">
                    <span>Over/under words are optional — the number is used as the line.</span>
                    <button type="button" className="apply-lines-button" onClick={importLines} disabled={!bulkLines.trim()} data-testid="button-apply-lines">
                      <Check size={14} /> Apply lines
                    </button>
                  </div>
                  {importFeedback && (
                    <div className={`import-feedback ${importFeedback.errors.length ? 'has-errors' : 'success'}`}>
                      <strong>{importFeedback.accepted ? `${importFeedback.accepted} line${importFeedback.accepted === 1 ? '' : 's'} loaded` : 'No lines loaded'}</strong>
                      {importFeedback.errors.length > 0 && <span>{importFeedback.errors.slice(0, 2).join(' ') }{importFeedback.errors.length > 2 ? ` + ${importFeedback.errors.length - 2} more` : ''}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="confidence-panel" aria-label="Confidence rankings">
            <div className="confidence-panel-heading">
              <div className="confidence-title">
                <span className="section-index">02</span>
                <div><h2>Confidence board</h2><p>Ranked from edge size, history depth, and availability flags.</p></div>
              </div>
              <div className="confidence-summary"><ListFilter size={15} /> {gameRankedProps.length ? `${gameRankedProps.length} lines ranked` : 'Waiting for lines'}</div>
            </div>
            {gameRankedProps.length ? (
              <div className="ranking-list">
                {gameRankedProps.slice(0, 10).map((prop, index) => (
                  <button type="button" className="ranking-row" key={prop.key} onClick={() => selectRankedProp(prop)} data-testid={`button-ranked-prop-${index + 1}`}>
                    <span className="ranking-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="ranking-player">
                      <strong>{prop.player.name}</strong>
                      <span>{prop.position} · {prop.statLabel} · {prop.player.team} vs {prop.player.week2Opp}</span>
                    </span>
                    <span className="ranking-line">{prop.line}</span>
                    <LeanPill lean={prop.lean.lean} confidence={prop.confidence} compact />
                    <span className={`confidence-score confidence-${prop.confidence.toLowerCase()}`}>{prop.confidenceScore}<small>/100</small></span>
                    <ArrowUpRight size={14} className="ranking-arrow" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="confidence-empty">
                <div className="confidence-empty-icon"><ListFilter size={18} /></div>
                <div><strong>Your strongest signals will appear here</strong><span>Paste your sportsbook lines above to rank every loaded prop by model confidence.</span></div>
              </div>
            )}
          </section>

          <section className="workspace-grid">
            <div className="roster-panel">
              <div className="panel-heading">
                <div><span className="section-index">03</span><h2>Player board</h2></div>
                <span className="result-count">{filteredPlayers.length} of {playersForGame.length}</span>
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
        <span className="section-index">04</span>
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