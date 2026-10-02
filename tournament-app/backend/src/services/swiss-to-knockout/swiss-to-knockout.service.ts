import { PrismaClient } from '@prisma/client';
import { KnockoutService } from '../knockout/knockout.service';
import { StandingService } from '../standings.service';
import { AppError } from '../../middleware/error-handler';
import { TournamentConfiguration } from '../../domain/tournament/configuration';
import { SeedingRule } from '../../domain/knockout/seeding';

export class SwissToKnockoutService {
  constructor(
    private prisma: PrismaClient,
    private standingService: StandingService,
    private knockoutService: KnockoutService
  ) {}

  /**
   * Prepares the qualification snapshot based on final Swiss standings.
   */
  async proposeQualification(tournamentId: string): Promise<{ snapshotId: string }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) throw new AppError('Tournament not found', 404);

    const config = tournament.configuration as unknown as TournamentConfiguration;
    const topN = (config.qualification?.topN) || 8;

    // 1. Ensure final standings are calculated
    await this.standingService.calculateRankings(tournamentId);

    // 2. Fetch Top N participants
    const qualified = await this.prisma.tournamentResult.findMany({
      where: { tournamentId },
      orderBy: { rank: 'asc' },
      take: topN,
      include: { tournamentParticipant: true },
    });

    const qualifiedParticipants = qualified.map((res, index) => ({
      tournamentParticipantId: res.tournamentParticipantId,
      rank: index + 1,
      score: res.points,
      tieBreakValues: {
        wins: res.wins,
        draws: res.draws,
        losses: res.losses,
      },
      seed: index + 1,
    }));

    // 3. Create snapshot in DRAFT status
    const snapshot = await this.prisma.qualificationSnapshot.create({
      data: {
        tournamentId,
        topN,
        configVersion: '1.0',
        qualifiedParticipants,
        status: 'DRAFT',
      },
    });

    return { snapshotId: snapshot.id };
  }

  /**
   * Finalizes qualification and generates the knockout bracket.
   */
  async finalizeQualification(snapshotId: string): Promise<{ bracketId: string }> {
    const snapshot = await this.prisma.qualificationSnapshot.findUnique({
      where: { id: snapshotId },
      include: { tournament: true },
    });

    if (!snapshot) throw new AppError('Snapshot not found', 404);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Mark snapshot as PUBLISHED
      await tx.qualificationSnapshot.update({
        where: { id: snapshotId },
        data: { status: 'PUBLISHED' },
      });

      // 2. Extract participant IDs in rank order
      const qualifiedIds = (snapshot.qualifiedParticipants as any[])
        .sort((a, b) => a.rank - b.rank)
        .map(p => p.tournamentParticipantId);

      // 3. Generate bracket via KnockoutService
      const config = snapshot.tournament.configuration as unknown as TournamentConfiguration;
      const options = {
        seeding: (config.qualification?.seedingRule === 'RANDOM' ? 'RANDOM' : 'SEEDED'),
        bracketSize: snapshot.topN,
      };

      const { bracketId } = await this.knockoutService.generateBracket(snapshot.tournamentId, options);

      // 4. Update tournament status to IN_PROGRESS (if it was in a review state)
      await tx.tournament.update({
        where: { id: snapshot.tournamentId },
        data: { status: 'IN_PROGRESS' },
      });

      return { bracketId };
    });
  }
}
