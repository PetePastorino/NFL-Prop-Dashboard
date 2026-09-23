export type PickResult = 'WIN' | 'LOSS' | 'PUSH';

export type WeeklyPick = {
  player: string;
  position: string;
  stat: string;
  lean: 'OVER' | 'UNDER';
  line: number;
  projection: number;
  actual: number;
  result: PickResult;
};

export type RecordSummary = { wins: number; losses: number; pushes: number };

export type WeeklyHistory = {
  week: number;
  season: number;
  label: string;
  gamesGraded: number;
  gamesScheduled: number;
  allLeans: RecordSummary;
  highConfidence: RecordSummary;
  topPicks: RecordSummary;
  topPickLimit: number;
  picks: WeeklyPick[];
  note?: string;
};

export const WEEKLY_HISTORY: WeeklyHistory[] = [
  {
    week: 2,
    season: 2026,
    label: 'September 20–21, 2026',
    gamesGraded: 16,
    gamesScheduled: 16,
    allLeans: { wins: 35, losses: 27, pushes: 0 },
    highConfidence: { wins: 19, losses: 14, pushes: 0 },
    topPicks: { wins: 8, losses: 2, pushes: 0 },
    topPickLimit: 10,
    note: 'Final results include the Giants–Rams Monday game. PASS recommendations are excluded from the record.',
    picks: [
      { player: 'Rashod Bateman', position: 'WR', stat: 'Rec Yards', lean: 'OVER', line: 9.5, projection: 19.8, actual: 88, result: 'WIN' },
      { player: 'Travis Kelce', position: 'TE', stat: 'Rec Yards', lean: 'OVER', line: 42.5, projection: 57, actual: 101, result: 'WIN' },
      { player: 'Dalton Schultz', position: 'TE', stat: 'Rec Yards', lean: 'OVER', line: 39.5, projection: 57, actual: 140, result: 'WIN' },
      { player: 'Jake Ferguson', position: 'TE', stat: 'Rec Yards', lean: 'OVER', line: 26.5, projection: 38.4, actual: 43, result: 'WIN' },
      { player: 'Hunter Henry', position: 'TE', stat: 'Rec Yards', lean: 'OVER', line: 39.5, projection: 50.8, actual: 40, result: 'WIN' },
      { player: 'Rhamondre Stevenson', position: 'RB', stat: 'Rush Yards', lean: 'OVER', line: 49.5, projection: 63.3, actual: 43, result: 'LOSS' },
      { player: 'Christian McCaffrey', position: 'RB', stat: 'Rush Yards', lean: 'OVER', line: 59.5, projection: 75.4, actual: 23, result: 'LOSS' },
      { player: 'Justin Jefferson', position: 'WR', stat: 'Rec Yards', lean: 'UNDER', line: 79.5, projection: 59.6, actual: 55, result: 'WIN' },
      { player: 'TJ Hockenson', position: 'TE', stat: 'Rec Yards', lean: 'OVER', line: 27.5, projection: 34.4, actual: 29, result: 'WIN' },
      { player: 'Chris Godwin', position: 'WR', stat: 'Rec Yards', lean: 'UNDER', line: 47.5, projection: 36.5, actual: 46, result: 'WIN' },
    ],
  },
];
