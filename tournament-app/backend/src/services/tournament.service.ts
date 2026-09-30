import { assessReadiness, assertTransition, ReadinessResult, TournamentStatus } from '../domain/tournament/lifecycle';
import { defaultConfiguration, TournamentConfiguration, TournamentFormat, validateConfiguration } from '../domain/tournament/configuration';
import { AppError } from '../middleware/error-handler';

export interface TournamentRecord {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  configuration: TournamentConfiguration;
  startDate: Date | null;
  endDate: Date | null;
  createdById: string;
}

export type RegistrationStatus = 'REGISTERED' | 'WITHDRAWN' | 'DISQUALIFIED';

export interface TournamentParticipantRecord {
  id: string;
  tournamentId: string;
  participantId: string;
  seed: number | null;
  status: RegistrationStatus;
}

export type RoundStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface RoundRecord {
  id: string;
  tournamentId: string;
  roundNumber: number;
  status: RoundStatus;
}

export interface TournamentServicePrismaClient {
  tournament: {
    create: (args: {
      data: {
        name: string;
        format: TournamentFormat;
        status: TournamentStatus;
        configuration: TournamentConfiguration;
        startDate: Date | null;
        endDate: Date | null;
        createdById: string;
      };
    }) => Promise<TournamentRecord>;
    findUnique: (args: { where: { id: string } }) => Promise<TournamentRecord | null>;
    update: (args: { where: { id: string }; data: Partial<Omit<TournamentRecord, 'id'>> }) => Promise<TournamentRecord>;
  };
  tournamentParticipant: {
    create: (args: {
      data: { tournamentId: string; participantId: string; seed: number | null };
    }) => Promise<TournamentParticipantRecord>;
    findUnique: (args: { where: { id: string } }) => Promise<TournamentParticipantRecord | null>;
    findMany: (args: {
      where: { tournamentId: string; participantId?: string };
    }) => Promise<TournamentParticipantRecord[]>;
    update: (args: {
      where: { id: string };
      data: Partial<Omit<TournamentParticipantRecord, 'id'>>;
    }) => Promise<TournamentParticipantRecord>;
    count: (args: { where: { tournamentId: string; status: RegistrationStatus } }) => Promise<number>;
  };
  participant: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
  };
  round: {
    findMany: (args: { where: { tournamentId: string } }) => Promise<RoundRecord[]>;
    create: (args: { data: { tournamentId: string; roundNumber: number } }) => Promise<RoundRecord>;
  };
}

export interface CreateTournamentInput {
  name: string;
  format: TournamentFormat;
  createdById: string;
  startDate?: Date | null;
  endDate?: Date | null;
  /** Omit to use format defaults (defaultConfiguration); if provided,
   * must be a COMPLETE, valid configuration object (see
   * validateConfiguration -- partial merging with defaults is not
   * performed, to keep validation behavior unambiguous). */
  configuration?: unknown;
}

export interface UpdateTournamentInput {
  name?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  configuration?: unknown;
}

// Tournament updates (name/dates/configuration) are only permitted
// while the tournament hasn't started attracting committed structure
// yet. `format` is deliberately not part of UpdateTournamentInput at
// all -- it is immutable after creation (see docs/tournament/lifecycle.md).
const UPDATABLE_STATUSES: TournamentStatus[] = ['DRAFT', 'REGISTRATION'];

