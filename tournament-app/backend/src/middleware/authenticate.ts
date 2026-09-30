import { NextFunction, Request, Response } from 'express';

import { AppError } from './error-handler';

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export type AuthTokenVerifier = (token: string) => AuthTokenPayload;

const BEARER_PREFIX = 'Bearer ';

/**
 * Verifies a Bearer token from the Authorization header and attaches
 * `{ id, email }` to `req.user`. Takes the token verifier as a
 * parameter (rather than importing a concrete JWT library directly)
 * so the middleware's request/response handling can be unit-tested
 * with a fake verifier, independent of the real signing mechanism.
 */
export function createAuthenticateMiddleware(verifyToken: AuthTokenVerifier) {
  return function authenticate(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      next(new AppError('Missing or invalid Authorization header', 401));
      return;
    }

    const token = header.slice(BEARER_PREFIX.length);

    try {
      const payload = verifyToken(token);
      req.user = { id: payload.sub, email: payload.email };
      next();
    } catch {
      next(new AppError('Invalid or expired token', 401));
    }
  };
}
