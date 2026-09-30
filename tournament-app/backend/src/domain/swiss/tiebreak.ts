// Swiss standings and tie-break domain logic.
//
// PHASE 5 SCOPE: a pluggable, deterministic ranking system.
// Results are derived from TournamentResult aggregates, not raw matches.
//
// Ranking Flow:
// 1. Sort by primary score (descending).
// 2. For equal scores, iterate through configured TieBreakStrategies.
// 3. Final fallback: Tournament Participant Number (tpn) for absolute determinism.

import { TournamentParticipant } from '@prisma/client';

/**
 * Comprehensive stats for a participant used by tie-break strategies.
 * This is a read-model derived from TournamentResult and Match history.
 */
export interface ParticipantStats {
  tournamentParticipantId: string;
  tpn: number;
  score: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  unitsWon: number;
  unitsLost: number;
  /** History of opponents played and their final/current scores. */
  opponentHistory: Array<{
    tournamentParticipantId: string;
    score: number;
    result: 'WIN' | 'DRAW' | 'LOSS' | 'BYE';
  }>;
}

/**
 * Strategy for breaking a tie between participants with equal primary scores.
 */
export interface TieBreakStrategy {
  name: string;
  /**
   * Calculate a value used for ranking. Higher = better rank.
   * @param participant The participant being evaluated.
   * @param allParticipants The full set of participants in the tournament (for context).
   */
  calculate: (participant: ParticipantStats, allParticipants: ParticipantStats[]) => number;
}

// ---------------------------------------------------------------------------
// Concrete Tie-Break Strategies
// ---------------------------------------------------------------------------

/**
 * Buchholz: The sum of the scores of all opponents played.
 */
export const BuchholzStrategy: TieBreakStrategy = {
  name: 'BUCHHOLZ',
  calculate: (p) => p.opponentHistory.reduce((sum, opp) => sum + opp.score, 0),
};

/**
 * Sonneborn-Berger: Sum of points of opponents defeated + 0.5 * points of opponents drawn.
 */
export const SonnebornBergerStrategy: TieBreakStrategy = {
  name: 'SONNEBORN_BERGER',
  calculate: (p) =>
    p.opponentHistory.reduce((sum, opp) => {
      if (opp.result === 'WIN') return sum + opp.score;
      if (opp.result === 'DRAW') return sum + opp.score * 0.5;
      return sum;
    }, 0),
};

/**
 * Game Differential: Total Units Won minus Total Units Lost.
 */
export const GameDifferentialStrategy: TieBreakStrategy = {
  name: 'GAME_DIFFERENTIAL',
  calculate: (p) => p.unitsWon - p.unitsLost,
};

/**
 * Opponent Score: Simple sum of opponent scores (similar to Buchholz, but often used
 * for specific subsets or variants).
 */
export const OpponentScoreStrategy: TieBreakStrategy = {
  name: 'OPPONENT_SCORE',
  calculate: (p) => p.opponentHistory.reduce((sum, opp) => sum + opp.score, 0),
};

/**
 * Cumulative Score: Sum of the scores of opponents at the time they were played.
 * Note: This requires historical snapshots of scores, which are typically stored
 * in the Round/Match result records.
 */
export const CumulativeScoreStrategy: TieBreakStrategy = {
  name: 'CUMULATIVE_SCORE',
  calculate: (p) => {
    // In a basic implementation, this uses current scores.
    // For a true cumulative score, this would sum scores from the Round data.
    return p.opponentHistory.reduce((sum, opp) => sum + opp.score, 0);
  },
};

// ---------------------------------------------------------------------------
// Tie-Break Resolver
// ---------------------------------------------------------------------------

export const STRATEGY_REGISTRY: Record<string, TieBreakStrategy> = {
  BUCHHOLZ: BuchholzStrategy,
  SONNEBORN_BERGER: SonnebornBergerStrategy,
  GAME_DIFFERENTIAL: GameDifferentialStrategy,
  OPPONENT_SCORE: OpponentScoreStrategy,
  CUMULATIVE_SCORE: CumulativeScoreStrategy,
};

/**
 * Resolves the rank between two participants based on a chain of strategies.
 * Returns > 0 if a is better, < 0 if b is better, 0 if still tied.
 */
export function resolveTie(
  a: ParticipantStats,
  b: ParticipantStats,
  strategies: string[]
): number {
  for (const strategyName of strategies) {
    const strategy = STRATEGY_REGISTRY[strategyName];
    if (!strategy) continue;

    const valA = strategy.calculate(a, []); // context not strictly needed for these basics
    const valB = strategy.calculate(b, []);

    if (valA > valB) return 1;
    if (valB > valA) return -1;
  }

  // Final Deterministic Fallback: TPN (Lower TPN = better rank)
  if (a.tpn < b.tpn) return 1;
  if (b.tpn < a.tpn) return -1;

  return 0;
}

/**
 * Ranks a set of participants deterministically.
 */
export function rankParticipants(
  participants: ParticipantStats[],
  strategies: string[]
): ParticipantStats[] {
  return [...participants].sort((a, b) => {
    // 1. Primary Score (Descending)
    if (a.score > b.score) return -1;
    if (b.score > a.score) return 1;

    // 2. Tie-break chain
    return -resolveTie(a, b, strategies);
  });
}
