import { AppError } from '../middleware/error-handler';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
}

export interface AuthServicePrismaClient {
  user: {
    findUnique: (args: { where: { email: string } }) => Promise<UserRecord | null>;
    create: (args: {
      data: { email: string; passwordHash: string; displayName: string };
    }) => Promise<UserRecord>;
  };
}

export interface AuthServiceDeps {
  prisma: AuthServicePrismaClient;
  hashPassword: (plainTextPassword: string) => Promise<string>;
  comparePassword: (plainTextPassword: string, passwordHash: string) => Promise<boolean>;
  signToken: (payload: { sub: string; email: string }) => string;
}

export interface SafeUser {
  id: string;
  email: string;
  displayName: string;
}

function toSafeUser(user: UserRecord): SafeUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function createAuthService(deps: AuthServiceDeps) {
  async function register(email: string, password: string, displayName: string): Promise<SafeUser> {
    const existing = await deps.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('Email is already registered', 409);
    }

    const passwordHash = await deps.hashPassword(password);
    const user = await deps.prisma.user.create({ data: { email, passwordHash, displayName } });
    return toSafeUser(user);
  }

  async function login(email: string, password: string): Promise<{ token: string; user: SafeUser }> {
    const user = await deps.prisma.user.findUnique({ where: { email } });
    // Deliberately identical error for "no such user" and "wrong
    // password" -- distinguishing them would let an attacker enumerate
    // registered email addresses.
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const passwordMatches = await deps.comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = deps.signToken({ sub: user.id, email: user.email });
    return { token, user: toSafeUser(user) };
  }

  return { register, login };
}

export type AuthService = ReturnType<typeof createAuthService>;
