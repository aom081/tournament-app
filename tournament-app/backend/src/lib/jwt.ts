import jwt from 'jsonwebtoken';

import { env } from '../config/env';

export interface AuthTokenPayload {
  sub: string;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string' || !decoded || typeof decoded.sub !== 'string' || typeof decoded.email !== 'string') {
    throw new Error('Invalid auth token payload');
  }
  return { sub: decoded.sub, email: decoded.email };
}
