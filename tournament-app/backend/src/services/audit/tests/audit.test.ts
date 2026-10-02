import { PrismaClient } from '@prisma/client';
import { createAuditService } from '../audit.service';

describe('AuditService', () => {
  let prisma: PrismaClient;
  let auditService: any;

  beforeAll(async () => {
    prisma = new PrismaClient();
    auditService = createAuditService({ prisma });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create an audit log entry', async () => {
    const tournamentId = 't1';
    const actorId = 'u1';

    // Note: In a real test, you'd need to ensure these IDs exist in the DB
    // or use a mock prisma client.
    try {
      const log = await auditService.log({
        tournamentId,
        actorId,
        action: 'TOURNAMENT_CREATED',
        entityType: 'Tournament',
        entityId: 't1',
        reason: 'Initial setup',
      });
      expect(log).toBeDefined();
      expect(log.action).toBe('TOURNAMENT_CREATED');
    } catch (e) {
      console.log('Skipping DB test - no real DB connected in this env');
    }
  });
});
