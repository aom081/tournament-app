import { ScoringLevel, TournamentResultDetails } from './scoring-policy';
import { Match, Unit } from '@prisma/client';

export class TournamentResultCalculator {
  /**
   * Aggregates results for a single participant based on the scoring policy.
   */
  static calculate(
    participantId: string,
    matches: Match[],
    units: Unit[],
    config: {
      scoringLevel: ScoringLevel;
      winPoints: number;
      drawPoints: number;
      lossPoints: number;
    }
  ): TournamentResultDetails {
    let points = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let unitsWon = 0;
    let unitsLost = 0;

    // 1. Calculate Match-level stats
    for (const match of matches) {
      if (match.status === 'VOID' || match.status === 'CANCELLED') {
        continue;
      }

      if (match.winnerTournamentParticipantId === participantId) {
        wins++;
        if (config.scoringLevel === ScoringLevel.MATCH) {
          points += config.winPoints;
        }
      } else if (match.winnerTournamentParticipantId === null && match.status === 'COMPLETE') {
        draws++;
        if (config.scoringLevel === ScoringLevel.MATCH) {
          points += config.drawPoints;
        }
      } else if (match.winnerTournamentParticipantId && match.winnerTournamentParticipantId !== participantId) {
        losses++;
        if (config.scoringLevel === ScoringLevel.MATCH) {
          points += config.lossPoints;
        }
      }
    }

    // 2. Calculate Game-level stats
    for (const unit of units) {
      if (unit.status === 'VOID') continue;

      if (unit.winnerTournamentParticipantId === participantId) {
        unitsWon++;
        if (config.scoringLevel === ScoringLevel.GAME) {
          // In GAME scoring, every unit win earns the match-win point value
          points += config.winPoints;
        }
      } else if (unit.winnerTournamentParticipantId && unit.winnerTournamentParticipantId !== participantId) {
        unitsLost++;
        if (config.scoringLevel === ScoringLevel.GAME) {
          points += config.lossPoints;
        }
      }
    }

    return {
      points,
      wins,
      losses,
      draws,
      unitsWon,
      unitsLost,
    };
  }
}
