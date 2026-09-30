import { AppError } from '../../src/middleware/error-handler';
import {
  RegistrationStatus,
  RoundRecord,
  TournamentParticipantRecord,
  TournamentRecord,
  TournamentServicePrismaClient,
  createTournamentService,
} from '../../src/services/tournament.service';
import { TournamentStatus } from '../../src/domain/tournament/lifecycle';

function createFakeClient(existingParticipantIds: string[] = ['participant-1', 'participant-2', 'participant-3']) {
  const tournaments: TournamentRecord[] = [];
  const tournamentParticipants: TournamentParticipantRecord[] = [];
  const rounds: RoundRecord[] = [];
  let tournamentSeq = 1;
  let tpSeq = 1;
  let roundSeq = 1;

  const client: TournamentServicePrismaClient = {
    tournament: {
      create: async ({ data }) => {
        const record: TournamentRecord = { id: `tournament-${tournamentSeq++}`, ...data };
        tournaments.push(record);
        return record;
      },
      findUnique: async ({ where }) => tournaments.find((t) => t.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const record = tournaments.find((t) => t.id === where.id);
        if (!record) throw new Error('not found');
        Object.assign(record, data);
        return record;
      },
    },
    tournamentParticipant: {
      create: async ({ data }) => {
        const record: TournamentParticipantRecord = {
          id: `tp-${tpSeq++}`,
          tournamentId: data.tournamentId,
          participantId: data.participantId,
          seed: data.seed,
          status: 'REGISTERED',
        };
        tournamentParticipants.push(record);
        return record;
      },
      findUnique: async ({ where }) => tournamentParticipants.find((tp) => tp.id === where.id) ?? null,
      findMany: async ({ where }) =>
        tournamentParticipants.filter(
          (tp) => tp.tournamentId === where.tournamentId && (where.participantId === undefined || tp.participantId === where.participantId),
        ),
      update: async ({ where, data }) => {
        const record = tournamentParticipants.find((tp) => tp.id === where.id);
        if (!record) throw new Error('not found');
        Object.assign(record, data);
        return record;
      },
      count: async ({ where }) =>
        tournamentParticipants.filter((tp) => tp.tournamentId === where.tournamentId && tp.status === where.status).length,
    },
    participant: {
      findUnique: async ({ where }) => (existingParticipantIds.includes(where.id) ? { id: where.id } : null),
    },
    round: {
      findMany: async ({ where }) => rounds.filter((r) => r.tournamentId === where.tournamentId),
      create: async ({ data }) => {
        const record: RoundRecord = { id: `round-${roundSeq++}`, tournamentId: data.tournamentId, roundNumber: data.roundNumber, status: 'PENDING' };
        rounds.push(record);
        return record;
      },
    },
  };

  return { client, tournaments, tournamentParticipants, rounds };
}

async function expectAppError(promise: Promise<unknown>, statusCode: number): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(statusCode);
    return err as AppError;
  }
  throw new Error('expected promise to reject');
}

