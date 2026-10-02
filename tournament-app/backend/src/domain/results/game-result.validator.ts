import { AppError } from '../../middleware/error-handler';
import { UnitValidationContext, UpdateUnitResultDto } from './types';
import { UnitStatus } from '@prisma/client';

export class GameResultValidator {
  /**
   * Validates a proposed unit result update against business rules.
   * Throws AppError(400) if validation fails.
   */
  static validate(context: UnitValidationContext, data: UpdateUnitResultDto): void {
    const { unit, match, participants, config } = context;

    // 1. Integrity: Game must belong to the correct match
    if (unit.matchId !== match.id) {
      throw new AppError('Game does not belong to the specified match', 400);
    }

    // 2. Participant Validation
    if (data.winnerTournamentParticipantId) {
      const isParticipant = participants.some(
        p => p.tournamentParticipantId === data.winnerTournamentParticipantId
      );
      if (!isParticipant) {
        throw new AppError('Winner must be a valid participant of the match', 400);
      }
    }

    // 3. Configuration Checks
    if (data.resultType === 'DRAW') {
      const allowDraws = config.scoring?.drawPoints !== undefined && config.scoring.drawPoints !== null;
      if (!allowDraws) {
        throw new AppError('Draws are not allowed in this tournament configuration', 400);
      }
    }

    if (data.resultType === 'FORFEIT' && !config.results?.allowForfeit) {
      throw new AppError('Forfeits are not allowed in this tournament configuration', 400);
    }

    if (data.resultType === 'ABANDONED' && !config.results?.allowAbandoned) {
      throw new AppError('Abandoned games are not allowed in this tournament configuration', 400);
    }

    if (data.resultType === 'VOID' && !config.results?.allowVoid) {
      throw new AppError('Voiding results is not allowed in this tournament configuration', 400);
    }

    // 4. State Transition Validation
    if (unit.status === 'CONFIRMED' && data.status === 'COMPLETE') {
      throw new AppError('Confirmed results cannot be moved back to COMPLETE. Use DISPUTED or CORRECTION_REQUIRED', 400);
    }
    this.validateStateTransition(unit.status, data.status);
  }

  private static validateStateTransition(from: UnitStatus, to: UnitStatus): void {
    const transitions: Record<UnitStatus, UnitStatus[]> = {
      'SCHEDULED': ['IN_PROGRESS', 'COMPLETE', 'VOID'],
      'IN_PROGRESS': ['PARTIAL', 'COMPLETE', 'VOID'],
      'PARTIAL': ['COMPLETE', 'IN_PROGRESS', 'VOID'],
      'COMPLETE': ['CONFIRMED', 'DISPUTED', 'CORRECTION_REQUIRED', 'VOID'],
      'CONFIRMED': ['DISPUTED', 'CORRECTION_REQUIRED', 'VOID'],
      'DISPUTED': ['COMPLETE', 'VOID'],
      'CORRECTION_REQUIRED': ['PARTIAL', 'COMPLETE', 'VOID'],
      'VOID': ['SCHEDULED'],
    };

    if (!transitions[from]?.includes(to)) {
      throw new AppError(`Invalid state transition from ${from} to ${to}`, 400);
    }
  }
}
