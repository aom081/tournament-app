import { NextFunction, Request, Response } from 'express';

import { AppError } from './error-handler';

export type PermissionChecker = (userId: string, permissionKey: string, tournamentId?: string) => Promise<boolean>;

export interface RequirePermissionOptions {
  /**
   * If set, the permission check is scoped to a tournament, using the
   * route param of this name as the tournament id (e.g. 'tournamentId'
   * for a route like `/tournaments/:tournamentId/...`). If omitted,
   * only the caller's global roles are considered.
   */
  tournamentIdParam?: string;
}

/**
 * Express middleware factory enforcing that the authenticated caller
 * holds a specific permission. Must run after an authentication
 * middleware that populates `req.user`. Takes the permission-check
 * function as a parameter (rather than importing the authorization
 * service singleton directly) so the request-handling logic here can
 * be unit-tested with a fake checker, independent of the database.
 */
export function createRequirePermission(hasPermission: PermissionChecker) {
  return function requirePermission(permissionKey: string, options: RequirePermissionOptions = {}) {
    return async function requirePermissionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
      if (!req.user) {
        next(new AppError('Authentication required', 401));
        return;
      }

      const tournamentId = options.tournamentIdParam ? req.params[options.tournamentIdParam] : undefined;

      try {
        const allowed = await hasPermission(req.user.id, permissionKey, tournamentId);
        if (!allowed) {
          next(new AppError('Forbidden: missing required permission', 403));
          return;
        }
        next();
      } catch (err) {
        next(err);
      }
    };
  };
}
