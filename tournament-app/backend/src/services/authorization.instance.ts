import { prisma } from '../lib/prisma';

import { createAuthorizationService } from './authorization.service';

export const authorizationService = createAuthorizationService(prisma);
