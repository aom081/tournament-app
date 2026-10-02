import { PrismaClient } from '@prisma/client';
import { KnockoutEngine } from '../../domain/knockout/engine';
import { BracketOptions } from '../../domain/knockout/types';
import { AppError } from '../../middleware/error-handler';

export class KnockoutService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generates a new bracket and persists it to the database.
   */
  async generateBracket(tournamentId: string, options: BracketOptions): Promise<{ bracketId: string }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { participants: true },
    });

    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }

    // Order participants by seed if available, otherwise just use the IDs
    const participantIds = tournament.participants
      .sort((a, b) => (a.seed || 0) - (b.seed || 0))
      .map(p => p.id);

    const layout = KnockoutEngine.generateLayout(participantIds, options);

    // Transaction to ensure atomic bracket creation
    return await this.prisma.$transaction(async (tx) => {
      // 1. Create or Update Bracket
      const bracket = await tx.bracket.upsert({
        where: { tournamentId },
        update: {
          size: layout.bracketSize,
          version: { increment: 1 }
        },
        create: {
          tournamentId,
          size: layout.bracketSize
        },
      });

      // 2. Create Rounds and Matches
      for (let rIdx = 0; rIdx < layout.rounds.length; rIdx++) {
        const roundNumber = rIdx + 1;
        const matchesInRound = layout.rounds[rIdx];

        const round = await tx.round.create({
          data: {
            tournamentId,
            roundNumber,
            name: `Knockout Round ${roundNumber}`,
            status: 'PENDING',
          },
        });

        for (const matchLayout of matchesInRound) {
          const match = await tx.match.create({
            data: {
              roundId: round.id,
              matchNumber: matchLayout.matchNumber,
              status: matchLayout.isBye ? 'BYE' : 'SCHEDULED',
              bracketId: bracket.id,
              nextMatchId: matchLayout.nextMatchId,
              participants: {
                create: [
                  ...(matchLayout.participants.slot1 ? [{ tournamentParticipantId: matchLayout.participants.slot1, slot: 1 }] : []),
                  ...(matchLayout.participants.slot2 ? [{ tournamentParticipantId: matchLayout.participants.slot2, slot: 2 }] : []),
                ],
              },
              // If it's a bye, the actual participant is the winner
              winnerTournamentParticipantId: matchLayout.isBye
                ? (matchLayout.participants.slot1 || matchLayout.participants.slot2)
                : null,
            },
          });

          // If it's a bye, we immediately advance the winner to the next match
          if (matchLayout.isBye && match.winnerTournamentParticipantId) {
            await this.advanceWinner(match.id, match.winnerTournamentParticipantId, tx);
          }
        }
      }

      return { bracketId: bracket.id };
    });
  }

  /**
   * Processes a match result and advances the winner.
   */
  async processMatchResult(matchId: string, winnerId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.advanceWinner(matchId, winnerId, tx);
    });
  }

  /**
   * Internal helper to handle the logic of advancing a participant.
   */
  private async advanceWinner(matchId: string, winnerId: string, tx: any): Promise<void> {
    const match = await tx.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new AppError('Match not found', 404);
    }

    // Update the match winner
    await tx.match.update({
      where: { id: matchId },
      data: {
        winnerTournamentParticipantId: winnerId,
        status: 'COMPLETED'
      },
    });

    if (!match.nextMatchId) {
      // This was the final match. Mark tournament as completed if this is the last one.
      const tournament = await tx.tournament.findFirst({
        where: { rounds: { some: { matches: { some: { id: matchId } } } } }
      });
      if (tournament) {
        await tx.tournament.update({
          where: { id: tournament.id },
          data: { status: 'COMPLETED' },
        });
      }
      return;
    }

    // Determine which slot the winner goes into in the next match
    const nextMatch = await tx.match.findUnique({
      where: { id: match.nextMatchId },
    });

    if (!nextMatch) {
      throw new AppError('Next match not found in bracket', 500);
    }

    const targetSlot = match.matchNumber % 2 !== 0 ? 1 : 2;

    // Upsert the participant in the next match
    await tx.matchParticipant.upsert({
      where: {
        matchId_slot: {
          matchId: match.nextMatchId,
          slot: targetSlot
        }
      },
      update: { tournamentParticipantId: winnerId },
      create: {
        matchId: match.nextMatchId,
        tournamentParticipantId: winnerId,
        slot: targetSlot
      },
    });
  }

  /**
   * Handles result correction by recursively updating subsequent matches.
   */
  async correctResult(matchId: string, newWinnerId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.advanceWinner(matchId, newWinnerId, tx);

      // In a real implementation, this would recursively find all matches
      // that were fed by this match and update them.
      // For now, we implement the immediate next step.
    });
  }
}
