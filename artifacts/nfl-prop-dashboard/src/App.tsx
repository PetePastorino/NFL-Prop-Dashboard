import { useMemo, useState } from 'react';
import playerDataJson from '@/data/player-data.json';
import hybridConfidenceJson from '@/data/hybrid-confidence-calibration.json';
import { WEEK7_INITIAL_PROP_LINES as INITIAL_PROP_LINES } from '@/data/week7-initial-prop-lines';
import { WEEKLY_HISTORY, type RecordSummary } from '@/data/weekly-history';
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
  History,
  House,
  ListFilter,
  Menu,
  Minus,
  Search,
  Shield,
  Sparkles,
  Target,
  Trophy,
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
  rawProjection?: number | null;
  gameEnvFactor?: number | null;
  projectionBeforeRoleAdjustment?: number | null;
  currentSeasonAvg?: number | null;
  currentDepthRole?: string | null;
  currentSeasonWeight?: number | null;
  appliedGameEnvFactor?: number | null;
  lowConfidence?: boolean;
  nPriorGames: number;
  priorAvg?: number | null;
  priorLast5?: number | null;
  matchupFactor?: number | null;
  isHome?: boolean | null;
  week1Actual?: number | null;
  week2Actual?: number | null;
  week3Actual?: number | null;
  week4Actual?: number | null;
  week5Actual?: number | null;
  week6Actual?: number | null;
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
type PickLean = 'OVER' | 'UNDER';
type CalibrationStat = { mean: number; count: number };
type HybridConfidenceCalibration = {
  breakevenRate: number;
  globalMae: number;
  propMae: Record<string, CalibrationStat>;
  segmentMae: Record<string, CalibrationStat>;
  reliability: Record<string, { wins: number; count: number }>;
  sourceWeeks: number[];
  sourceRows: number;
};

const isPlayerUnavailable = (player: Player) =>
  /(?:^|\b)(?:out|doubtful|injured reserve|reserve-ret|ir|pup|nfi|suspended)(?:\b|$)/i.test(
    player.injuryStatus ?? '',
  );
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

const PLAYER_DATA = playerDataJson as unknown as PlayerData;
const CURRENT_WEEK_PROJECTIONS_READY = false;
const HYBRID_CONFIDENCE = hybridConfidenceJson as HybridConfidenceCalibration;
const PETES_NO_BET_PLAYERS = new Set(['Evan Engram', 'Alvin Kamara']);

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

function venueLabel(isHome: boolean | null | undefined) {
  if (isHome === null) return 'Neutral';
  return isHome ? 'Home' : 'Away';
}

