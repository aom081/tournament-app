import { signAuthToken } from '../lib/jwt';
import { comparePassword, hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';

import { createAuthService } from './auth.service';

export const authService = createAuthService({
  prisma,
  hashPassword,
  comparePassword,
  signToken: signAuthToken,
});
