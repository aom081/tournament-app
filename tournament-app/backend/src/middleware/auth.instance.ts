import { verifyAuthToken } from '../lib/jwt';
import { authorizationService } from '../services/authorization.instance';

import { createAuthenticateMiddleware } from './authenticate';
import { createRequirePermission } from './authorize';

export const authenticate = createAuthenticateMiddleware(verifyAuthToken);
export const requirePermission = createRequirePermission(authorizationService.hasPermission);
