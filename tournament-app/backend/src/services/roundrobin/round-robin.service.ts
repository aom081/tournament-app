import { PrismaClient } from '@prisma/client';
import { RoundRobinEngine } from '../../domain/roundrobin/engine';
import { ScheduleOptions } from '../../domain/roundrobin/types';
import { AppError } from '../../middleware/error-handler';
import { TournamentConfiguration } from '../../domain/tournament/configuration';

export class RoundRobinService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generates the full round-robin schedule and persists it to the database.
   */
  async generateSchedule(tournamentId: string, options: ScheduleOptions = { deterministic: true }): Promise<{ totalRounds: number }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    if (tournament.format !== 'ROUND_ROBIN') {
      throw new AppError('Tournament format must be ROUND_ROBIN', 400);
    }

    const participantIds = tournament.participants.map(p => p.id);
    const layout = RoundRobinEngine.generateSchedule(participantIds, options);

    return await this.prisma.$transaction(async (tx) => {
      // Initialize TournamentResults for all participants
      for (const p of tournament.participants) {
        await tx.tournamentResult.upsert({
          where: { tournamentParticipantId: p.id },
          update: { points: 0, wins: 0, losses: 0, draws: 0 },
          create: {
            tournamentId,
            tournamentParticipantId: p.id,
            points: 0,
            wins: 0,
            losses: 0,
            draws: 0,
          },
        });
      }

      // Create Rounds and Matches
      for (const roundLayout of layout.rounds) {
        const round = await tx.round.create({
          data: {
            tournamentId,
            roundNumber: roundLayout.roundNumber,
            name: `Round ${roundLayout.roundNumber}`,
            status: 'PENDING',
          },
        });

        for (const matchLayout of roundLayout.matches) {
          const isBye = matchLayout.p2 === 'BYE' || matchLayout.p1 === 'BYE';
          const p1 = matchLayout.p1 === 'BYE' ? null : matchLayout.p1;
          const p2 = matchLayout.p2 === 'BYE' ? null : matchLayout.p2;

          const match = await tx.match.create({
            data: {
              roundId: round.id,
              matchNumber: matchLayout.matchNumber,
              status: isBye ? 'BYE' : 'SCHEDULED',
              participants: {
                create: [
                  ...(p1 ? [{ tournamentParticipantId: p1, slot: 1 }] : []),
                  ...(p2 ? [{ tournamentParticipantId: p2, slot: 2 }] : []),
                ],
              },
            },
          });

          if (isBye) {
            // Automatically mark bye as completed and advance result
            const winnerId = p1 || p2;
            if (winnerId) {
              await this.updateMatchWinner(match.id, winnerId, tx, tournament.configuration as unknown as TournamentConfiguration);
            }
          }
        }
      }

      return { totalRounds: layout.totalRounds };
    });
  }

  /**
   * Processes the result of a match and updates the standings.
   */
  async processMatchResult(matchId: string, winnerId: string | null, tournamentId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) throw new AppError('Tournament not found', 404);

    await this.prisma.$transaction(async (tx) => {
      await this.updateMatchWinner(matchId, winnerId, tx, tournament.configuration as unknown as TournamentConfiguration);
    });
  }

  private async updateMatchWinner(matchId: string, winnerId: string | null, tx: any, config: TournamentConfiguration): Promise<void> {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: { participants: true },
    });

    if (!match) throw new AppError('Match not found', 404);

    // Update match status
    await tx.match.update({
      where: { id: matchId },
      data: {
        winnerTournamentParticipantId: winnerId,
        status: 'COMPLETED',
      },
    });

    const participants = match.participants;
    if (participants.length < 2) return; // Bye handled differently or missing participant

    const p1 = participants[0].tournamentParticipantId;
    const p2 = participants[1].tournamentParticipantId;

    const scoring = config.scoring;

    if (winnerId === null) {
      // Draw
      await this.updateResult(p1, scoring.drawPoints, 0, 0, 1, tx);
      await this.updateResult(p2, scoring.drawPoints, 0, 0, 1, tx);
    } else if (winnerId === p1) {
      await this.updateResult(p1, scoring.winPoints, 1, 0, 0, tx);
      await this.updateResult(p2, scoring.lossPoints, 0, 1, 0, tx);
    } else if (winnerId === p2) {
      await this.updateResult(p1, scoring.lossPoints, 0, 1, 0, tx);
      await this.updateResult(p2, scoring.winPoints, 1, 0, 0, tx);
    }
  }

  private async updateResult(participantId: string, points: number, wins: number, losses: number, draws: number, tx: any): Promise<void> {
    await tx.tournamentResult.update({
      where: { tournamentParticipantId: participantId },
      data: {
        points: { increment: points },
        wins: { increment: wins },
        losses: { increment: losses },
        draws: { increment: draws },
      },
    });
  }
}
