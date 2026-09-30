import { AuthorizationPrismaClient, createAuthorizationService } from '../src/services/authorization.service';

/**
 * Minimal in-memory fake satisfying AuthorizationPrismaClient. This
 * lets us test real permission-resolution logic (global scope,
 * tournament scope, union of both) without a database or generated
 * Prisma Client.
 */
function createFakeClient() {
  type Role = { id: string; permissionKeys: string[] };
  const roles = new Map<string, Role>();
  const globalAssignments: Array<{ userId: string; roleId: string }> = [];
  const tournamentAssignments: Array<{ userId: string; roleId: string; tournamentId: string }> = [];

  function defineRole(roleId: string, permissionKeys: string[]) {
    roles.set(roleId, { id: roleId, permissionKeys });
  }

  function roleWithPermissions(roleId: string) {
    const role = roles.get(roleId);
    if (!role) throw new Error(`unknown role ${roleId}`);
    return {
      rolePermissions: role.permissionKeys.map((key) => ({ permission: { key } })),
    };
  }

  const client: AuthorizationPrismaClient = {
    userRole: {
      findMany: async ({ where }) => {
        return globalAssignments
          .filter((a) => a.userId === where.userId)
          .map((a) => ({ role: roleWithPermissions(a.roleId) }));
      },
      upsert: async ({ create }) => {
        const exists = globalAssignments.some((a) => a.userId === create.userId && a.roleId === create.roleId);
        if (!exists) globalAssignments.push(create);
        return create;
      },
    },
    tournamentUserRole: {
      findMany: async ({ where }) => {
        return tournamentAssignments
          .filter((a) => a.userId === where.userId && a.tournamentId === where.tournamentId)
          .map((a) => ({ role: roleWithPermissions(a.roleId) }));
      },
      upsert: async ({ create }) => {
        const exists = tournamentAssignments.some(
          (a) => a.userId === create.userId && a.roleId === create.roleId && a.tournamentId === create.tournamentId,
        );
        if (!exists) tournamentAssignments.push(create);
        return create;
      },
    },
  };

  return { client, defineRole, globalAssignments, tournamentAssignments };
}

describe('authorization service', () => {
  it('grants a permission via a global role, with no tournament scope required', async () => {
    const { client, defineRole } = createFakeClient();
    defineRole('platform-admin', ['AUDIT_VIEW', 'TOURNAMENT_VIEW']);
    const service = createAuthorizationService(client);
    await service.assignGlobalRole('user-1', 'platform-admin');

    await expect(service.hasPermission('user-1', 'AUDIT_VIEW')).resolves.toBe(true);
    await expect(service.hasPermission('user-1', 'TOURNAMENT_CREATE')).resolves.toBe(false);
  });

  it('does not grant tournament-scoped permissions globally', async () => {
    const { client, defineRole } = createFakeClient();
    defineRole('organizer', ['TOURNAMENT_MANAGE']);
    const service = createAuthorizationService(client);
    await service.assignTournamentRole('user-1', 'organizer', 'tournament-A');

    // Global check (no tournamentId) must not see tournament-scoped roles.
    await expect(service.hasPermission('user-1', 'TOURNAMENT_MANAGE')).resolves.toBe(false);
    // Scoped check for the correct tournament succeeds.
    await expect(service.hasPermission('user-1', 'TOURNAMENT_MANAGE', 'tournament-A')).resolves.toBe(true);
    // Scoped check for a DIFFERENT tournament must fail -- this is the
    // core flexible-RBAC guarantee: a role in one tournament grants
    // nothing in another.
    await expect(service.hasPermission('user-1', 'TOURNAMENT_MANAGE', 'tournament-B')).resolves.toBe(false);
  });

  it('unions global and tournament-scoped permissions when a tournamentId is given', async () => {
    const { client, defineRole } = createFakeClient();
    defineRole('viewer', ['STANDINGS_VIEW']);
    defineRole('organizer', ['TOURNAMENT_MANAGE']);
    const service = createAuthorizationService(client);
    await service.assignGlobalRole('user-1', 'viewer');
    await service.assignTournamentRole('user-1', 'organizer', 'tournament-A');

    const keys = await service.getEffectivePermissionKeys('user-1', 'tournament-A');
    expect([...keys].sort()).toEqual(['STANDINGS_VIEW', 'TOURNAMENT_MANAGE']);
  });

  it('supports arbitrary custom roles, not just Organizer/Competitor', async () => {
    const { client, defineRole } = createFakeClient();
    defineRole('referee', ['MATCH_RESULT_CONFIRM', 'MATCH_RESULT_CORRECT']);
    const service = createAuthorizationService(client);
    await service.assignTournamentRole('user-1', 'referee', 'tournament-A');

    await expect(service.hasPermission('user-1', 'MATCH_RESULT_CONFIRM', 'tournament-A')).resolves.toBe(true);
    await expect(service.hasPermission('user-1', 'TOURNAMENT_CREATE', 'tournament-A')).resolves.toBe(false);
  });

  it('returns no permissions for a user with no role assignments', async () => {
    const { client } = createFakeClient();
    const service = createAuthorizationService(client);

    await expect(service.hasPermission('nobody', 'TOURNAMENT_VIEW')).resolves.toBe(false);
    const keys = await service.getEffectivePermissionKeys('nobody');
    expect(keys.size).toBe(0);
  });

  it('assigning the same global role twice does not duplicate the assignment', async () => {
    const { client, defineRole, globalAssignments } = createFakeClient();
    defineRole('viewer', ['STANDINGS_VIEW']);
    const service = createAuthorizationService(client);

    await service.assignGlobalRole('user-1', 'viewer');
    await service.assignGlobalRole('user-1', 'viewer');

    expect(globalAssignments.filter((a) => a.userId === 'user-1' && a.roleId === 'viewer')).toHaveLength(1);
  });
});
