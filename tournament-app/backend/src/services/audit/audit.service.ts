import { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/error-handler';

export type AuditAction =
  | 'TOURNAMENT_CREATED' | 'TOURNAMENT_UPDATED' | 'TOURNAMENT_STATUS_CHANGED'
  | 'PARTICIPANT_REGISTERED' | 'PARTICIPANT_REMOVED'
  | 'ROUND_CREATED'
  | 'PAIRING_GENERATED' | 'PAIRING_APPROVED' | 'PAIRING_PUBLISHED' | 'PAIRING_REGENERATED'
  | 'GAME_RESULT_SUBMITTED' | 'GAME_RESULT_CORRECTED' | 'GAME_RESULT_VOIDED'
  | 'MATCH_RESULT_CONFIRMED' | 'MATCH_RESULT_DISPUTED' | 'MATCH_RESULT_CORRECTED'
  | 'STANDINGS_RECALCULATED' | 'STANDINGS_PUBLISHED'
  | 'BRACKET_GENERATED' | 'BRACKET_ADVANCED';

export interface AuditLogParams {
  tournamentId: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  previousState?: any;
  newState?: any;
  reason?: string;
  correlationId?: string;
  tx?: any; // Prisma Transaction Client
}

export function createAuditService(deps: { prisma: PrismaClient }) {
  const { prisma } = deps;

  async function log(params: AuditLogParams) {
    const client = params.tx || prisma;

    try {
      return await client.auditLog.create({
        data: {
          tournamentId: params.tournamentId,
          actorId: params.actorId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          previousState: params.previousState,
          newState: params.newState,
          reason: params.reason,
          correlationId: params.correlationId,
        },
      });
    } catch (error) {
      // We log the error but don't necessarily crash the main transaction
      // unless the business requirement is "no audit, no action".
      // For a high-integrity system, we should let it throw.
      console.error('Audit log failure:', error);
      throw error;
    }
  }

  async function getHistory(filter: { tournamentId?: string; entityId?: string }) {
    return prisma.auditLog.findMany({
      where: {
        tournamentId: filter.tournamentId,
        entityId: filter.entityId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true } },
        tournament: { select: { name: true } },
      },
    });
  }

  return {
    log,
    getHistory,
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