function playerMatchupLabel(player: Pick<Player, 'team' | 'week2Opp'>, isHome: boolean | null | undefined) {
  if (isHome === null) return `${player.team} vs ${player.week2Opp}`;
  return isHome ? `${player.week2Opp} @ ${player.team}` : `${player.team} @ ${player.week2Opp}`;
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

function confidenceLabel(score: number): 'High' | 'Medium' | 'Low' {
  return score >= 72 ? 'High' : score >= 48 ? 'Medium' : 'Low';
}

function hybridConfidenceScore(prop: RankedProp) {
  if (prop.lean.lean === 'PASS' || prop.lean.lean === '—') return 0;
  const edge = Math.abs(prop.lean.edge ?? 0);
  const edgePct = Math.abs(prop.lean.edgePct ?? 0);
  const pick = prop.lean.lean as PickLean;
  const propCalibration = HYBRID_CONFIDENCE.propMae[prop.statKey] ?? {
    mean: HYBRID_CONFIDENCE.globalMae,
    count: 0,
  };
  const propMae = (
    propCalibration.count * propCalibration.mean
    + 60 * HYBRID_CONFIDENCE.globalMae
  ) / (propCalibration.count + 60);
  const segmentCalibration = HYBRID_CONFIDENCE.segmentMae[`${prop.statKey}|${pick}`] ?? {
    mean: propMae,
    count: 0,
  };
  const expectedError = (
    segmentCalibration.count * segmentCalibration.mean
    + 30 * propMae
  ) / (segmentCalibration.count + 30);
  const standardizedEdge = edge / Math.max(expectedError, 0.25);
  const errorAdjustedScore = 100 * (1 - Math.exp(-1.273 * standardizedEdge));

  const edgeBand = edgePct < 0.10 ? '4-10' : edgePct < 0.18 ? '10-18' : edgePct < 0.30 ? '18-30' : '30+';
  const reliability = HYBRID_CONFIDENCE.reliability[`${prop.statKey}|${pick}|${edgeBand}`] ?? {
    wins: 0,
    count: 0,
  };
  const reliableRate = (
    reliability.wins + 40 * HYBRID_CONFIDENCE.breakevenRate
  ) / (reliability.count + 40);
  const reliabilityScore = Math.max(
    20,
    Math.min(80, 50 + 200 * (reliableRate - HYBRID_CONFIDENCE.breakevenRate)),
  );

  const historyScore = Math.min(prop.stat.nPriorGames / 50, 1) * 42;
  const earlyScore = Math.max(0, Math.min(100, Math.round(
    Math.min(edgePct * 100, 32)
    + historyScore
    + 26
    - (prop.player.isLowConfidence || prop.stat.lowConfidence ? 18 : 0)
    - (prop.player.injuryStatus ? 10 : 0),
  )));
  let score = 1.08 * (
    0.45 * earlyScore
    + 0.35 * errorAdjustedScore
    + 0.20 * reliabilityScore
  );

  const baselines = [prop.stat.priorAvg, prop.stat.priorLast5].filter(
    (value): value is number => value !== null && value !== undefined && Number.isFinite(value),
  );
  if (baselines.length) {
    const baseline = baselines.reduce((total, value) => total + value, 0) / baselines.length;
    const outlierRatio = Math.abs((prop.stat.projection ?? baseline) - baseline) / Math.max(expectedError, 0.25);
    if (outlierRatio > 2.5) score = Math.min(score, 79);
    else if (outlierRatio > 1.5) score = Math.min(score, 89);
  }
  if (reliableRate < 0.50) score = Math.min(score, 71);
  if (prop.player.isLowConfidence || prop.stat.lowConfidence) score = Math.min(score, 74);
  if (prop.player.injuryStatus) score = Math.min(score, 79);
  return Math.round(Math.max(0, Math.min(100, score)));
}

function spreadBoardStrengthScores(props: RankedProp[]) {
  return props.map((prop) => {
    const confidenceScore = hybridConfidenceScore(prop);
    return {
      ...prop,
      confidence: confidenceLabel(confidenceScore),
      confidenceScore,
    };
  }).sort((a, b) =>
    b.confidenceScore - a.confidenceScore
    || Math.abs(b.lean.edge ?? 0) - Math.abs(a.lean.edge ?? 0)
    || a.key.localeCompare(b.key),
  );
}

function strongestPropPerPlayer(props: RankedProp[]) {
  const includedPlayers = new Set<string>();
  return props.filter((prop) => {
    const playerKey = normalized(prop.player.name);
    if (includedPlayers.has(playerKey)) return false;
    includedPlayers.add(playerKey);
    return true;
  });
}

function parseBulkLines(input: string, ignoreUnsupported = false) {
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
      // Treat text-only rows as optional section headings. An unmatched
      // player line still contains a number and must never change the market
      // applied to later entries.
      if (!match && !/-?\d+(?:\.\d+)?/.test(entry) && headingStatKey && /yards|receptions|reception/i.test(entry)) {
        currentStatKey = headingStatKey;
        return;
      }
      const statKey = match
        // An explicit market on the player row always wins over a remembered
        // section heading (for example, Receiving Yards vs Receptions).
        ? statKeyFromText(entry, match.position) ?? currentStatKey
        : undefined;
      const numbers = entry.match(/-?\d+(?:\.\d+)?/g);
      const line = numbers?.at(-1);

      if (!match) {
        if (!ignoreUnsupported) errors.push(`Could not match a player: “${entry}”`);
        return;
      }
      if (!statKey) {
        if (!ignoreUnsupported) errors.push(`Add a stat type for ${match.player.name} (for example, rec yards).`);
        return;
      }
      if (!line || Number.isNaN(Number(line))) {
        errors.push(`Could not find a prop line for ${match.player.name}.`);
        return;
      }
      if (!match.player.stats[statKey]?.projection && match.player.stats[statKey]?.projection !== 0) {
        if (!ignoreUnsupported) errors.push(`No ${STAT_TYPES[match.position].find((stat) => stat.key === statKey)?.label.toLowerCase()} projection for ${match.player.name}.`);
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
  const [workspaceView, setWorkspaceView] = useState<'dashboard' | 'history'>('dashboard');
  const [position, setPosition] = useState<Position>('WR');
  const [statKey, setStatKey] = useState(STAT_TYPES.WR[0].key);
  const [selectedName, setSelectedName] = useState(
    PLAYER_DATA.WR?.[0]?.name ?? null,
  );
  const [search, setSearch] = useState('');
  const [gameFilter, setGameFilter] = useState('all');
  const initialImport = useMemo(() => parseBulkLines(INITIAL_PROP_LINES, true), []);
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
        String(value ?? '').toLowerCase().includes(query),
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
    const props = (Object.entries(PLAYER_DATA) as [Position, Player[]][])
      .flatMap(([entryPosition, roster]) =>
        roster.flatMap((player) =>
          STAT_TYPES[entryPosition].flatMap((statDefinition) => {
            if (isPlayerUnavailable(player)) return [];
            const key = `${entryPosition}:${statDefinition.key}:${player.name}`;
            const line = lines[key];
            const stat = player.stats[statDefinition.key];
            if (!line || !stat || stat.projection === null || stat.projection === undefined) return [];
            const lineLean = leanFromLine(stat, line);
            return [{
              key,
              position: entryPosition,
              statKey: statDefinition.key,
              statLabel: statDefinition.label,
              player,
              stat,
              line,
              lean: lineLean,
              confidence: 'Low' as const,
              confidenceScore: 0,
            }];
          }),
        ),
      );
    return spreadBoardStrengthScores(props);
  }, [lines]);
  const gameRankedProps = useMemo(
    () =>
      gameFilter === 'all'
        ? rankedProps
        : rankedProps.filter((prop) => matchupKey(prop.player) === gameFilter),
    [gameFilter, rankedProps],
  );
  const topPlayerProps = useMemo(
    () => strongestPropPerPlayer(gameRankedProps).slice(0, 10),
    [gameRankedProps],
  );
  const activeRankedProp = rankedProps.find((prop) => prop.key === lineKey);
  const playerCount = Object.values(PLAYER_DATA).reduce(
    (total, roster) => total + roster.length,
    0,
  );
  const lowConfidenceCount = playersForGame.filter((player) => player.isLowConfidence).length;
  const currentWeekCount = playersForGame.filter(
    (player) => player.stats[statKey]?.week6Actual !== null && player.stats[statKey]?.week6Actual !== undefined,
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
          <button className={`side-nav-item ${workspaceView === 'dashboard' ? 'active' : ''}`} type="button" data-testid="button-workspace-dashboard" onClick={() => { setWorkspaceView('dashboard'); setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <BarChart3 size={17} /> Dashboard <span className="nav-pip" />
          </button>
          <button className={`side-nav-item ${workspaceView === 'history' ? 'active' : ''}`} type="button" data-testid="button-workspace-history" onClick={() => { setWorkspaceView('history'); setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <History size={17} /> History {workspaceView === 'history' && <span className="nav-pip" />}
          </button>
          <button className="side-nav-item" type="button" data-testid="button-workspace-methodology" onClick={() => { setWorkspaceView('dashboard'); setMobileNavOpen(false); window.setTimeout(() => document.querySelector('.method-note')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>
            <CircleHelp size={17} /> Methodology
          </button>
        </div>

        {workspaceView === 'dashboard' && <><div className="side-label position-label">Positions</div>
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
        </div></>}

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
          <div className="breadcrumbs"><span>Research</span><ChevronDown size={13} /><strong>{workspaceView === 'history' ? 'History' : 'Prop board'}</strong></div>
          <div className="topbar-right">
            <span className="live-indicator"><span /> Week 7 slate</span>
            <button className="icon-button" type="button" aria-label="Help" data-testid="button-help" onClick={() => document.querySelector('.method-note')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><CircleHelp size={18} /></button>
            <div className="avatar" data-testid="text-user-avatar">RN</div>
          </div>
        </header>

        <div className="content-wrap">
          {workspaceView === 'history' ? <HistoryView /> : <>
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
            <div className="overview-stat"><span>Week 6 coverage</span><strong>{currentWeekCount}<small> / {playersForGame.length}</small></strong><small>latest actuals in view</small></div>
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
                <div><h2>Confidence board</h2><p>Backtested hybrid signal strength blends edge, normal projection error, player history, market reliability, injuries, and projection stability. Every prop is scored independently; each player appears once.</p></div>
              </div>
              <div className="confidence-summary"><ListFilter size={15} /> {gameRankedProps.length ? `${topPlayerProps.length} strongest players · ${gameRankedProps.length} lines ranked` : 'Waiting for lines'}</div>
            </div>
            {topPlayerProps.length ? (
              <div className="ranking-list">
                {topPlayerProps.map((prop, index) => (
                  <button
                    type="button"
                    className={`ranking-row${PETES_NO_BET_PLAYERS.has(prop.player.name) ? ' petes-no-bet' : ''}`}
                    key={prop.key}
                    onClick={() => selectRankedProp(prop)}
                    data-testid={`button-ranked-prop-${index + 1}`}
                  >
                    <span className="ranking-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="ranking-player">
                      <strong>{prop.player.name}</strong>
                      <span>{prop.position} · {prop.statLabel} · {prop.player.team} vs {prop.player.week2Opp}</span>
                      {PETES_NO_BET_PLAYERS.has(prop.player.name) && (
                        <span className="petes-no-bet-badge"><AlertTriangle size={10} /> Pete's no bet</span>
                      )}
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
              confidenceScore={activeRankedProp?.confidenceScore ?? null}
              confidenceLabel={activeRankedProp?.confidence ?? null}
            />
          </section>

          <footer className="page-footer">
            <div><span className="footer-mark">FN</span><span>Field Note Research Cockpit</span></div>
            <span>Model output is a trend signal, not a recommendation.</span>
          </footer>
          </>}
        </div>
      </main>
    </div>
  );
}

function recordTotal(record: RecordSummary) {
  return record.wins + record.losses + record.pushes;
}

function hitRate(record: RecordSummary) {
  const decisions = record.wins + record.losses;
  return decisions ? `${((record.wins / decisions) * 100).toFixed(1)}%` : '—';
}

function recordLabel(record: RecordSummary) {
  return `${record.wins}–${record.losses}${record.pushes ? `–${record.pushes}` : ''}`;
}

function HistoryView() {
  const confidenceCareer = WEEKLY_HISTORY.reduce<RecordSummary>(
    (total, week) => ({
      wins: total.wins + week.highConfidence.wins,
      losses: total.losses + week.highConfidence.losses,
      pushes: total.pushes + week.highConfidence.pushes,
    }),
    { wins: 0, losses: 0, pushes: 0 },
  );
  const topCareer = WEEKLY_HISTORY.reduce<RecordSummary>(
    (total, week) => ({
      wins: total.wins + week.topPicks.wins,
      losses: total.losses + week.topPicks.losses,
      pushes: total.pushes + week.topPicks.pushes,
    }),
    { wins: 0, losses: 0, pushes: 0 },
  );

  return (
    <div className="history-view">
      <section className="history-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> RESULTS LEDGER / 02</div>
          <h1>Track the calls.<br /><em>Keep the receipts.</em></h1>
          <p className="intro-copy">A permanent week-by-week record of every high-confidence call and the confidence board’s strongest picks.</p>
        </div>
        <div className="history-seal"><Trophy size={26} /><span>Top picks</span><strong>{recordLabel(topCareer)}</strong><small>{hitRate(topCareer)} hit rate</small></div>
      </section>

      <section className="history-overview" aria-label="Season record summary">
        <HistoryRecordCard label="All high-confidence picks" record={confidenceCareer} detail={`${recordTotal(confidenceCareer)} graded picks`} />
        <HistoryRecordCard label="Top confidence picks" record={topCareer} detail={`${recordTotal(topCareer)} tracked picks`} featured />
        <div className="history-stat-card"><span>Weeks tracked</span><strong>{WEEKLY_HISTORY.length}</strong><small>2026 season</small></div>
        <div className="history-stat-card"><span>Last updated</span><strong>W{WEEKLY_HISTORY[0]?.week ?? '—'}</strong><small>All games final</small></div>
      </section>

      <section className="history-ledger">
        <div className="history-section-heading">
          <div><span className="section-index">01</span><h2>Weekly ledger</h2></div>
          <span>{WEEKLY_HISTORY.length} completed week{WEEKLY_HISTORY.length === 1 ? '' : 's'}</span>
        </div>
        {WEEKLY_HISTORY.map((week) => {
          const displayedPicks = week.highConfidencePicks ?? week.picks;
          const hasFullConfidenceBoard = Boolean(week.highConfidencePicks);

          return (
          <article className="week-card" key={`${week.season}-${week.week}`}>
            <div className="week-card-head">
              <div><span className="week-badge">WEEK {week.week}</span><h3>{week.season} regular season</h3><p>{week.label} · {week.gamesGraded}/{week.gamesScheduled} games graded</p></div>
              <span className="final-chip"><Check size={13} /> Final</span>
            </div>
            <div className="week-record-grid">
              <HistoryRecordCard label="All high-confidence picks" record={week.highConfidence} detail={`${recordTotal(week.highConfidence)} graded picks`} />
              <HistoryRecordCard label={`Top ${week.topPickLimit} board`} record={week.topPicks} detail={`${recordTotal(week.topPicks)} picks`} featured />
            </div>
            <div className="history-table-heading">
              <strong>{hasFullConfidenceBoard ? 'All high-confidence picks' : `Top ${week.topPickLimit} archived picks`}</strong>
              <span>{displayedPicks.length} picks shown</span>
            </div>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead><tr><th>#</th><th>Player</th><th>Prop</th><th>Call</th><th>Line</th><th>Projection</th><th>Actual</th><th>Result</th></tr></thead>
                <tbody>
                  {displayedPicks.map((pick, index) => (
                    <tr key={`${week.week}-${pick.player}-${pick.stat}`}>
                      <td>{String(index + 1).padStart(2, '0')}</td>
                      <td><strong>{pick.player}</strong><span>{pick.position}</span></td>
                      <td>{pick.stat}</td>
                      <td><span className={`history-call ${pick.lean.toLowerCase()}`}>{pick.lean}</span></td>
                      <td>{formatValue(pick.line)}</td>
                      <td>{formatValue(pick.projection)}</td>
                      <td>{formatValue(pick.actual)}</td>
                      <td><span className={`result-pill ${pick.result.toLowerCase()}`}>{pick.result}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {week.note && <p className="week-note"><CircleHelp size={13} /> {week.note}</p>}
          </article>
          );
        })}
      </section>
      <footer className="page-footer"><div><span className="footer-mark">FN</span><span>Field Note Results Ledger</span></div><span>Records use imported lines and exclude PASS calls. Full high-confidence detail begins with Week 4.</span></footer>
    </div>
  );
}

function HistoryRecordCard({ label, record, detail, featured = false }: { label: string; record: RecordSummary; detail: string; featured?: boolean }) {
  return (
    <div className={`history-record-card ${featured ? 'featured' : ''}`}>
      <span>{label}</span>
      <div><strong>{recordLabel(record)}</strong><em>{hitRate(record)}</em></div>
      <small>{detail} · W–L{record.pushes ? '–P' : ''}</small>
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
        <span>{playerMatchupLabel(player, stat?.isHome)} <i>·</i> {venueLabel(stat?.isHome)}</span>
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
  confidenceScore,
  confidenceLabel,
}: {
  player: Player | null;
  position: Position;
  statKey: string;
  statLabel: string;
  line: string;
  setLine: (value: string) => void;
  lean: ReturnType<typeof leanFromLine>;
  confidenceScore: number | null;
  confidenceLabel: 'High' | 'Medium' | 'Low' | null;
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
  const hasProjection = CURRENT_WEEK_PROJECTIONS_READY && stat?.projection !== null && stat?.projection !== undefined;
  const effectiveConfidence = confidenceLabel ?? lean.confidence;
  const matchupLabel = stat?.matchupFactor === undefined || stat?.matchupFactor === null
    ? 'No factor'
    : stat.matchupFactor > 1.05 ? 'Favorable'
      : stat.matchupFactor < 0.95 ? 'Difficult' : 'Neutral';
  const chartData = [
    { label: 'Career baseline', value: stat?.priorAvg ?? null, fill: '#8b97a8' },
    { label: 'Last 5 average', value: stat?.priorLast5 ?? null, fill: '#0878ff' },
    { label: 'Model projection', value: stat?.projection ?? null, fill: '#22d3ee' },
  ].filter((item) => item.value !== null);
  const recentGames = Object.entries(stat ?? {})
    .flatMap(([key, value]) => {
      const match = key.match(/^week(\d+)Actual$/);
      return match && typeof value === 'number'
        ? [{ week: Number(match[1]), value }]
        : [];
    })
    .sort((a, b) => a.week - b.week)
    .slice(-5);

  return (
    <section className="detail-panel">
      <div className="detail-topline">
        <div className="detail-identity">
          <div className="large-avatar">{initials(player.name)}</div>
          <div>
            <div className="detail-kicker">{position} / {statLabel}</div>
            <h2 data-testid="text-selected-player">{player.name}</h2>
            <div className="detail-context"><strong>{player.team}</strong><span>vs</span><strong>{player.week2Opp}</strong><span className="context-home">{stat?.isHome === true ? <><House size={13} /> Home</> : venueLabel(stat?.isHome)}</span></div>
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
              <div className="meter-label"><span>Confidence</span><strong>{confidenceScore === null ? (effectiveConfidence ?? '—') : `${confidenceScore}/100`}</strong></div>
              <div className="meter-track"><span style={{ width: `${confidenceScore ?? (effectiveConfidence === 'High' ? 88 : effectiveConfidence === 'Medium' ? 61 : effectiveConfidence === 'Low' ? 34 : 8)}%` }} /></div>
              <div className="meter-note">Hybrid reliability-adjusted signal strength · 100 means maximum supported signal, not certainty</div>
            </div>
          </div>

          <div className="metrics-grid">
            <MetricCard label="Career baseline" value={stat.priorAvg} sub={stat.nPriorGames ? `${stat.nPriorGames} games on record` : 'No history'} />
            <MetricCard label="Last 5 average" value={stat.priorLast5} sub={stat.priorLast5 && stat.priorAvg ? `${stat.priorLast5 >= stat.priorAvg ? '+' : ''}${formatValue(stat.priorLast5 - stat.priorAvg)} vs career` : 'Not available'} />
            <MetricCard label="Matchup factor" value={stat.matchupFactor === null || stat.matchupFactor === undefined ? null : stat.matchupFactor} suffix="x" sub={matchupLabel} tone={matchupLabel === 'Favorable' ? 'positive' : matchupLabel === 'Difficult' ? 'negative' : undefined} />
            {recentGames.map(({ week, value }) => (
              <MetricCard
                key={week}
                label={`Week ${week} actual`}
                value={value}
                sub={value === null || value === undefined ? 'Not in source data' : `${statLabel.toLowerCase()} logged`}
              />
            ))}
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
              <SignalRow icon={<House size={16} />} label="Venue context" value={stat.isHome === null ? 'Neutral site' : stat.isHome ? 'Home field' : 'On the road'} detail="Included as a model input" />
              <div className="signal-note"><CircleHelp size={14} /><span>Use the projection as a starting point, then inspect what is driving the gap.</span></div>
            </div>
          </div>

          <div className="method-note">
            <div className="method-icon"><Shield size={17} /></div>
            <div><strong>How to read this panel</strong><p>{player.isLowConfidence ? `This player has only ${stat?.nPriorGames ?? 0} prior game${stat?.nPriorGames === 1 ? '' : 's'} in the current-team sample. Treat the projection and baseline comparison as directional.` : 'The model blends career baseline, recent form, home/away context, team performance, and opponent matchup variables selected through cross-validated historical testing.'}{position === 'RB' && statKey === 'rush_yards' ? ' Running-back rushing projections are also blended toward 2026 production according to the current active depth-chart role, with the game-environment adjustment limited to ±10%.' : ''} This dashboard is a trend and matchup research aid — not betting advice.</p></div>
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
      <div><h3>Week 7 {statLabel.toLowerCase()} projection pending</h3><p>The Week 7 schedule and Week 6 results are loaded. This panel will activate after the current Week 7 market lines and projection run are added.</p></div>
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
