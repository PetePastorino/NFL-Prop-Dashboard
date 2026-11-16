import model from '@/data/market-over-check.json';

type Position = 'QB' | 'RB' | 'WR' | 'TE';
type Candidate = {
  position: Position;
  statKey: string;
  line: number;
  projection: number;
  priorAvg?: number | null;
  priorLast5?: number | null;
  nPriorGames: number;
  injury: boolean;
  lowHistory: boolean;
};

const clip = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const finiteOrLine = (value: number | null | undefined, line: number) =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : line;

export function marketOverProbability(candidate: Candidate): number {
  const statScale = model.scale[candidate.statKey as keyof typeof model.scale] ?? 30;
  const edge = clip((candidate.projection - candidate.line) / statScale, -3, 3);
  const averageGap = clip((finiteOrLine(candidate.priorAvg, candidate.line) - candidate.line) / statScale, -3, 3);
  const lastFiveGap = clip((finiteOrLine(candidate.priorLast5, candidate.line) - candidate.line) / statScale, -3, 3);
  const features = [
    1,
    Number(candidate.position === 'QB'),
    Number(candidate.position === 'RB'),
    Number(candidate.position === 'WR'),
    Number(candidate.statKey === 'pass_yards'),
    Number(candidate.statKey === 'rush_yards'),
    Number(candidate.statKey === 'rec_yards'),
    edge,
    averageGap,
    lastFiveGap - averageGap,
    Math.min(candidate.nPriorGames, 50) / 50,
    Number(candidate.injury),
    Number(candidate.lowHistory),
  ];
  if (features.length !== model.weights.length) throw new Error('Market check feature count does not match trained weights');
  const logit = model.weights.reduce((sum, weight, index) => sum + weight * features[index], 0);
  return 1 / (1 + Math.exp(-clip(logit, -30, 30)));
}
