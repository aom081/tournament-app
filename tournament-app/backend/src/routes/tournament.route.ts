import { NextFunction, Request, Response, Router } from 'express';

import { authenticate, requirePermission } from '../middleware/auth.instance';
import { AppError } from '../middleware/error-handler';
import { tournamentService } from '../services/tournament.instance';

const router = Router();
const TOURNAMENT_ID_PARAM = { tournamentIdParam: 'tournamentId' } as const;

function parseOptionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(`${field} must be an ISO date string or null`, 400);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${field} is not a valid date`, 400);
  }
  return date;
}

router.post('/tournaments', authenticate, requirePermission('TOURNAMENT_CREATE'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, format, startDate, endDate, configuration } = req.body ?? {};
    if (typeof name !== 'string' || typeof format !== 'string') {
      throw new AppError('name and format are required', 400);
    }
    const tournament = await tournamentService.createTournament({
      name,
      format: format as never,
      createdById: req.user!.id,
      startDate: parseOptionalDate(startDate, 'startDate'),
      endDate: parseOptionalDate(endDate, 'endDate'),
      configuration,
    });
    res.status(201).json({ tournament });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/tournaments/:tournamentId',
  authenticate,
  requirePermission('TOURNAMENT_VIEW', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.getTournamentOrThrow(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/tournaments/:tournamentId',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, startDate, endDate, configuration } = req.body ?? {};
      const tournament = await tournamentService.updateTournament(req.params.tournamentId, {
        name,
        startDate: parseOptionalDate(startDate, 'startDate'),
        endDate: parseOptionalDate(endDate, 'endDate'),
        configuration,
      });
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/tournaments/:tournamentId/readiness',
  authenticate,
  requirePermission('TOURNAMENT_VIEW', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const readiness = await tournamentService.getReadiness(req.params.tournamentId);
      res.status(200).json(readiness);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/registration/open',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.openRegistration(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/participants',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { participantId, seed } = req.body ?? {};
      if (typeof participantId !== 'string') {
        throw new AppError('participantId is required', 400);
      }
      const tournamentParticipant = await tournamentService.registerParticipant(
        req.params.tournamentId,
        participantId,
        typeof seed === 'number' ? seed : null,
      );
      res.status(201).json({ tournamentParticipant });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/tournaments/:tournamentId/participants/:tournamentParticipantId',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournamentParticipant = await tournamentService.removeParticipant(
        req.params.tournamentId,
        req.params.tournamentParticipantId,
      );
      res.status(200).json({ tournamentParticipant });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/registration/lock',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.lockRegistration(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/start',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.startTournament(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/tournaments/:tournamentId/participants',
  authenticate,
  requirePermission('TOURNAMENT_VIEW', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const participants = await tournamentService.getParticipants(req.params.tournamentId);
      res.status(200).json({ participants });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/tournaments/:tournamentId/rounds',
  authenticate,
  requirePermission('TOURNAMENT_VIEW', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rounds = await tournamentService.getRounds(req.params.tournamentId);
      res.status(200).json({ rounds });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/rounds',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const round = await tournamentService.createRound(req.params.tournamentId);
      res.status(201).json({ round });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/complete',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.completeTournament(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/archive',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.archiveTournament(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/tournaments/:tournamentId/cancel',
  authenticate,
  requirePermission('TOURNAMENT_MANAGE', TOURNAMENT_ID_PARAM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tournament = await tournamentService.cancelTournament(req.params.tournamentId);
      res.status(200).json({ tournament });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
