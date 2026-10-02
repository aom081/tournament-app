export interface MatchFormat {
  type: 'SINGLE' | 'BEST_OF_N';
  bestOf?: number;
  winsRequired: number;
  maxGames: number;
}

export interface MatchResultDetails {
  participantAScore: number;
  participantBScore: number;
  gamesPlayed: number;
  gamesRemaining: number;
  winnerId: string | null;
  loserId: string | null;
  completionReason: 'WINS_REACHED' | 'MAX_GAMES_HIT' | 'FORFEIT' | 'ABANDONED' | 'VOID' | null;
  status: 'SCHEDULED' | 'PARTIAL' | 'COMPLETE';
}
