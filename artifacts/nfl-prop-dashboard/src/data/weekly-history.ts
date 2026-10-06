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
    week: 4,
    season: 2026,
    label: 'October 1–5, 2026',
    gamesGraded: 16,
    gamesScheduled: 16,
    allLeans: { wins: 128, losses: 121, pushes: 0 },
    highConfidence: { wins: 54, losses: 24, pushes: 0 },
    topPicks: { wins: 9, losses: 1, pushes: 0 },
    topPickLimit: 10,
    note: 'Final results cover all 16 games. PASS recommendations and props for players without a recorded Week 4 appearance are excluded from the record.',
    picks: [
      { player: 'Lamar Jackson', position: 'QB', stat: 'Pass Yards', lean: 'OVER', line: 215.5, projection: 286.3, actual: 222, result: 'WIN' },
      { player: 'Rhamondre Stevenson', position: 'RB', stat: 'Rush Yards', lean: 'OVER', line: 32.5, projection: 56.1, actual: 47, result: 'WIN' },
      { player: 'Kyren Williams', position: 'RB', stat: 'Rush Yards', lean: 'OVER', line: 58.5, projection: 73.8, actual: 80, result: 'WIN' },
      { player: 'Alvin Kamara', position: 'RB', stat: 'Rush Yards', lean: 'OVER', line: 37.5, projection: 54, actual: 23, result: 'LOSS' },
      { player: 'Garrett Wilson', position: 'WR', stat: 'Rec Yards', lean: 'UNDER', line: 73.5, projection: 51.4, actual: 27, result: 'WIN' },
      { player: 'Garrett Wilson', position: 'WR', stat: 'Receptions', lean: 'UNDER', line: 6.5, projection: 4.4, actual: 3, result: 'WIN' },
      { player: 'Jameson Williams', position: 'WR', stat: 'Rec Yards', lean: 'OVER', line: 50.5, projection: 65.4, actual: 102, result: 'WIN' },
      { player: 'Tee Higgins', position: 'WR', stat: 'Rec Yards', lean: 'OVER', line: 63.5, projection: 81.6, actual: 157, result: 'WIN' },
      { player: 'Rashod Bateman', position: 'WR', stat: 'Rec Yards', lean: 'OVER', line: 25.5, projection: 47, actual: 46, result: 'WIN' },
      { player: 'Kyle Pitts', position: 'TE', stat: 'Rec Yards', lean: 'OVER', line: 28.5, projection: 47.2, actual: 47, result: 'WIN' },
    ],
  },
  {
    week: 3,
    season: 2026,
    label: 'September 24–28, 2026',
    gamesGraded: 16,
    gamesScheduled: 16,
    allLeans: { wins: 131, losses: 141, pushes: 0 },
    highConfidence: { wins: 50, losses: 51, pushes: 0 },
    topPicks: { wins: 5, losses: 5, pushes: 0 },
    topPickLimit: 10,
    note: 'Final results cover all 16 games. PASS recommendations and Jerry Jeudy (no recorded Week 3 appearance) are excluded from the record.',
    picks: [
      { player: 'Patrick Mahomes', position: 'QB', stat: 'Pass Yards', lean: 'OVER', line: 232.5, projection: 330.5, actual: 246, result: 'WIN' },
      { player: 'Brock Purdy', position: 'QB', stat: 'Pass Yards', lean: 'OVER', line: 237.5, projection: 308.5, actual: 297, result: 'WIN' },
      { player: 'Lamar Jackson', position: 'QB', stat: 'Pass Yards', lean: 'OVER', line: 242.5, projection: 324.1, actual: 186, result: 'LOSS' },
      { player: 'Jonathan Taylor', position: 'RB', stat: 'Rush Yards', lean: 'UNDER', line: 81.5, projection: 60.3, actual: 68, result: 'WIN' },
      { player: 'Jonathan Taylor', position: 'RB', stat: 'Receptions', lean: 'UNDER', line: 3.5, projection: 2, actual: 2, result: 'WIN' },
      { player: 'Christian McCaffrey', position: 'RB', stat: 'Rush Yards', lean: 'OVER', line: 57.5, projection: 89.5, actual: 75, result: 'WIN' },
      { player: 'Chuba Hubbard', position: 'RB', stat: 'Rush Yards', lean: 'UNDER', line: 69.5, projection: 51.6, actual: 82, result: 'LOSS' },
      { player: 'Garrett Wilson', position: 'WR', stat: 'Rec Yards', lean: 'UNDER', line: 78.5, projection: 53.3, actual: 107, result: 'LOSS' },
      { player: 'Garrett Wilson', position: 'WR', stat: 'Receptions', lean: 'UNDER', line: 6.5, projection: 4.4, actual: 10, result: 'LOSS' },
      { player: 'Jameson Williams', position: 'WR', stat: 'Rec Yards', lean: 'OVER', line: 54.5, projection: 74.5, actual: 49, result: 'LOSS' },
    ],
  },
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