describe('tournament service', () => {
  describe('createTournament', () => {
    it('creates a tournament in DRAFT with default configuration when none is given', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });

      const tournament = await service.createTournament({ name: 'Spring Open', format: 'SWISS', createdById: 'user-1' });

      expect(tournament.status).toBe('DRAFT');
      expect(tournament.configuration.pairing.method).toBe('SWISS');
    });

    it('rejects an empty name', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });

      await expectAppError(service.createTournament({ name: '   ', format: 'SWISS', createdById: 'user-1' }), 400);
    });

    it('rejects an invalid explicit configuration', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });

      await expectAppError(
        service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1', configuration: { participants: {} } }),
        400,
      );
    });
  });

  describe('updateTournament', () => {
    it('allows updating in DRAFT', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      const updated = await service.updateTournament(t.id, { name: 'Renamed' });
      expect(updated.name).toBe('Renamed');
    });

    it('allows updating in REGISTRATION', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);

      const updated = await service.updateTournament(t.id, { name: 'Renamed' });
      expect(updated.name).toBe('Renamed');
    });

    it('rejects updates once READY', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');
      await service.lockRegistration(t.id);

      await expectAppError(service.updateTournament(t.id, { name: 'Nope' }), 409);
    });

    it('rejects an empty name on update', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.updateTournament(t.id, { name: '  ' }), 400);
    });

    it('404s for a nonexistent tournament', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      await expectAppError(service.updateTournament('nope', { name: 'X' }), 404);
    });
  });

  describe('openRegistration', () => {
    it('transitions DRAFT -> REGISTRATION', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      const result = await service.openRegistration(t.id);
      expect(result.status).toBe('REGISTRATION');
    });

    it('rejects opening registration twice', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);

      await expectAppError(service.openRegistration(t.id), 409);
    });
  });

  describe('registerParticipant / removeParticipant (registration rules)', () => {
    async function tournamentInRegistration(maxParticipants: number | null = null) {
      const { client, tournamentParticipants } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({
        name: 'X',
        format: 'SWISS',
        createdById: 'user-1',
        configuration:
          maxParticipants === null
            ? undefined
            : { ...defaultConfig(), participants: { minParticipants: 1, maxParticipants, allowLateRegistration: false } },
      });
      await service.openRegistration(t.id);
      return { service, tournament: t, tournamentParticipants };
    }

    function defaultConfig() {
      return {
        participants: { minParticipants: 2, maxParticipants: null, allowLateRegistration: false },
        scoring: { winPoints: 1, drawPoints: 0.5, lossPoints: 0 },
        matchFormat: { unitsPerMatch: 1, winCondition: 'FIXED_UNITS' },
        pairing: { method: 'SWISS', avoidRematches: true },
        tieBreak: { criteria: ['WINS'] },
        resultConfirmation: { requireOpponentConfirmation: true, requireOrganizerConfirmation: false, autoConfirmAfterHours: 24 },
      };
    }

    it('registers a participant while REGISTRATION is open', async () => {
      const { service, tournament } = await tournamentInRegistration();
      const tp = await service.registerParticipant(tournament.id, 'participant-1');
      expect(tp.status).toBe('REGISTERED');
    });

    it('rejects registration before REGISTRATION is opened (DRAFT)', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.registerParticipant(t.id, 'participant-1'), 409);
    });

    it('rejects registering an unknown participant', async () => {
      const { service, tournament } = await tournamentInRegistration();
      await expectAppError(service.registerParticipant(tournament.id, 'ghost'), 404);
    });

    it('rejects duplicate registration of the same participant', async () => {
      const { service, tournament } = await tournamentInRegistration();
      await service.registerParticipant(tournament.id, 'participant-1');
      await expectAppError(service.registerParticipant(tournament.id, 'participant-1'), 409);
    });

    it('enforces the configured maximum participant count', async () => {
      const { service, tournament } = await tournamentInRegistration(1);
      await service.registerParticipant(tournament.id, 'participant-1');
      await expectAppError(service.registerParticipant(tournament.id, 'participant-2'), 409);
    });

    it('removes a registered participant (soft: marks WITHDRAWN, does not delete)', async () => {
      const { service, tournament, tournamentParticipants } = await tournamentInRegistration();
      const tp = await service.registerParticipant(tournament.id, 'participant-1');

      const removed = await service.removeParticipant(tournament.id, tp.id);

      expect(removed.status).toBe('WITHDRAWN');
      expect(tournamentParticipants.find((r) => r.id === tp.id)).toBeDefined();
    });

    it('rejects removing a participant once registration is locked', async () => {
      const { service, tournament } = await tournamentInRegistration();
      const tp = await service.registerParticipant(tournament.id, 'participant-1');
      await service.registerParticipant(tournament.id, 'participant-2');
      await service.lockRegistration(tournament.id);

      await expectAppError(service.removeParticipant(tournament.id, tp.id), 409);
    });

    it('rejects removing an already-withdrawn participant twice', async () => {
      const { service, tournament } = await tournamentInRegistration();
      const tp = await service.registerParticipant(tournament.id, 'participant-1');
      await service.removeParticipant(tournament.id, tp.id);

      await expectAppError(service.removeParticipant(tournament.id, tp.id), 409);
    });

    it('404s when removing a tournamentParticipant id that does not belong to this tournament', async () => {
      const { service, tournament } = await tournamentInRegistration();
      const other = await tournamentInRegistration();
      const otherTp = await other.service.registerParticipant(other.tournament.id, 'participant-1');

      await expectAppError(service.removeParticipant(tournament.id, otherTp.id), 404);
    });
  });

  describe('getReadiness / lockRegistration (start conditions)', () => {
    it('reports not ready below the configured minimum', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');

      const readiness = await service.getReadiness(t.id);
      expect(readiness.isReady).toBe(false);
    });

    it('lockRegistration fails while not ready, and leaves status unchanged', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');

      await expectAppError(service.lockRegistration(t.id), 409);
      const reloaded = await service.getTournamentOrThrow(t.id);
      expect(reloaded.status).toBe('REGISTRATION');
    });

    it('lockRegistration succeeds once the minimum is met, transitioning to READY', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');

      const result = await service.lockRegistration(t.id);
      expect(result.status).toBe('READY');
    });

    it('lockRegistration rejects from a status other than REGISTRATION', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.lockRegistration(t.id), 409);
    });
  });

  describe('startTournament', () => {
    async function readyTournament() {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');
      await service.lockRegistration(t.id);
      return { service, tournament: t };
    }

    it('transitions READY -> IN_PROGRESS', async () => {
      const { service, tournament } = await readyTournament();
      const result = await service.startTournament(tournament.id);
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('rejects starting a tournament that is not READY', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.startTournament(t.id), 409);
    });
  });

  describe('createRound', () => {
    async function inProgressTournament() {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');
      await service.lockRegistration(t.id);
      await service.startTournament(t.id);
      return { service, tournament: t };
    }

    it('creates round 1, then round 2, with sequential numbering', async () => {
      const { service, tournament } = await inProgressTournament();
      const r1 = await service.createRound(tournament.id);
      const r2 = await service.createRound(tournament.id);

      expect(r1.roundNumber).toBe(1);
      expect(r2.roundNumber).toBe(2);
    });

    it('rejects creating a round before the tournament has started', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.createRound(t.id), 409);
    });
  });

  describe('completeTournament', () => {
    it('transitions IN_PROGRESS -> COMPLETED', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');
      await service.lockRegistration(t.id);
      await service.startTournament(t.id);

      const result = await service.completeTournament(t.id);
      expect(result.status).toBe('COMPLETED');
    });

    it('rejects completing a tournament that has not started', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.completeTournament(t.id), 409);
    });
  });

  describe('archiveTournament', () => {
    it('archives a COMPLETED tournament', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');
      await service.lockRegistration(t.id);
      await service.startTournament(t.id);
      await service.completeTournament(t.id);

      const result = await service.archiveTournament(t.id);
      expect(result.status).toBe('ARCHIVED');
    });

    it('archives a CANCELLED tournament', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.cancelTournament(t.id);

      const result = await service.archiveTournament(t.id);
      expect(result.status).toBe('ARCHIVED');
    });

    it('rejects archiving a tournament that is still active', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });

      await expectAppError(service.archiveTournament(t.id), 409);
    });

    it('rejects archiving an already-archived tournament', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.cancelTournament(t.id);
      await service.archiveTournament(t.id);

      await expectAppError(service.archiveTournament(t.id), 409);
    });
  });

  describe('cancelTournament', () => {
    it.each<TournamentStatus>(['DRAFT', 'REGISTRATION', 'READY', 'IN_PROGRESS'])(
      'can cancel from %s',
      async (status) => {
        const { client } = createFakeClient();
        const service = createTournamentService({ prisma: client });
        const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
        if (status !== 'DRAFT') await service.openRegistration(t.id);
        if (status === 'READY' || status === 'IN_PROGRESS') {
          await service.registerParticipant(t.id, 'participant-1');
          await service.registerParticipant(t.id, 'participant-2');
          await service.lockRegistration(t.id);
        }
        if (status === 'IN_PROGRESS') await service.startTournament(t.id);

        const result = await service.cancelTournament(t.id);
        expect(result.status).toBe('CANCELLED');
      },
    );

    it('cannot cancel a COMPLETED tournament', async () => {
      const { client } = createFakeClient();
      const service = createTournamentService({ prisma: client });
      const t = await service.createTournament({ name: 'X', format: 'SWISS', createdById: 'user-1' });
      await service.openRegistration(t.id);
      await service.registerParticipant(t.id, 'participant-1');
      await service.registerParticipant(t.id, 'participant-2');
      await service.lockRegistration(t.id);
      await service.startTournament(t.id);
      await service.completeTournament(t.id);

      await expectAppError(service.cancelTournament(t.id), 409);
    });
  });
});
