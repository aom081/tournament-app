import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error-handler';
import { rankParticipants, ParticipantStats } from '../domain/swiss/tiebreak';

export interface StandingServicePrismaClient extends PrismaClient {}

export function createStandingService(deps: { prisma: StandingServicePrismaClient }) {
  const { prisma } = deps;

  /**
   * Aggregates raw match and unit data into TournamentResult.
   * This is the "Bottom-Up" part of the pipeline.
   * Match Result -> Tournament Result
   */
  async function updateParticipantResults(tournamentId: string): Promise<void> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new AppError('Tournament not found', 404);

    const participants = await prisma.tournamentParticipant.findMany({
      where: { tournamentId },
    });

    const matches = await prisma.match.findMany({
      where: { round: { tournamentId: tournamentId } },
      include: { participants: true },
    });

    const units = await prisma.unit.findMany({
      where: { match: { round: { tournamentId: tournamentId } } },
    });

    const scoring = (tournament.configuration as any).scoring || { win: 1, draw: 0.5, loss: 0 };

    for (const tp of participants) {
      let points = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let unitsWon = 0;
      let unitsLost = 0;

      const tpMatches = matches.filter(m =>
        m.participants.some(p => p.tournamentParticipantId === tp.id)
      );

      for (const match of tpMatches) {
        if (match.status === 'BYE') {
          // Byes typically count as a win in Swiss systems
          points += scoring.win;
          wins++;
        } else if (match.status === 'COMPLETED') {
          if (match.winnerTournamentParticipantId === tp.id) {
            points += scoring.win;
            wins++;
          } else if (!match.winnerTournamentParticipantId) {
            points += scoring.draw;
            draws++;
          } else {
            points += scoring.loss;
            losses++;
          }
        }
      }

      const tpUnits = units.filter(u =>
        u.winnerTournamentParticipantId === tp.id ||
        matches.some(m => m.id === u.matchId && m.participants.some(p => p.tournamentParticipantId === tp.id))
      );

      for (const unit of tpUnits) {
        if (unit.status === 'COMPLETED') {
          if (unit.winnerTournamentParticipantId === tp.id) {
            unitsWon++;
          } else if (unit.winnerTournamentParticipantId) {
            unitsLost++;
          }
        }
      }

      await prisma.tournamentResult.upsert({
        where: { tournamentParticipantId: tp.id },
        create: {
          tournamentId,
          tournamentParticipantId: tp.id,
          points,
          wins,
          draws,
          losses,
          unitsWon,
          unitsLost,
        },
        update: {
          points,
          wins,
          draws,
          losses,
          unitsWon,
          unitsLost,
        },
      });
    }
  }

  /**
   * Orchestrates the ranking engine and updates TournamentResult.rank.
   * Tournament Result -> Tie-break -> Ranking
   */
  async function calculateRankings(tournamentId: string): Promise<void> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new AppError('Tournament not found', 404);

    const results = await prisma.tournamentResult.findMany({
      where: { tournamentId },
      include: { tournamentParticipant: true },
    });

    const matches = await prisma.match.findMany({
      where: { round: { tournamentId: tournamentId } },
      include: { participants: true },
    });

    // Build ParticipantStats for the ranking engine
    const stats: ParticipantStats[] = results.map(res => {
      const tp = res.tournamentParticipant;
      // Use seed as TPN fallback for determinism
      const tpn = tp.seed ?? 0;

      const opponentHistory = matches
        .filter(m => m.participants.some(p => p.tournamentParticipantId === tp.id))
        .map(m => {
          const opp = m.participants.find(p => p.tournamentParticipantId !== tp.id);
          return {
            tournamentParticipantId: opp?.tournamentParticipantId ?? '',
            score: 0, // Filled in second pass
            result: m.winnerTournamentParticipantId === tp.id ? 'WIN' :
                    m.winnerTournamentParticipantId === null ? 'DRAW' : 'LOSS',
          };
        });

      return {
        tournamentParticipantId: tp.id,
        tpn,
        score: res.points,
        wins: res.wins,
        draws: res.draws,
        losses: res.losses,
        byes: 0, // Simplified: aggregated from matches in updateParticipantResults
        unitsWon: res.unitsWon,
        unitsLost: res.unitsLost,
        opponentHistory,
      };
    });

    // Second pass: Fill opponent scores from results
    for (const s of stats) {
      for (const opp of s.opponentHistory) {
        const oppRes = results.find(r => r.tournamentParticipantId === opp.tournamentParticipantId);
        opp.score = oppRes?.points ?? 0;
      }
    }

    const tiebreakCriteria = (tournament.configuration as any).tiebreakCriteria || ['BUCHHOLZ'];
    const ranked = rankParticipants(stats, tiebreakCriteria);

    // Update ranks in DB
    for (let i = 0; i < ranked.length; i++) {
      const resultRecord = results.find(r => r.tournamentParticipantId === ranked[i].tournamentParticipantId);
      if (resultRecord) {
        await prisma.tournamentResult.update({
          where: { id: resultRecord.id },
          data: { rank: i + 1 },
        });
      }
    }
  }

  /**
   * Creates immutable Standing records for the specified round.
   * Ranking -> Standings
   */
  async function publishStandings(tournamentId: string, roundId: string | null): Promise<void> {
    const results = await prisma.tournamentResult.findMany({
      where: { tournamentId },
    });

    // Clear existing standings for this snapshot
    await prisma.standing.deleteMany({
      where: { tournamentId, roundId },
    });

    const standingsData = results.map(res => ({
      tournamentId,
      roundId,
      tournamentParticipantId: res.tournamentParticipantId,
      rank: res.rank ?? 0,
      points: res.points,
    }));

    await prisma.standing.createMany({ data: standingsData });
  }

  return {
    updateParticipantResults,
    calculateRankings,
    publishStandings,
  };
}

export type StandingService = ReturnType<typeof createStandingService>;
