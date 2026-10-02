import { Router } from 'express';
import { createStandingService, StandingService } from '../services/standings.service';
import { authenticate, requirePermission } from '../middleware/auth.instance';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const standingsService = createStandingService({ prisma });

const router = Router();

/**
 * Triggers the bottom-up recalculation chain:
 * Match Results -> Tournament Results -> Rankings
 */
router.post('/recalculate', authenticate, requirePermission('tournament.update_results'), async (req, res, next) => {
  try {
    const { tournamentId } = req.params;

    // 1. Aggregation: Match -> TournamentResult
    await standingsService.updateParticipantResults(tournamentId);

    // 2. Ranking: TournamentResult -> Rank
    await standingsService.calculateRankings(tournamentId);

    res.json({ message: 'Tournament results and rankings recalculated successfully.' });
  } catch (error) {
    next(error);
  }
});

/**
 * Snapshots the current rankings into a publishable Standing record.
 */
router.post('/publish', authenticate, requirePermission('tournament.publish_standings'), async (req, res, next) => {
  try {
    const { tournamentId } = req.params;
    const { roundId } = req.body; // Optional: null for overall standings

    await standingsService.publishStandings(tournamentId, roundId);

    res.json({ message: 'Standings published successfully.' });
  } catch (error) {
    next(error);
  }
});

export default router;