export function createTournamentService(deps: { prisma: TournamentServicePrismaClient }) {
  const { prisma } = deps;

  function resolveConfiguration(format: TournamentFormat, configuration: unknown): TournamentConfiguration {
    return configuration === undefined ? defaultConfiguration(format) : validateConfiguration(configuration);
  }

  async function getTournamentOrThrow(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new AppError('Tournament not found', 404);
    }
    return tournament;
  }

  async function countRegisteredParticipants(tournamentId: string): Promise<number> {
    return prisma.tournamentParticipant.count({ where: { tournamentId, status: 'REGISTERED' } });
  }

  async function createTournament(input: CreateTournamentInput): Promise<TournamentRecord> {
    if (!input.name || input.name.trim().length === 0) {
      throw new AppError('name is required', 400);
    }

    const configuration = resolveConfiguration(input.format, input.configuration);

    return prisma.tournament.create({
      data: {
        name: input.name.trim(),
        format: input.format,
        status: 'DRAFT',
        configuration,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdById: input.createdById,
      },
    });
  }

  async function updateTournament(tournamentId: string, input: UpdateTournamentInput): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);

    if (!UPDATABLE_STATUSES.includes(tournament.status)) {
      throw new AppError(
        `Tournament cannot be updated while in status ${tournament.status}. It can only be updated in: ${UPDATABLE_STATUSES.join(', ')}.`,
        409,
      );
    }

    const data: Partial<Omit<TournamentRecord, 'id'>> = {};

    if (input.name !== undefined) {
      if (!input.name.trim()) {
        throw new AppError('name cannot be empty', 400);
      }
      data.name = input.name.trim();
    }
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.configuration !== undefined) {
      data.configuration = validateConfiguration(input.configuration);
    }

    return prisma.tournament.update({ where: { id: tournamentId }, data });
  }

  /** DRAFT -> REGISTRATION. Not explicitly named as a separate
   * operation in the brief, but required for the six-state pipeline
   * to be reachable at all -- see docs/tournament/lifecycle.md §3. */
  async function openRegistration(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);
    assertTransition(tournament.status, 'REGISTRATION');
    return prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'REGISTRATION' } });
  }

  async function registerParticipant(
    tournamentId: string,
    participantId: string,
    seed: number | null = null,
  ): Promise<TournamentParticipantRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);

    if (tournament.status !== 'REGISTRATION') {
      throw new AppError(`Cannot register a participant while the tournament is in status ${tournament.status}.`, 409);
    }

    const participant = await prisma.participant.findUnique({ where: { id: participantId } });
    if (!participant) {
      throw new AppError('Participant not found', 404);
    }

    const existing = await prisma.tournamentParticipant.findMany({ where: { tournamentId, participantId } });
    if (existing.length > 0) {
      throw new AppError('Participant is already registered for this tournament', 409);
    }

    const { maxParticipants } = tournament.configuration.participants;
    if (maxParticipants !== null) {
      const currentCount = await countRegisteredParticipants(tournamentId);
      if (currentCount >= maxParticipants) {
        throw new AppError('Tournament has reached its configured maximum number of participants', 409);
      }
    }

    return prisma.tournamentParticipant.create({ data: { tournamentId, participantId, seed } });
  }

  async function removeParticipant(
    tournamentId: string,
    tournamentParticipantId: string,
  ): Promise<TournamentParticipantRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);

    if (tournament.status !== 'REGISTRATION') {
      throw new AppError(`Cannot remove a participant while the tournament is in status ${tournament.status}.`, 409);
    }

    const tournamentParticipant = await prisma.tournamentParticipant.findUnique({
      where: { id: tournamentParticipantId },
    });
    if (!tournamentParticipant || tournamentParticipant.tournamentId !== tournamentId) {
      throw new AppError('Tournament participant not found', 404);
    }
    if (tournamentParticipant.status !== 'REGISTERED') {
      throw new AppError('Participant is not currently registered (already withdrawn or disqualified)', 409);
    }

    return prisma.tournamentParticipant.update({ where: { id: tournamentParticipantId }, data: { status: 'WITHDRAWN' } });
  }

  async function getReadiness(tournamentId: string): Promise<ReadinessResult> {
    const tournament = await getTournamentOrThrow(tournamentId);
    const registeredParticipantCount = await countRegisteredParticipants(tournamentId);
    return assessReadiness({ registeredParticipantCount, configuration: tournament.configuration });
  }

  async function lockRegistration(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);
    assertTransition(tournament.status, 'READY');

    const readiness = await getReadiness(tournamentId);
    if (!readiness.isReady) {
      throw new AppError(`Tournament is not ready to lock registration: ${readiness.issues.join('; ')}`, 409);
    }

    return prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'READY' } });
  }

  async function startTournament(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);
    assertTransition(tournament.status, 'IN_PROGRESS');
    return prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'IN_PROGRESS' } });
  }

  /**
   * Creates the next sequential Round for an in-progress tournament.
   * Round *completion* tracking (and therefore any "finish round N
   * before creating round N+1" gate) is out of scope for this phase
   * -- see docs/tournament/lifecycle.md §5 -- so this only enforces
   * tournament status and sequential numbering. The database's own
   * @@unique([tournamentId, roundNumber]) constraint (Phase 1) remains
   * the ultimate backstop against a duplicate round number.
   */
  async function createRound(tournamentId: string): Promise<RoundRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);

    if (tournament.status !== 'IN_PROGRESS') {
      throw new AppError(`Cannot create a round while the tournament is in status ${tournament.status}.`, 409);
    }

    const rounds = await prisma.round.findMany({ where: { tournamentId } });
    const nextRoundNumber = rounds.reduce((max, round) => Math.max(max, round.roundNumber), 0) + 1;

    return prisma.round.create({ data: { tournamentId, roundNumber: nextRoundNumber } });
  }

  async function completeTournament(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);
    assertTransition(tournament.status, 'COMPLETED');
    return prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'COMPLETED' } });
  }

  async function archiveTournament(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);
    assertTransition(tournament.status, 'ARCHIVED');
    return prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'ARCHIVED' } });
  }

  async function cancelTournament(tournamentId: string): Promise<TournamentRecord> {
    const tournament = await getTournamentOrThrow(tournamentId);
    assertTransition(tournament.status, 'CANCELLED');
    return prisma.tournament.update({ where: { id: tournamentId }, data: { status: 'CANCELLED' } });
  }

  return {
    createTournament,
    updateTournament,
    openRegistration,
    registerParticipant,
    removeParticipant,
    getReadiness,
    lockRegistration,
    startTournament,
    createRound,
    completeTournament,
    archiveTournament,
    cancelTournament,
    getTournamentOrThrow,
  };
}

export type TournamentService = ReturnType<typeof createTournamentService>;
