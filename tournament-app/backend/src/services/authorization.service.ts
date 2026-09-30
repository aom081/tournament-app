// Authorization service.
//
// This is a pure factory: it depends only on a minimal structural
// interface (AuthorizationPrismaClient), not on the concrete
// `@prisma/client` package or the app's Prisma singleton. That keeps
// the actual permission-resolution logic unit-testable with a plain
// in-memory fake, independent of whether a database (or even a
// generated Prisma Client) is available.
//
// Permission resolution combines two independent scopes, matching the
// RBAC schema from Phase 1:
//   - global roles   (UserRole)           -> apply everywhere
//   - tournament roles (TournamentUserRole) -> apply only within that
//                                              specific tournament
// A permission check for a given tournament is satisfied by EITHER
// scope; a check with no tournamentId only considers global roles.

interface PermissionRef {
  key: string;
}

interface RolePermissionRef {
  permission: PermissionRef;
}

interface RoleWithPermissions {
  rolePermissions: RolePermissionRef[];
}

interface UserRoleRow {
  role: RoleWithPermissions;
}

interface TournamentUserRoleRow {
  role: RoleWithPermissions;
}

export interface AuthorizationPrismaClient {
  userRole: {
    findMany: (args: {
      where: { userId: string };
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } };
    }) => Promise<UserRoleRow[]>;
    upsert: (args: {
      where: { userId_roleId: { userId: string; roleId: string } };
      update: Record<string, never>;
      create: { userId: string; roleId: string };
    }) => Promise<unknown>;
  };
  tournamentUserRole: {
    findMany: (args: {
      where: { userId: string; tournamentId: string };
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } };
    }) => Promise<TournamentUserRoleRow[]>;
    upsert: (args: {
      where: { userId_roleId_tournamentId: { userId: string; roleId: string; tournamentId: string } };
      update: Record<string, never>;
      create: { userId: string; roleId: string; tournamentId: string };
    }) => Promise<unknown>;
  };
}

const ROLE_PERMISSIONS_INCLUDE = {
  role: { include: { rolePermissions: { include: { permission: true } } } },
} as const;

function collectPermissionKeys(rows: Array<{ role: RoleWithPermissions }>): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const rolePermission of row.role.rolePermissions) {
      keys.add(rolePermission.permission.key);
    }
  }
  return keys;
}

export function createAuthorizationService(client: AuthorizationPrismaClient) {
  async function getGlobalPermissionKeys(userId: string): Promise<Set<string>> {
    const rows = await client.userRole.findMany({
      where: { userId },
      include: ROLE_PERMISSIONS_INCLUDE,
    });
    return collectPermissionKeys(rows);
  }

  async function getTournamentPermissionKeys(userId: string, tournamentId: string): Promise<Set<string>> {
    const rows = await client.tournamentUserRole.findMany({
      where: { userId, tournamentId },
      include: ROLE_PERMISSIONS_INCLUDE,
    });
    return collectPermissionKeys(rows);
  }

  /**
   * All permission keys the user effectively has. When `tournamentId`
   * is omitted, only global roles are considered. When provided, the
   * result is the union of global roles and roles scoped to that
   * specific tournament.
   */
  async function getEffectivePermissionKeys(userId: string, tournamentId?: string): Promise<Set<string>> {
    const globalKeys = await getGlobalPermissionKeys(userId);
    if (!tournamentId) {
      return globalKeys;
    }
    const tournamentKeys = await getTournamentPermissionKeys(userId, tournamentId);
    return new Set([...globalKeys, ...tournamentKeys]);
  }

  async function hasPermission(userId: string, permissionKey: string, tournamentId?: string): Promise<boolean> {
    const keys = await getEffectivePermissionKeys(userId, tournamentId);
    return keys.has(permissionKey);
  }

  async function assignGlobalRole(userId: string, roleId: string): Promise<void> {
    await client.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }

  async function assignTournamentRole(userId: string, roleId: string, tournamentId: string): Promise<void> {
    await client.tournamentUserRole.upsert({
      where: { userId_roleId_tournamentId: { userId, roleId, tournamentId } },
      update: {},
      create: { userId, roleId, tournamentId },
    });
  }

  return {
    getEffectivePermissionKeys,
    hasPermission,
    assignGlobalRole,
    assignTournamentRole,
  };
}

export type AuthorizationService = ReturnType<typeof createAuthorizationService>;
