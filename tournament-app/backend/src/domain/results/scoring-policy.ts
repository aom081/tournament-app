export enum ScoringLevel {
  MATCH = 'MATCH',
  GAME = 'GAME',
}

export interface ResultScoringPolicy {
  scoringLevel: ScoringLevel;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
}

export interface TournamentResultDetails {
  points: number;
  wins: number;
  losses: number;
  draws: number;
  unitsWon: number;
  unitsLost: number;
}
