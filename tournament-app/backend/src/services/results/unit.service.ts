import { PrismaClient } from '@prisma/client';
import { AppError } from '../../middleware/error-handler';
import { GameResultValidator } from '../../domain/results/game-result.validator';
import { UpdateUnitResultDto } from '../../domain/results/types';

export class UnitService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Updates a game/unit result after strict validation.
   */
  async updateUnitResult(
    unitId: string,
    userId: string,
    data: UpdateUnitResultDto
  ): Promise<any> {
    return await this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({
        where: { id: unitId },
        include: { match: { include: { participants: true } } },
      });

      if (!unit) throw new AppError('Unit not found', 404);

      const tournament = await tx.tournament.findUnique({
        where: { id: unit.match.tournamentId }, // Note: match does not have tournamentId, needs to go through round
      });

      // Since Match doesn't have tournamentId, we fetch via Round
      const round = await tx.round.findUnique({
        where: { id: unit.match.roundId },
      });

      const tournamentData = await tx.tournament.findUnique({
        where: { id: round!.tournamentId },
      });

      if (!tournamentData) throw new AppError('Tournament not found', 404);

      // Perform Domain Validation
      GameResultValidator.validate({
        unit,
        match: unit.match,
        participants: unit.match.participants,
        config: tournamentData.configuration,
      }, data);

      // Determine timestamps
      const updates: any = {
        status: data.status,
        winnerTournamentParticipantId: data.winnerTournamentParticipantId,
        voidReason: data.voidReason,
        updatedById: userId,
      };

      if (data.status === 'COMPLETE' && unit.status !== 'COMPLETE') {
        updates.completedAt = new Date();
      }

      if (data.status === 'CONFIRMED' && unit.status !== 'CONFIRMED') {
        updates.confirmedAt = new Date();
      }

      return await tx.unit.update({
        where: { id: unitId },
        data: updates,
      });
    });
  }
}
